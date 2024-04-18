import { getSitemapArray } from "./get-sitemap-array";
import { isIndexed } from "./is-indexed";
import { sendIndexRequest } from "./send-index-request";
import dotenv from "dotenv";
const getRandomIndex = ({
  indexLength,
  randomIndex,
}: {
  indexLength: number;
  randomIndex: number;
}) => {
  let randomIndexNumber = Math.floor(Math.random() * indexLength);
  if (indexLength < 200) return 0;

  if (
    randomIndexNumber + 200 > indexLength ||
    randomIndexNumber === randomIndex
  ) {
    return getRandomIndex({ indexLength, randomIndex });
  }

  return randomIndexNumber;
};
const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const start = async () => {
  dotenv.config();

  if (
    !(
      process.env.SITEMAP_LINK &&
      process.env.SERVICE_CLIENT_EMAIL &&
      process.env.PRIVATE_KEY_BTOA
    )
  ) {
    throw new Error("Please provide the necessary environment variables");
  }

  const privateKey = atob(process.env.PRIVATE_KEY_BTOA).replace(/\\n/g, "\n");
  const clientEmail = process.env.SERVICE_CLIENT_EMAIL;
  const sitemapLink = process.env.SITEMAP_LINK;

  console.log("Starting the indexing process...");

  const sitemapLinksArray = await getSitemapArray({
    sitemapLink: sitemapLink,
  });

  if (sitemapLinksArray.length) {
    console.log(
      `Sitemap links fetched successfully and finded ${sitemapLinksArray.length} links.`
    );
  }

  let randomIndex = getRandomIndex({
    indexLength: sitemapLinksArray.length - 1,
    randomIndex: 0,
  });
  let limitIndex =
    sitemapLinksArray.length < 200 ? sitemapLinksArray.length : 200;

  for (let index = randomIndex; limitIndex >= 0; index++) {
    if (sitemapLinksArray.length === 0) {
      console.log("All links are indexed.");
      break;
    }
    if (sitemapLinksArray[index]) {
      console.log("index", index);
      const link = sitemapLinksArray[index];

      const isLinkIndexed = await isIndexed({
        link,
        privateKey: privateKey,
        clientEmail: clientEmail,
      });
      if (!isLinkIndexed) {
        await sendIndexRequest({
          link,
          privateKey: privateKey,
          clientEmail: clientEmail,
        });
        timeout(1000 * 15); // 15 min

        sitemapLinksArray.splice(index, 1);

        limitIndex--;
      } else {
        sitemapLinksArray.splice(index, 1);
      }
    } else {
      index = 0;
    }
  }

  const finishedDate = new Date();
  console.log(
    `Indexing process finished at ${finishedDate.toISOString()} and indexed ${
      200 - limitIndex + 1
    } links.`
  );

  finishedDate.setHours(finishedDate.getHours() + 26);
  console.log(
    `Next indexing process will start at ${finishedDate.toISOString()}`
  );
};
start();

setInterval(() => {
  start();
}, 1000 * 60 * 60 * 24 + 1000 * 60 * 60 * 1); // 25 hours
