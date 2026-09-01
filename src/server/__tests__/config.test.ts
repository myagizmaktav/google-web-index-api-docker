import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decodePrivateKey, deriveSiteUrl, parseTargets } from "../config.js";

const PEM = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN\n-----END PRIVATE KEY-----";

describe("decodePrivateKey", () => {
  it("decodes a base64 encoded key", () => {
    const encoded = Buffer.from(PEM, "utf8").toString("base64");
    assert.equal(decodePrivateKey(encoded), PEM);
  });

  it("accepts a raw PEM without double decoding", () => {
    assert.equal(decodePrivateKey(PEM), PEM);
  });

  it("unescapes literal backslash-n sequences from service account JSON", () => {
    const escaped = PEM.replace(/\n/g, "\\n");
    const encoded = Buffer.from(escaped, "utf8").toString("base64");
    assert.equal(decodePrivateKey(encoded), PEM);
  });

  it("rejects input that does not decode to a PEM", () => {
    const encoded = Buffer.from("not a key", "utf8").toString("base64");
    assert.throws(() => decodePrivateKey(encoded), /did not decode to a PEM/);
  });

  it("tolerates line-wrapped base64 (base64 without -w0)", () => {
    const raw = Buffer.from(PEM, "utf8").toString("base64");
    const wrapped = raw.replace(/(.{10})/g, "$1\n");
    assert.equal(decodePrivateKey(wrapped), PEM);
  });

  it("tolerates base64 containing spaces added by a panel", () => {
    const raw = Buffer.from(PEM, "utf8").toString("base64");
    const spaced = raw.replace(/(.{8})/g, "$1 ");
    assert.equal(decodePrivateKey(spaced), PEM);
  });

  it("strips double quotes wrapped around the value", () => {
    const encoded = Buffer.from(PEM, "utf8").toString("base64");
    assert.equal(decodePrivateKey(`"${encoded}"`), PEM);
  });

  it("strips single quotes wrapped around a raw PEM", () => {
    assert.equal(decodePrivateKey(`'${PEM}'`), PEM);
  });

  it("normalises CRLF line endings", () => {
    const crlf = PEM.replace(/\n/g, "\r\n");
    const encoded = Buffer.from(crlf, "utf8").toString("base64");
    assert.equal(decodePrivateKey(encoded), PEM);
  });

  it("reports a truncated PEM distinctly from a malformed one", () => {
    const truncated = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADAN";
    const encoded = Buffer.from(truncated, "utf8").toString("base64");
    assert.throws(() => decodePrivateKey(encoded), /truncated PEM/);
  });
});

describe("deriveSiteUrl", () => {
  it("keeps multi-part public suffixes intact", () => {
    assert.equal(
      deriveSiteUrl("https://example.co.uk/sitemap.xml"),
      "sc-domain:example.co.uk"
    );
  });

  it("handles hyphenated hostnames", () => {
    assert.equal(
      deriveSiteUrl("https://my-site.com/sitemap.xml"),
      "sc-domain:my-site.com"
    );
  });

  it("strips a www prefix", () => {
    assert.equal(
      deriveSiteUrl("https://www.example.com/sitemap.xml"),
      "sc-domain:example.com"
    );
  });

  it("preserves subdomains", () => {
    assert.equal(
      deriveSiteUrl("https://blog.example.com/sitemap.xml"),
      "sc-domain:blog.example.com"
    );
  });
});

describe("parseTargets", () => {
  it("derives the property for a single sitemap", () => {
    assert.deepEqual(parseTargets("https://example.com/sitemap.xml"), [
      {
        sitemapLink: "https://example.com/sitemap.xml",
        siteUrl: "sc-domain:example.com",
      },
    ]);
  });

  it("honours a SITE_URL override for a single sitemap", () => {
    assert.deepEqual(
      parseTargets("https://example.com/sitemap.xml", "https://example.com/"),
      [
        {
          sitemapLink: "https://example.com/sitemap.xml",
          siteUrl: "https://example.com/",
        },
      ]
    );
  });

  it("splits a comma separated list", () => {
    const targets = parseTargets(
      "https://a.com/sitemap.xml, https://b.com/sitemap.xml"
    );
    assert.deepEqual(targets.map((t) => t.siteUrl), [
      "sc-domain:a.com",
      "sc-domain:b.com",
    ]);
  });

  it("splits a newline separated list", () => {
    const targets = parseTargets(
      "https://a.com/sitemap.xml\nhttps://b.com/sitemap.xml"
    );
    assert.equal(targets.length, 2);
  });

  it("supports per-entry property pairing", () => {
    const targets = parseTargets(
      "https://a.com/sitemap.xml|https://a.com/shop/, https://b.com/sitemap.xml"
    );
    assert.deepEqual(targets, [
      {
        sitemapLink: "https://a.com/sitemap.xml",
        siteUrl: "https://a.com/shop/",
      },
      {
        sitemapLink: "https://b.com/sitemap.xml",
        siteUrl: "sc-domain:b.com",
      },
    ]);
  });

  it("rejects a global SITE_URL alongside multiple sitemaps", () => {
    assert.throws(
      () =>
        parseTargets(
          "https://a.com/sitemap.xml, https://b.com/sitemap.xml",
          "https://a.com/"
        ),
      /cannot be used with multiple sitemaps/
    );
  });

  it("rejects duplicate sitemaps", () => {
    assert.throws(
      () =>
        parseTargets("https://a.com/sitemap.xml, https://a.com/sitemap.xml"),
      /Duplicate sitemap/
    );
  });

  it("rejects an empty value", () => {
    assert.throws(() => parseTargets("  ,  "), /did not contain any sitemap/);
  });

  it("rejects a malformed URL", () => {
    assert.throws(() => parseTargets("not-a-url"));
  });
});
