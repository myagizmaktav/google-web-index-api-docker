import { loadConfig } from "./config.js";
import { createGoogleClients } from "./google-client.js";

/**
 * Diagnostic entry point: lists the Search Console properties the configured
 * service account can actually see, and checks them against the properties the
 * sitemap configuration expects.
 *
 * Run with `npm run check-access`. The Indexing API reports a missing property
 * only as a generic permission error, so listing them directly is the fastest
 * way to tell "key is wrong" apart from "account is not an owner".
 */
const main = async (): Promise<void> => {
  const config = loadConfig();
  const clients = createGoogleClients({
    clientEmail: config.clientEmail,
    privateKey: config.privateKey,
  });

  console.log(`Service account: ${config.clientEmail}`);

  const { data } = await clients.searchConsole.sites.list({});
  const entries = data.siteEntry ?? [];

  if (entries.length === 0) {
    console.error(
      "\nThis service account cannot see any Search Console property.\n" +
        "In Search Console open Settings > Users and permissions, add the " +
        "service account email above, and set its permission to Owner."
    );
  } else {
    console.log("\nProperties visible to this account:");
    for (const entry of entries) {
      console.log(`  ${entry.siteUrl}  [${entry.permissionLevel}]`);
    }
  }

  console.log("\nProperties required by this configuration:");
  // The Indexing API requires siteOwner. siteFullUser can read inspection
  // data but every publish call fails with "Failed to verify the URL
  // ownership", so check the level rather than mere visibility.
  const levels = new Map(
    entries.map((entry) => [entry.siteUrl, entry.permissionLevel])
  );

  let missing = false;
  let notOwner = false;

  for (const target of config.targets) {
    const level = levels.get(target.siteUrl);

    if (!level) {
      missing = true;
      console.log(`  MISSING   ${target.siteUrl}  (${target.sitemapLink})`);
    } else if (level !== "siteOwner") {
      notOwner = true;
      console.log(
        `  NOT OWNER ${target.siteUrl}  [${level}]  (${target.sitemapLink})`
      );
    } else {
      console.log(`  OK        ${target.siteUrl}  (${target.sitemapLink})`);
    }
  }

  if (missing) {
    console.error(
      "\nAt least one property is not visible to this account. Add the " +
        "service account in Search Console, or set SITE_URL / the " +
        "\"<sitemap>|<property>\" form if the site is registered under a " +
        "different property name."
    );
  }

  if (notOwner) {
    console.error(
      "\nThe account can see the property but is not an owner, so the " +
        "Indexing API will reject every submission. In Search Console open " +
        "Settings > Ownership verification and add the service account email " +
        "as an owner. The Users and permissions screen only grants Full " +
        "access, which is not enough."
    );
  }

  if (missing || notOwner) process.exitCode = 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
