import { loadConfig, type Config, type SitemapTarget } from "./config.js";
import { createGoogleClients, type GoogleClients } from "./google-client.js";
import { getSitemapArray } from "./get-sitemap-array.js";
import { isIndexed } from "./is-indexed.js";
import { sendIndexRequest } from "./send-index-request.js";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fisher-Yates shuffle over a copy of the input.
 *
 * The original code picked a random offset and walked forward while splicing
 * the array it was iterating, which skipped entries and could loop forever.
 * Shuffling once and taking a slice gives the same "spread submissions across
 * the sitemap" behaviour without mutating anything mid-iteration.
 */
const shuffle = <T>(items: readonly T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
};

interface Candidate {
  link: string;
  siteUrl: string;
}

interface RunSummary {
  submitted: number;
  alreadyIndexed: number;
  failed: number;
  quotaExceeded: boolean;
  authFailed: boolean;
}

/**
 * Collects candidate URLs from every configured sitemap.
 *
 * A sitemap that fails to load is reported and skipped so the remaining
 * targets still get processed. URLs are shuffled per sitemap and then
 * interleaved, so with several sitemaps the shared daily quota is spread
 * across all of them instead of being consumed entirely by the first.
 */
const collectCandidates = async (
  targets: SitemapTarget[],
  debug: boolean
): Promise<Candidate[]> => {
  const perTarget = await Promise.all(
    targets.map(async ({ sitemapLink, siteUrl }) => {
      try {
        const links = await getSitemapArray({ sitemapLink, debug });
        console.log(
          `Found ${links.length} links in ${sitemapLink} (property: ${siteUrl}).`
        );
        return shuffle(links).map((link) => ({ link, siteUrl }));
      } catch (error) {
        console.error(
          `Failed to read sitemap ${sitemapLink}:`,
          error instanceof Error ? error.message : error
        );
        return [];
      }
    })
  );

  // Round-robin interleave so each sitemap gets a fair share of the quota.
  const interleaved: Candidate[] = [];
  const longest = Math.max(0, ...perTarget.map((list) => list.length));

  for (let i = 0; i < longest; i++) {
    for (const list of perTarget) {
      const candidate = list[i];
      if (candidate) interleaved.push(candidate);
    }
  }

  return interleaved;
};

const runIndexingPass = async (
  config: Config,
  clients: GoogleClients
): Promise<RunSummary> => {
  console.log("Starting the indexing process...");

  const candidates = await collectCandidates(config.targets, config.debug);

  const summary: RunSummary = {
    submitted: 0,
    alreadyIndexed: 0,
    failed: 0,
    quotaExceeded: false,
    authFailed: false,
  };

  if (candidates.length === 0) {
    console.warn("No links found in any sitemap; nothing to do.");
    return summary;
  }

  console.log(
    `Processing ${candidates.length} links across ${config.targets.length} ` +
      `sitemap(s), daily limit ${config.dailyLimit}.`
  );

  for (const { link, siteUrl } of candidates) {
    if (summary.submitted >= config.dailyLimit) {
      console.log(`Daily limit of ${config.dailyLimit} submissions reached.`);
      break;
    }

    if (await isIndexed({ link, siteUrl, clients })) {
      summary.alreadyIndexed++;
      if (config.debug) console.log(`Already indexed, skipping: ${link}`);
      continue;
    }

    const result = await sendIndexRequest({ link, clients });

    if (result.ok) {
      summary.submitted++;
      console.log(
        `[${summary.submitted}/${config.dailyLimit}] Submitted: ${link}`
      );
    } else {
      summary.failed++;
      console.warn(`Failed to submit ${link}: ${result.message}`);

      if (result.quotaExceeded) {
        console.warn("Indexing API quota exhausted; stopping this pass.");
        summary.quotaExceeded = true;
        break;
      }

      if (result.authFailed) {
        // Every remaining URL would fail identically, so stop rather than
        // burning the whole sitemap on the same error.
        if (result.ownershipFailed) {
          console.error(
            `The service account is not an owner of ${siteUrl}. In Search ` +
              "Console open Settings > Users and permissions, add the " +
              "service account email, and set its permission to Owner - " +
              "Full is not enough for the Indexing API. A property may have " +
              "any number of owners, so this does not affect existing ones. " +
              "Run `npm run check-access` to confirm the level is siteOwner. " +
              "If the site is registered as a URL-prefix property rather " +
              "than a domain property, set SITE_URL to that exact property."
          );
        } else {
          console.error(
            "The service account credentials were rejected. Check that the " +
              "account still exists, its key is current, and that the " +
              "Indexing and Search Console APIs are enabled for the project."
          );
        }
        summary.authFailed = true;
        break;
      }
    }

    // Spread requests out so a full pass does not burst against the API.
    await sleep(config.requestDelayMs);
  }

  return summary;
};

const start = async (): Promise<void> => {
  const config = loadConfig();

  // Built once: a single JWT caches its access token across every request.
  const clients = createGoogleClients({
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
  });

  let lastSummary: RunSummary | undefined;

  for (;;) {
    try {
      const summary = await runIndexingPass(config, clients);
      lastSummary = summary;

      console.log(
        `Indexing pass finished at ${new Date().toISOString()}: ` +
          `${summary.submitted} submitted, ` +
          `${summary.alreadyIndexed} already indexed, ` +
          `${summary.failed} failed.`
      );
    } catch (error) {
      // Keep the container alive: a transient failure (network, expired token,
      // sitemap outage) should not end the schedule.
      console.error("Indexing pass failed:", error);
    }

    if (config.runOnce) {
      // Surface a failed single-shot run as a non-zero exit for CI and for
      // one-off `RUN_ONCE=true` container runs.
      if (lastSummary?.authFailed) {
        throw new Error("Run finished with an authentication failure.");
      }
      return;
    }

    const intervalMs = config.intervalHours * 3_600_000;
    const nextRun = new Date(Date.now() + intervalMs);
    console.log(`Next indexing process will start at ${nextRun.toISOString()}`);

    await sleep(intervalMs);
  }
};

start().catch((error) => {
  // Configuration errors are fatal and must surface as a non-zero exit so the
  // container restarts (or stops) instead of idling silently.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
