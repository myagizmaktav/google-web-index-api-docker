import Sitemapper from "sitemapper";

export interface GetSitemapArrayOptions {
  sitemapLink: string;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
  /** Number of retries for a failing sitemap request. */
  retries?: number;
  /** Regular expressions matched against each URL; matches are dropped. */
  exclusions?: RegExp[];
  debug?: boolean;
}

/**
 * Fetches every URL referenced by a sitemap, following sitemap index files.
 *
 * Returns a de-duplicated list of absolute URLs. Partial failures (a single
 * child sitemap timing out, for example) are logged and the remaining URLs are
 * still returned, so one bad shard does not abort the whole run.
 */
export const getSitemapArray = async ({
  sitemapLink,
  timeout = 30_000,
  retries = 2,
  exclusions,
  debug = false,
}: GetSitemapArrayOptions): Promise<string[]> => {
  const sitemap = new Sitemapper({
    timeout,
    retries,
    debug,
    ...(exclusions ? { exclusions } : {}),
  });

  const { sites, errors } = await sitemap.fetch(sitemapLink);

  if (errors?.length) {
    for (const error of errors) {
      console.warn(`Sitemap warning for ${error.url}: ${error.type}`);
    }
  }

  // `sites` is typed as string[] | SitemapperSiteData[]; without the `fields`
  // option it is always string[].
  const urls = sites as string[];

  return [...new Set(urls.filter((url) => typeof url === "string" && url))];
};
