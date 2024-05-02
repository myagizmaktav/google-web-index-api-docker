# Google Web Indexing Automation API with Docker

### Warning: This automation is recommended for sites with 5000+ sitemap links. Long-term use of the indexing API may be harmful, as Google bots may interpret manual indexing as unnecessary, potentially reducing the frequency of reindexing. Typically, Google Search Console indexes around 100 pages daily.

### Tip: if your Google console not giving no index tag error. do not fix other errors until your site sitemap is fully indexed or successful or not successful.

### Info: The daily limit for reindexing is 200 pages according to Google's restrictions.

#### Description: 
##### This application is designed for automatic Google web page indexing using Docker. While similar services exist, they are often not free. This app aims to simplify the indexing process for those with basic programming knowledge.

## Prerequisites
- Docker
- Your site's sitemap link
- Verified site hostname on Google Console

## Steps

- Step 1
  - Create a Service Account:
    - Visit https://developers.google.com/search/apis/indexing-api/v3/prereqs
    - Download the JSON version of the service account key
- Step 2
  - Enable the Indexing API on the created service project: https://console.cloud.google.com/apis/library/indexing.googleapis.com?project=decent-surf-420609
  - Enable the Search Console API on the created service project: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=decent-surf-420609
- Step 3
  - Open your Google Search Console and add user the service client email with `Owner` permission.
- Step 4
  - Convert your JSON private key to base64.
    - Open your browser's developer console and execute the following JavaScript code:
      - `console.log(btoa("your private key"))`
      - Save the result.
- Step 5 
  - Edit your Docker Compose environment variables.
  - Run `docker-compose up`.

Docker Compose Example:
```yaml
version: "3"
services:
  node:
    image: foxsnow/web-indexing-api-google:latest 
    build: 
      context: ./
    environment:
     - SITEMAP_LINK=https://foobar.com/sitemap.xml
     - SERVICE_CLIENT_EMAIL=foobar@decent-surf-420609.iam.gserviceaccount.com
     - PRIVATE_KEY_BTOA=LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1JSUV2UUlCQURBTk...
