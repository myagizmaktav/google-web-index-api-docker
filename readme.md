# Google Web Indexing Automation API

Submits your sitemap's URLs to the [Google Indexing API](https://developers.google.com/search/apis/indexing-api/v3/quickstart) on a schedule, skipping pages that are already indexed. Runs as a single Docker container.

> [!WARNING]
> This automation is recommended for sites with 5000+ sitemap links. Long-term use of the Indexing API may be counterproductive: Google may treat repeated manual submissions as unnecessary and reduce how often it reindexes on its own. Search Console typically indexes around 100 pages per day without any help.

> [!IMPORTANT]
> Google's documented quota is **200 URLs per day per project**. When several sitemaps are configured, they share that one quota.

---

## How it works

1. Fetches every URL from your sitemap, following sitemap index files.
2. Shuffles them, so each run covers a different slice of a large site.
3. For each URL, asks the URL Inspection API whether it is already indexed.
4. Submits only the ones that are not, pausing between requests.
5. Stops at the daily limit, then sleeps until the next run.

---

## Prerequisites

| | |
| --- | --- |
| **Docker** | Or Node.js 22+ to run it directly |
| **A sitemap URL** | For example `https://example.com/sitemap.xml` |
| **A Search Console property** | You must already own the site in [Search Console](https://search.google.com/search-console) |

---

## Setup

### Step 1 — Create a service account

Open **[Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)**, create a service account, then add a key to it and download that key in **JSON** format.

> [!NOTE]
> **No IAM role is required.** When Cloud Console offers *"Grant this service account access to the project"*, skip it — leave it empty and continue. Permission to touch your site comes from Search Console in [Step 3](#step-3--add-the-service-account-as-an-owner), not from Cloud IAM. A service account with no roles at all works.

Keep the JSON file. Steps 3 and 4 need two fields from it: `client_email` and `private_key`.

### Step 2 — Enable both APIs

Both must be enabled on the **same project** that owns the service account:

| API | Why it is needed |
| --- | --- |
| **[Indexing API](https://console.cloud.google.com/apis/library/indexing.googleapis.com)** | Submits the URLs |
| **[Search Console API](https://console.cloud.google.com/apis/library/searchconsole.googleapis.com)** | Checks whether a URL is already indexed |

### Step 3 — Add the service account as an Owner

This is the step that usually goes wrong, so it is worth doing carefully.

1. Open [Search Console](https://search.google.com/search-console) and select your property.
2. Go to **Settings → Users and permissions**.
3. Click **Add user**.
4. Paste the `client_email` value from the service account JSON. It looks like this:
   ```text
   my-service-account@my-project.iam.gserviceaccount.com
   ```
5. Set **Permission** to **Owner**.

> [!CAUTION]
> **`Full` is not enough.** With `Full` the app can read index status, but every submission fails with `Permission denied. Failed to verify the URL ownership.` The Indexing API accepts submissions only from an owner.

<details>
<summary><b>Will adding an owner affect the existing owner?</b></summary>

<br>

**No.** A property can have any number of owners, and adding one takes nothing away from the others. Your own access stays exactly as it is, and you can remove the service account at any time from the same screen.

There are two kinds of owner. Both count as an owner to the Indexing API:

| Kind | How it is established | Who this is |
| --- | --- | --- |
| **Verified owner** | Holds its own proof — a DNS `TXT` record, an HTML file, a meta tag | You, whoever set the site up |
| **Delegated owner** | Added by a verified owner from *Users and permissions* | The service account you just added |

The service account becomes a *delegated* owner, so your own verification is untouched.

</details>

<details>
<summary><b>Which property type should I use?</b></summary>

<br>

By default the app derives a **domain property** from the sitemap's hostname:

| Sitemap | Property it looks for |
| --- | --- |
| `https://example.com/sitemap.xml` | `sc-domain:example.com` |
| `https://www.example.com/sitemap.xml` | `sc-domain:example.com` |
| `https://blog.example.com/sitemap.xml` | `sc-domain:blog.example.com` |
| `https://example.co.uk/sitemap.xml` | `sc-domain:example.co.uk` |

If your site is registered as a **URL-prefix property** instead — `https://example.com/` — set `SITE_URL` to that exact value. For several sitemaps see [Multiple sitemaps](#multiple-sitemaps).

</details>

### Step 4 — Encode the private key

Take the **`private_key`** field out of the service account JSON — not the whole file — and base64-encode it:

```bash
# Linux / macOS
printf '%s' "$(jq -r .private_key service-account.json)" | base64 -w0
```

```powershell
# Windows PowerShell
[Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes(
    (Get-Content service-account.json | ConvertFrom-Json).private_key
  )
)
```

No terminal handy? Open your browser's developer console and use `btoa`, pasting the `private_key` value between the backticks:

```js
btoa(`-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASC...
-----END PRIVATE KEY-----`)
```

> [!TIP]
> With `btoa`, use a **template literal** (backticks), not `"quotes"` — a quoted string cannot span lines and the key is multi-line. Copying the value straight out of the JSON file gives you one line containing literal `\n` sequences; that form works too and is decoded correctly.
>
> With the shell command, `-w0` keeps the output on a **single line**. Wrapped values are handled, but some deployment panels (Coolify, Portainer, Dokploy) truncate multi-line secrets.

### Step 5 — Configure and run

```bash
cp .env.example .env
# edit .env with your values
docker compose up -d
```

Then confirm the permission actually took effect:

```bash
npm run check-access
```

```text
Service account: my-service-account@my-project.iam.gserviceaccount.com

Properties visible to this account:
  sc-domain:example.com  [siteOwner]

Properties required by this configuration:
  OK        sc-domain:example.com  (https://example.com/sitemap.xml)
```

`[siteOwner]` means Step 3 worked. `[siteFullUser]` means the permission is still `Full` — go back and change it to **Owner**.

---

## Configuration

Everything is read from environment variables. `docker compose` loads them from `.env`; [`.env.example`](.env.example) is a documented template.

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `SITEMAP_LINK` | ✅ | — | One or more sitemap URLs, comma or newline separated |
| `SERVICE_CLIENT_EMAIL` | ✅ | — | The `client_email` from the service account JSON |
| `PRIVATE_KEY_BTOA` | ✅ | — | Base64 of the `private_key` from that JSON |
| `SITE_URL` | | *derived* | Search Console property; single-sitemap setups only |
| `DAILY_LIMIT` | | `200` | Max submissions per run, shared across all sitemaps |
| `REQUEST_DELAY_SECONDS` | | `15` | Pause between submissions |
| `INTERVAL_HOURS` | | `25` | Hours between runs |
| `RUN_ONCE` | | `false` | Run once and exit instead of looping |
| `DEBUG` | | `false` | Log every skipped URL |

### Multiple sitemaps

Separate entries with commas. URLs are interleaved between sitemaps, so the shared daily quota is spread across all of them instead of being consumed by the first:

```env
SITEMAP_LINK=https://example.com/sitemap.xml,https://other.com/sitemap.xml
```

Each sitemap's property is derived from its own hostname. To pin one explicitly — for a URL-prefix property, say — pair it with `|`:

```env
SITEMAP_LINK=https://example.com/sitemap.xml|https://example.com/shop/,https://other.com/sitemap.xml
```

> [!NOTE]
> `SITE_URL` overrides the derivation, but only with a single sitemap. With several, use the `|` form so each sitemap gets its own property.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run check-access` | Lists the properties the service account can see, with permission levels |
| `npm run dev` | Runs locally in watch mode |
| `npm test` | Unit tests |
| `npm run typecheck` | Type check, including tests |
| `npm run build` | Compiles to `dist/` |
| `npm run docker:build` | Builds the Docker image, tagged with the `package.json` version and `latest` |
| `npm run docker:push` | Pushes both tags |

### Releasing

Pushing a `v*` tag builds the image for `linux/amd64` and `linux/arm64` and
publishes it to Docker Hub as `foxsnow/web-indexing-api-google`:

```bash
npm version 1.0.1 --no-git-tag-version   # bump package.json
git commit -am "release: 1.0.1"
git tag v1.0.1 && git push origin main --tags
```

The same workflow can be run manually from the Actions tab with the version
passed as an input. It needs the `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`
repository secrets.

---

## Expected API usage

A full run of 200 URLs makes roughly 200 URL-inspection calls and up to 200 submissions, well inside the Search Console API's 2000 queries/day.

Inspection is the slow part: Google takes around 6 seconds per call, and occasionally much longer. With the default 15 second pause that puts a full 200-URL run at a little over an hour.

In [Cloud Console → APIs & Services](https://console.cloud.google.com/apis/dashboard) you can watch request counts, error rates and latency per method. A non-zero error rate there is normal if you ran the app before ownership was granted — those early rejections stay in the window and skew the percentage for a while.

---

## Troubleshooting

<details>
<summary><b><code>Failed to verify the URL ownership</code></b></summary>

<br>

The service account is not an **Owner** of the property — most likely it is still `Full`, which can read index status but not submit.

Run `npm run check-access`. If it reports `[siteFullUser]`, open **Settings → Users and permissions** in Search Console and change the service account's permission to **Owner**. See [Step 3](#step-3--add-the-service-account-as-an-owner).

</details>

<details>
<summary><b><code>PRIVATE_KEY_BTOA decoded to a truncated PEM</code></b></summary>

<br>

The value was cut off when it was pasted into your deployment panel. Re-encode it with `base64 -w0` so it is a single unwrapped line, then paste it again.

</details>

<details>
<summary><b><code>did not decode to a PEM private key</code></b></summary>

<br>

`PRIVATE_KEY_BTOA` must be the base64 of the **`private_key` field only**, not of the whole JSON file. See [Step 4](#step-4--encode-the-private-key).

</details>

<details>
<summary><b><code>The service account credentials were rejected</code></b></summary>

<br>

The key itself was refused (`invalid_grant`). Check that the service account still exists, that its key has not been deleted, and that both APIs from [Step 2](#step-2--enable-both-apis) are enabled on the right project.

</details>

<details>
<summary><b>Nothing gets submitted, but there are no errors</b></summary>

<br>

Every URL is already indexed, which is the intended outcome. Set `DEBUG=true` to log each URL as it is skipped.

</details>

---

## License

See [license.md](license.md).
