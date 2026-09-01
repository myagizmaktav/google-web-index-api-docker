import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoogleClients } from "../google-client.js";
import { isIndexed } from "../is-indexed.js";

/** Minimal stub exposing only the call path isIndexed uses. */
const clientsReturning = (coverageState?: string): GoogleClients =>
  ({
    searchConsole: {
      urlInspection: {
        index: {
          inspect: async () => ({
            data: { inspectionResult: { indexStatusResult: { coverageState } } },
          }),
        },
      },
    },
  }) as unknown as GoogleClients;

const clientsThrowing = (): GoogleClients =>
  ({
    searchConsole: {
      urlInspection: {
        index: {
          inspect: async () => {
            throw new Error("boom");
          },
        },
      },
    },
  }) as unknown as GoogleClients;

const check = (coverageState?: string) =>
  isIndexed({
    link: "https://example.com/page",
    siteUrl: "sc-domain:example.com",
    clients: clientsReturning(coverageState),
  });

describe("isIndexed", () => {
  it("reports an indexed URL", async () => {
    assert.equal(await check("Submitted and indexed"), true);
  });

  it("does not treat 'Submitted, not indexed' as indexed", async () => {
    // A substring match on "Submitted" alone would wrongly skip this URL.
    assert.equal(await check("Submitted, not indexed"), false);
  });

  it("reports a crawled but unindexed URL as not indexed", async () => {
    assert.equal(await check("Crawled - currently not indexed"), false);
  });

  it("reports an unknown URL as not indexed", async () => {
    assert.equal(await check("URL is unknown to Google"), false);
  });

  it("treats a missing coverage state as not indexed", async () => {
    assert.equal(await check(undefined), false);
  });

  it("falls back to not indexed when the API errors", async () => {
    const result = await isIndexed({
      link: "https://example.com/page",
      siteUrl: "sc-domain:example.com",
      clients: clientsThrowing(),
    });
    assert.equal(result, false);
  });
});
