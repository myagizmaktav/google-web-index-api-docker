import Sitemapper from "@myagizmaktav/sitemapper";
export const getSitemapArray = async ({
  sitemapLink,
}: {
  sitemapLink: string;
}) => {
  const sitemap = new Sitemapper({
    requestHeaders: {
      ...{},
    },
  });

  const xmlFetch = await sitemap.fetch(sitemapLink).then((data) => data.sites);

  return xmlFetch;
};
