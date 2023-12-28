---
title: Working with Google Analytics in Metabase
redirect_from:
  - /docs/latest/administration-guide/databases/google-analytics
---

# Google Analytics (DEPRECATED)

Metabase supported Google Analytics version 3, which Google has set an end-of-life date for July 1, 2023.

If you still want to view Google Analytics data in Metabase, we recommend:

- Upgrading to the latest version of [Google Analytics](https://support.google.com/analytics/answer/10089681?hl=en&ref_topic=12154439,12153943,2986333).
- Setting up a [BigQuery](https://cloud.google.com/bigquery) account.
- Connecting your [Bigquery to Metabase](./bigquery.md).
- Exporting your [Google Analytics 4 data to BigQuery](https://support.google.com/analytics/answer/9358801?hl=en).

Google Analytics will export the data to BigQuery in one table per day. You can build native SQL models with [wildcard queries](https://cloud.google.com/bigquery/docs/querying-wildcard-tables), and then build Metabase questions over those views.