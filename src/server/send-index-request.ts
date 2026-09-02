import type { GoogleClients } from "./google-client.js";

export interface SendIndexRequestOptions {
  link: string;
  clients: GoogleClients;
}

export type IndexRequestResult =
  | { ok: true }
  | {
      ok: false;
      quotaExceeded: boolean;
      /**
       * Credentials or Search Console permissions are wrong. Either way every
       * remaining URL would fail identically, so the pass should stop.
       */
      authFailed: boolean;
      /**
       * True when the credentials are valid but the service account lacks
       * ownership of the Search Console property, as opposed to the
       * credentials themselves being rejected.
       */
      ownershipFailed: boolean;
      message: string;
    };

/**
 * Submits a URL_UPDATED notification to the Indexing API.
 *
 * Errors are returned rather than thrown so the caller can distinguish a quota
 * exhaustion (stop the run) from a single failing URL (skip and continue).
 */
export const sendIndexRequest = async ({
  link,
  clients,
}: SendIndexRequestOptions): Promise<IndexRequestResult> => {
  try {
    await clients.indexing.urlNotifications.publish({
      requestBody: {
        url: link,
        type: "URL_UPDATED",
      },
    });

    return { ok: true };
  } catch (error) {
    const status =
      typeof error === "object" && error !== null && "code" in error
        ? Number((error as { code: unknown }).code)
        : undefined;

    const message = error instanceof Error ? error.message : String(error);

    // A 403 here almost always means the credentials worked but the service
    // account is not an owner of the Search Console property, which needs a
    // different fix from a rejected key.
    const ownershipFailed =
      status === 403 ||
      /do not own this site|verify the URL ownership|not part of this property/i.test(
        message
      );

    // invalid_grant / 401 mean the credentials themselves are rejected.
    const credentialsRejected =
      status === 401 ||
      /invalid_grant|unauthorized_client|invalid_client/i.test(message);

    return {
      ok: false,
      quotaExceeded: status === 429,
      authFailed: ownershipFailed || credentialsRejected,
      ownershipFailed,
      message,
    };
  }
};
