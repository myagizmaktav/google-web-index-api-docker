import { indexing, type indexing_v3 } from "@googleapis/indexing";
import { searchconsole, type searchconsole_v1 } from "@googleapis/searchconsole";
import { JWT } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/indexing",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

export interface GoogleClients {
  indexing: indexing_v3.Indexing;
  searchConsole: searchconsole_v1.Searchconsole;
}

/**
 * Builds the Indexing and Search Console clients once, sharing a single JWT.
 *
 * The previous implementation constructed a new JWT per URL, which forced a
 * token exchange on every request. A single client caches its access token and
 * refreshes it only when it expires. The auth object is passed explicitly
 * rather than through a global `google.options()` call, so no shared state is
 * mutated.
 *
 * The per-API `@googleapis/*` packages are used instead of the umbrella
 * `googleapis` package: the latter bundles every Google API surface (~200MB)
 * when only these two are needed.
 */
export const createGoogleClients = ({
  clientEmail,
  privateKey,
}: {
  clientEmail: string;
  privateKey: string;
}): GoogleClients => {
  const auth = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: SCOPES,
  });

  return {
    indexing: indexing({ version: "v3", auth }),
    searchConsole: searchconsole({ version: "v1", auth }),
  };
};
