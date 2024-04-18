import { google } from "googleapis";

export async function isIndexed({
  link,
  privateKey,
  clientEmail,
}: {
  link: string;
  privateKey: string;
  clientEmail: string;
}) {
  const searchconsole = google.searchconsole("v1");

  const client = new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    [
      "https://www.googleapis.com/auth/webmasters",
      "https://www.googleapis.com/auth/webmasters.readonly",
    ],
    undefined
  );

  google.options({ auth: client });
  const url = new URL(link);
  const match = url.hostname.match(/(?<domain>[a-zA-Z0-9]+\.[a-zA-Z0-9]+)$/);
  const domain = match?.groups?.domain as any;

  const isIndexed = await searchconsole.urlInspection.index.inspect({
    requestBody: {
      inspectionUrl: link,
      languageCode: "en-US",
      siteUrl: `sc-domain:${domain}`,
    },
  });

  console.log(isIndexed.data);

  return isIndexed?.data.inspectionResult?.indexStatusResult?.coverageState?.includes(
    "Submitted"
  );
}
