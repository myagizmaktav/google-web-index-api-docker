import type { GoogleClients } from "./google-client.js";

/**
 * Coverage states that mean the URL is in Google's index.
 *
 * Matching is exact (case-insensitively) rather than substring based: several
 * negative states contain an indexed state as a substring, so
 * "Submitted, not indexed" and "Crawled - currently not indexed" would both
 * pass a naive `includes()` check and cause the URL to be skipped.
 */
const INDEXED_COVERAGE_STATES = new Set([
  "submitted and indexed",
  "indexed, not submitted in sitemap",
  "indexed",
]);

export interface IsIndexedOptions {
  link: string;
  siteUrl: string;
  clients: GoogleClients;
}

/**
 * Asks the URL Inspection API whether a link is already indexed.
 *
 * On an API error this returns `false` so the caller falls through to
 * submitting the URL. Re-submitting an already indexed page is harmless;
 * skipping an unindexed one is not.
 */
export async function isIndexed({
  link,
  siteUrl,
  clients,
}: IsIndexedOptions): Promise<boolean> {
  try {
    const response = await clients.searchConsole.urlInspection.index.inspect({
      requestBody: {
        inspectionUrl: link,
        languageCode: "en-US",
        siteUrl,
      },
    });

    const coverageState =
      response.data.inspectionResult?.indexStatusResult?.coverageState;

    if (!coverageState) return false;

    return INDEXED_COVERAGE_STATES.has(coverageState.trim().toLowerCase());
  } catch (error) {
    console.warn(
      `Could not inspect ${link}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return false;
  }
}
