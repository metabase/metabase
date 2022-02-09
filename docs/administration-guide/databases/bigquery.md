# Working with Google BigQuery in Metabase

This page provides information on how to create and manage a connection to a Google [BigQuery](https://cloud.google.com/bigquery) dataset.

## Prerequisites

You'll need to have a [Google Cloud Platform](https://cloud.google.com/) account with a [project](https://cloud.google.com/storage/docs/projects) you would like to use in Metabase. Consult the Google Cloud Platform documentation for how to [create and manage a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects). This project should have a BigQuery dataset for Metabase to connect to.

## Google Cloud Platform: creating a service account and JSON file

You'll first need a [service account](https://cloud.google.com/iam/docs/service-accounts) JSON file that Metabase can use to access your BigQuery dataset. Service accounts are intended for non-human users (such as applications like Metabase) to authenticate (who am I?) and authorize (what can I do?) their API calls.

To create the service account JSON file, follow Google's documentation on [setting up a service account](https://cloud.google.com/iam/docs/creating-managing-service-accounts) for your BigQuery dataset. Here's the basic flow:

1. **Create service account**. From your Google Cloud Platform project console, open the main sidebar menu on the left, go to the **IAM & Admin** section, and select **Service account**. The console will list existing service accounts, if any. At the top of the screen, click on **+ CREATE SERVICE ACCOUNT**.

2. **Fill out the service account details**. Name the service account, and add a description (the service account ID will populate once you add a name). Then click the **Create** button.

3. **Grant the service account access to this project**. You'll need to add **roles** to the service account so that Metabase will have permission to view and run queries against your dataset. Make sure you add the following roles to the service account:

   - BigQuery Data Viewer
   - BigQuery Metadata Viewer
   - BigQuery Job User (distinct from BigQuery User)

For more information on **roles** in BigQuery, see [Google Cloud Platform's documentation](https://cloud.google.com/bigquery/docs/access-control).

4. **Create key**. Once you have assigned roles to the service account, click on the **Create Key** button, and select **JSON** for the **key type**. The JSON file will download to your computer.

> **You can only download the key once**. If you delete the key, you'll need to create another service account with the same roles.

## Metabase: adding a BigQuery dataset

Once you have created and downloaded your service account JSON file for your BigQuery dataset, head over to your Metabase instance, click on the **settings** cog, and select **Admin** to bring up Admin mode. In the **Databases** section, click on the **Add database** button in the upper right.

On the **ADD DATABASE** page, select **BigQuery** from the **Database type** dropdown. Metabase will present you with the relevant configuration settings to fill out:

## Settings

### Display name

**Name** is the title of your database in Metabase.

### Project ID (override)

Each BigQuery dataset will have a **Project ID**. You can find this ID via the [Google Cloud Console](https://console.cloud.google.com/). If you're not sure where to find the **Project ID**, see Google's documentation on [getting information on datasets](https://cloud.google.com/bigquery/docs/dataset-metadata#getting_dataset_information).

> When entering the **Project ID**, omit the Project ID prefix. For example, if your ID is `project_name:project_id`, only enter `project_id`.

#### Service account JSON file

Upload the service account JSON file you created when following the [steps above](#google-cloud-platform-creating-a-service-account-and-json-file). The JSON file contains the credentials your Metabase application will need to read and query your dataset, as defined by the **roles** you added to the service account. If you need to add additional **roles**, you have to create another service account, download the JSON file, and upload the file to Metabase.

### Datasets

Here you can specify which datasets you want to sync and scan. Options are:

- All
- Only these...
- All except...

For the Only these and All except options, you can input a comma-separated list of values to tell Metabase which datasets you want to include (or exclude). For example:

```
foo,bar,baz
```

You can use the `*` wildcard to match multiple datasets.

Let's say you have three datasets: foo, bar, and baz.

- If you have **Only these...** set, and enter the string `b*`, you'll sync with bar and baz.
- If you have **All except...** set, and enter the string `b*`, you'll just sync foo.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

## Advanced settings

### Use the Java Virtual Machine (JVM) timezone

_Default: Off_

We suggest you leave this off unless you're doing manual timezone casting in many or most of your queries with this data.

### Include User ID and query hash in queries

_Default: On_

This can be useful for auditing and debugging, but prevents BigQuery from caching results and may increase your costs.

### Rerun queries for simple explorations

_Default: On_

We execute the underlying query when you explore data using Summarize or Filter. If performance is slow, you can try disabling this option to see if there's an improvement.

### Choose when Metabase syncs and scans

_Default: Off_

Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, we recommend turning this on and reviewing when and how often the field value scans happen.

### Periodically refingerprint tables

_Default: Off_

This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

### Default reset cache duration

{% include plans-blockquote.html feature="Database-specific caching" %}

How long to keep question results. By default, Metabase will use the value you supply on the [cache settings page](../../administration-guide/14-caching.md), but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.

Options are:

- **Use instance default (TTL)**. TTL is time to live, meaning how long the cache remains valid before Metabase should run the query again.
- **Custom**.

If you are on a paid plan, you can also set cache duration per questions. See [Advanced caching controls](../../enterprise-guide/cache.md).

## Save your database configuration

When you're done, click the **Save** button.

Give Metabase some time to sync with your BigQuery dataset, then exit Admin mode, click on **Browse Data**, find your database, and start exploring your data.

## Connecting to Google Drive data sources

To connect to a data source like on a Google Drive, like a Google Sheet, you don't need to do anything in Metabase. But you do need to:

1. Share the file (e.g., the Google Sheet) with the service account that Metabase uses to connect to BigQuery.
2. Create an external table in a BigQuery dataset that Metabase has access to.

For more, see the Google Cloud docs on [Querying drive data](https://cloud.google.com/bigquery/external-data-drive).

## Using Legacy SQL

As of version 0.30.0, Metabase tells BigQuery to interpret SQL queries as [Standard SQL](https://cloud.google.com/bigquery/docs/reference/standard-sql/). If you prefer using [Legacy SQL](https://cloud.google.com/bigquery/docs/reference/legacy-sql) instead, you can tell Metabase to do so by including a `#legacySQL` directive at the beginning of your query, for example:

```sql
#legacySQL
SELECT *
FROM [my_dataset.my_table]
```

## Troubleshooting

If you're having trouble with your BigQuery connection, you can check out this [troubleshooting guide](https://www.metabase.com/docs/latest/troubleshooting-guide/datawarehouse.html), or visit [Metabase's discussion forum](https://discourse.metabase.com/search?q=bigquery) to see if someone has encountered and resolved a similar issue.

## Further reading

- [Managing databases](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html).
- [Metadata editing](https://www.metabase.com/docs/latest/administration-guide/03-metadata-editing.html).
- [Models](../../users-guide/models.md).
- [Setting data access permissions](https://www.metabase.com/docs/latest/administration-guide/05-setting-permissions.html).
