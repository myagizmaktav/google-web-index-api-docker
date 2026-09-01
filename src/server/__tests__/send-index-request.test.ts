import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GoogleClients } from "../google-client.js";
import { sendIndexRequest } from "../send-index-request.js";

const clientsRejectingWith = (error: unknown): GoogleClients =>
  ({
    indexing: {
      urlNotifications: {
        publish: async () => {
          throw error;
        },
      },
    },
  }) as unknown as GoogleClients;

const clientsAccepting = (): GoogleClients =>
  ({
    indexing: {
      urlNotifications: { publish: async () => ({ data: {} }) },
    },
  }) as unknown as GoogleClients;

const submit = (clients: GoogleClients) =>
  sendIndexRequest({ link: "https://example.com/page", clients });

describe("sendIndexRequest", () => {
  it("reports success", async () => {
    assert.deepEqual(await submit(clientsAccepting()), { ok: true });
  });

  it("flags a 429 as a quota failure", async () => {
    const result = await submit(
      clientsRejectingWith(Object.assign(new Error("rate limited"), { code: 429 }))
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.quotaExceeded, true);
    assert.equal(result.ok === false && result.authFailed, false);
    assert.equal(result.ok === false && result.ownershipFailed, false);
  });

  it("flags invalid_grant as rejected credentials, not an ownership problem", async () => {
    const result = await submit(
      clientsRejectingWith(new Error("invalid_grant: Invalid grant: account not found"))
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.authFailed, true);
    assert.equal(result.ok === false && result.ownershipFailed, false);
  });

  it("flags a 403 as an ownership problem", async () => {
    const result = await submit(
      clientsRejectingWith(Object.assign(new Error("forbidden"), { code: 403 }))
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.authFailed, true);
    assert.equal(result.ok === false && result.ownershipFailed, true);
  });

  it("recognises the ownership message the Indexing API returns", async () => {
    const result = await submit(
      clientsRejectingWith(
        new Error("Permission denied. Failed to verify the URL ownership.")
      )
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.ownershipFailed, true);
  });

  it("treats an ordinary error as neither quota nor auth", async () => {
    const result = await submit(clientsRejectingWith(new Error("socket hang up")));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.quotaExceeded, false);
    assert.equal(result.ok === false && result.authFailed, false);
  });
});
