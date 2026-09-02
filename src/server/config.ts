/** Google's documented per-project daily quota for the Indexing API. */
export const DEFAULT_DAILY_LIMIT = 200;

export interface SitemapTarget {
  /** Sitemap URL to crawl. */
  sitemapLink: string;
  /** Search Console property this sitemap's URLs belong to. */
  siteUrl: string;
}

export interface Config {
  targets: SitemapTarget[];
  clientEmail: string;
  privateKey: string;
  dailyLimit: number;
  requestDelayMs: number;
  intervalHours: number;
  runOnce: boolean;
  debug: boolean;
}

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const readNumber = (name: string, fallback: number): number => {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number, received "${raw}"`);
  }
  return parsed;
};

/**
 * Decodes the service account private key from PRIVATE_KEY_BTOA.
 *
 * Deployment panels (Coolify, Portainer, Dokploy) mangle multi-line secrets in
 * different ways, so this accepts every shape they produce:
 *   - base64 of the PEM, with or without line wrapping (`base64` without -w0
 *     wraps at 76 columns, and some panels re-wrap long values themselves)
 *   - a raw PEM pasted directly
 *   - either form wrapped in single or double quotes by the panel
 *   - literal `
` escapes instead of real newlines, as stored in the
 *     service account JSON
 */
export const decodePrivateKey = (encoded: string): string => {
  // Strip surrounding quotes a panel may have added around the whole value.
  const unquoted = encoded
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .trim();

  const looksLikePem = unquoted.includes("-----BEGIN");

  // Base64 payloads carry no meaningful whitespace, so drop any the panel or
  // the `base64` command introduced. A PEM's newlines must survive, so only
  // non-PEM input is stripped.
  const decoded = looksLikePem
    ? unquoted
    : Buffer.from(unquoted.replace(/\s+/g, ""), "base64").toString("utf8");

  // Panels store PEM newlines as literal backslash-n; normalise both those
  // and real CRLF endings to plain newlines.
  const key = decoded
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .trim();

  if (!/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error(
      "PRIVATE_KEY_BTOA did not decode to a PEM private key. " +
        "Expected the base64 of the service account's private_key field. " +
        "If your panel mangles multi-line values, re-encode with no line " +
        "wrapping: base64 -w0"
    );
  }

  if (!/-----END [A-Z ]*PRIVATE KEY-----/.test(key)) {
    throw new Error(
      "PRIVATE_KEY_BTOA decoded to a truncated PEM (no END line). " +
        "The value was most likely cut off when it was pasted into your " +
        "deployment panel."
    );
  }

  return key;
};

/**
 * Derives the Search Console property identifier for a sitemap URL.
 *
 * Defaults to the domain property (`sc-domain:example.com`) using the full
 * hostname, so multi-part public suffixes (`example.co.uk`) work without
 * special casing.
 */
export const deriveSiteUrl = (sitemapLink: string): string => {
  const { hostname } = new URL(sitemapLink);
  return `sc-domain:${hostname.replace(/^www\./, "")}`;
};

/**
 * Splits a comma/newline separated environment value into trimmed entries.
 */
const splitList = (value: string): string[] =>
  value
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Builds the sitemap targets from SITEMAP_LINK (one or more, comma or newline
 * separated).
 *
 * Each entry is either a bare sitemap URL, in which case the Search Console
 * property is derived from its hostname, or an explicit `sitemap|property`
 * pair for sites registered as a URL-prefix property. A single global SITE_URL
 * still overrides the derivation for every entry, which keeps the previous
 * single-sitemap behaviour working unchanged.
 */
export const parseTargets = (
  rawSitemapLinks: string,
  siteUrlOverride?: string
): SitemapTarget[] => {
  const entries = splitList(rawSitemapLinks);

  if (entries.length === 0) {
    throw new Error("SITEMAP_LINK did not contain any sitemap URLs");
  }

  const override = siteUrlOverride?.trim();

  if (override && entries.length > 1) {
    throw new Error(
      "SITE_URL cannot be used with multiple sitemaps. Use the " +
        '"<sitemap>|<property>" form in SITEMAP_LINK to pair each sitemap ' +
        "with its Search Console property."
    );
  }

  const targets = entries.map((entry) => {
    const [link, explicitProperty] = entry.split("|").map((part) => part.trim());

    if (!link) {
      throw new Error(`Invalid SITEMAP_LINK entry: "${entry}"`);
    }

    // Fail fast on a malformed URL rather than deep inside the sitemap fetch.
    new URL(link);

    return {
      sitemapLink: link,
      siteUrl: explicitProperty || override || deriveSiteUrl(link),
    };
  });

  const seen = new Set<string>();
  for (const target of targets) {
    if (seen.has(target.sitemapLink)) {
      throw new Error(`Duplicate sitemap in SITEMAP_LINK: ${target.sitemapLink}`);
    }
    seen.add(target.sitemapLink);
  }

  return targets;
};

export const loadConfig = (): Config => {
  return {
    targets: parseTargets(requireEnv("SITEMAP_LINK"), process.env.SITE_URL),
    clientEmail: requireEnv("SERVICE_CLIENT_EMAIL"),
    privateKey: decodePrivateKey(requireEnv("PRIVATE_KEY_BTOA")),
    dailyLimit: readNumber("DAILY_LIMIT", DEFAULT_DAILY_LIMIT),
    requestDelayMs: readNumber("REQUEST_DELAY_SECONDS", 15) * 1000,
    intervalHours: readNumber("INTERVAL_HOURS", 25),
    runOnce: process.env.RUN_ONCE === "true",
    debug: process.env.DEBUG === "true",
  };
};
