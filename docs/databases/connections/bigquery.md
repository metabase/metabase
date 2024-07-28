---
title: Google BigQuery
redirect_from:
  - /docs/latest/administration-guide/databases/bigquery
---

# Google BigQuery

To add a database connection, click on the **gear** icon in the top right, and navigate to **Admin settings** > **Databases** > **Add a database**.

## Prerequisites

You'll need to have a [Google Cloud Platform](https://cloud.google.com/) account with a [project](https://cloud.google.com/storage/docs/projects) you would like to use in Metabase. Consult the Google Cloud Platform documentation for how to [create and manage a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects). This project should have a BigQuery dataset for Metabase to connect to.

## Google Cloud Platform: creating a service account and JSON file

You'll first need a [service account](https://cloud.google.com/iam/docs/service-account-overview) JSON file that Metabase can use to access your BigQuery dataset. Service accounts are intended for non-human users (such as applications like Metabase) to authenticate (who am I?) and authorize (what can I do?) their API calls.

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

## Settings

You can edit these settings at any time. Just remember to save your changes.

### Display name

The display name for the database in the Metabase interface.

### Project ID

Each BigQuery dataset will have a **Project ID**. You can find this ID via the [Google Cloud Console](https://console.cloud.google.com/). If you're not sure where to find the **Project ID**, see Google's documentation on [getting information on datasets](https://cloud.google.com/bigquery/docs/dataset-metadata#getting_dataset_information).

> When entering the **Project ID**, omit the Project ID prefix. For example, if your ID is `project_name:project_id`, only enter `project_id`.

### Service account JSON file

The JSON file contains the credentials your Metabase application will need to access BigQuery datasets, as defined by the **roles** you added to the service account. If you need to add additional **roles**, you have to create another service account, download the JSON file, and upload the file to Metabase.

### Datasets

You can specify which BigQuery datasets you want to sync and scan. Options are:

- All
- Only these...
- All except...

> A BigQuery dataset is similar to a schema. Make sure to enter your dataset names (like `marketing`), _not_ your table names (`marketing.campaigns`).

Let's say you have three datasets: foo, bar, and baz.

To sync all three datasets, select **Only these...** and enter:

```
foo,bar,baz
```

To sync datasets based on a string match, use the `*` wildcard:

- To sync bar and baz, select **Only these...** and enter the string `b*`.
- To sync foo only, select **All except...** and enter the string `b*`.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

### Use the Java Virtual Machine (JVM) timezone

We suggest you leave this off unless you're doing manual [timezone](../../configuring-metabase/timezones.md) casting in many or most of your queries with this data.

### Include User ID and query hash in queries

This can be useful for [auditing](../../usage-and-performance-tools/usage-analytics.md) and debugging, but prevents BigQuery from caching results and may increase your costs.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/introduction.md#grouping-your-metrics) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when Metabase syncs and scans

Turn this option **ON** to manage the queries that Metabase uses to stay up to date with your database. For more information, see [Syncing and scanning databases](../sync-scan.md#syncing-and-scanning-databases).

#### Database syncing

If you've selected **Choose when syncs and scans happen** > **ON**, you'll be able to set:

- The frequency of the [sync](../sync-scan.md#how-database-syncs-work): hourly (default) or daily.
- The time to run the sync, in the timezone of the server where your Metabase app is running.

#### Scanning for filter values

Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.

If you've selected **Choose when syncs and scans happen** > **ON**, you'll see the following options under **Scanning for filter values**:

- **Regularly, on a schedule** allows you to run [scan queries](../sync-scan.md#how-database-scans-work) at a frequency that matches the rate of change to your database. The time is set in the timezone of the server where your Metabase app is running. This is the best option for a small database, or tables with distinct values that get updated often.
- **Only when adding a new filter widget** is a great option if you want scan queries to run on demand. Turning this option **ON** means that Metabase will only scan and cache the values of the field(s) that are used when a new filter is added to a dashboard or SQL question.
- **Never, I'll do this manually if I need to** is an option for databases that are either prohibitively large, or which never really have new values added. Use the [Re-scan field values now](../sync-scan.md#manually-scanning-column-values) button to run a manual scan and bring your filter values up to date.

### Periodically refingerprint tables

> Periodic refingerprinting will increase the load on your database.

Turn this option **ON** to scan a sample of values every time Metabase runs a [sync](../sync-scan.md#how-database-syncs-work).

A fingerprinting query examines the first 10,000 rows from each column and uses that data to guesstimate how many unique values each column has, what the minimum and maximum values are for numeric and timestamp columns, and so on. If you leave this option **OFF**, Metabase will only fingerprint your columns once during setup.

## Connecting Metabase to Google Drive data sources

You can connect Metabase to Google Drive data sources via BigQuery. There is some setup involved, but basically what you'll be doing is creating a dataset in BigQuery and adding an external table to that dataset that points to a Google Sheet. Useful for uploading CSVs to Google Sheets, and then analyzing and visualizing the data with Metabase.

To connect to a data source stored in Google Drive (like a Google Sheet), first make sure you've completed the steps above, including:

- creating a project in Google Cloud Platform,
- adding a BigQuery dataset, and
- creating a [service account](#google-cloud-platform-creating-a-service-account-and-json-file).

### Share your Google Drive source with the service account

While viewing your Drive file, (e.g., a Google Sheet with an uploaded CSV file), click the **Share** button in the top right. In the text box labeled **Add people or groups**, paste in the email of your service account, which you can find on the [Service Accounts page](https://console.cloud.google.com/projectselector2/iam-admin/serviceaccounts?supportedpurview=project) in the Google Cloud Console.

That email address will look something like `service-account-name@your-project-name.iam.gserviceaccount.com`, with the your service account and project names filled in accordingly.

Choose **Viewer** from the dropdown, uncheck the **Notify people** option, and click **Share**.

### Create an external table in BigQuery that points to your Google Drive source

If you don't already have a BigQuery dataset, [create one](https://cloud.google.com/bigquery/docs/datasets).

Next, using the Google Cloud Console, [create an external table](https://cloud.google.com/bigquery/external-data-drive?hl=en#creating_and_querying_a_permanent_external_table) within your BigQuery dataset that points to your Google Sheet.

Be sure to specify the correct **Drive URI** and file format.

If you haven't already, [connect your Metabase to your BigQuery](#google-bigquery).

Once you've completed these steps, you'll be able to ask questions and create dashboards in Metabase using a Google Drive source as your data.

## Using Legacy SQL

As of version 0.30.0, Metabase tells BigQuery to interpret SQL queries as [Standard SQL (GoogleSQL)](https://cloud.google.com/bigquery/docs/introduction-sql). If you prefer using [Legacy SQL](https://cloud.google.com/bigquery/docs/reference/legacy-sql) instead, you can tell Metabase to do so by including a `#legacySQL` directive at the beginning of your query, for example:

```sql
#legacySQL
SELECT *
FROM [my_dataset.my_table]
```

## Troubleshooting

If you're having trouble with your BigQuery connection, you can check out this [troubleshooting guide](../../troubleshooting-guide/bigquery-drive.md) that covers BigQuery issues, [this one](../../troubleshooting-guide/db-connection.md) on data warehouse connections, or visit [Metabase's discussion forum](https://discourse.metabase.com/search?q=bigquery) to see if someone has encountered and resolved a similar issue.

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
