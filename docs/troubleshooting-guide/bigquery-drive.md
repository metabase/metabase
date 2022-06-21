---
title: Troubleshooting BigQuery and Google Drive connections in Metabase
---

# Troubleshooting BigQuery and Google Drive connections in Metabase

[This page](../administration-guide/databases/bigquery) explains how to connect a BigQuery data source, including one that uses a file stored in Google Drive, like a Google Sheet (GSheets). 

## 403 Forbidden POST error

If you encounter an error that looks like this: 

```
403 Forbidden POST https://www.googleapis.com/bigquery/v2/projects/PROJECT-NAME/queries { "code" : 403, "errors" : [ { "domain" : "global", "message" : "Access Denied: BigQuery BigQuery: Permission denied while getting Drive credentials.", "reason" : "accessDenied" } ], "message" : "Access Denied: BigQuery BigQuery: Permission denied while getting Drive credentials.", "status" : "PERMISSION_DENIED" }
```

You may have forgotten to [share your Google Drive source](../administration-guide/databases/bigquery#share-your-google-drive-source-with-the-service-account) with the service account email. Once that's been fixed, that error should disappear and you'll be able to view and query your data source.

## Further reading

You may also want to check out [this troubleshooting guide](datawarehouse) on database connections.