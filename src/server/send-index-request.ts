import { google } from "googleapis";

export const sendIndexRequest = async ({
  link,
  privateKey,
  clientEmail,
}: {
  link: string;
  privateKey: string;
  clientEmail: string;
}) => {
  const jwtClient = new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    ["https://www.googleapis.com/auth/indexing"],
    undefined
  );

  const indexingApi = await google.indexing({ version: "v3", auth: jwtClient });

  await indexingApi.urlNotifications
    .publish({
      requestBody: {
        url: link,
        type: "URL_UPDATED",
      },
    })
    .then((res) => {
      console.log(res.data);
    })
    .catch((err) => {
      console.log(err);
    });
};
