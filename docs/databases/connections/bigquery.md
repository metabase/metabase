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

## Connection and sync

After connecting to a database, you'll see the "Connection and sync" section that displays the current connection status and options to manage your database connection.

Here you can [sync the database schema and rescan field values](../sync-scan.md), and edit connection details.

## Edit connection details

You can edit these settings at any time. Just remember to save your changes.

### Connection string

Paste a connection string here to pre-fill the remaining fields below.

### Display name

The display name for the database in the Metabase interface.

### Project ID

Each BigQuery dataset will have a **Project ID**. You can find this ID via the [Google Cloud Console](https://console.cloud.google.com/). If you're not sure where to find the **Project ID**, see Google's documentation on [getting information on datasets](https://cloud.google.com/bigquery/docs/dataset-metadata#getting_dataset_information).

> When entering the **Project ID**, omit the Project ID prefix. For example, if your ID is `project_name:project_id`, only enter `project_id`.

### Service account JSON file

The JSON file contains the credentials your Metabase application will need to access BigQuery datasets, as defined by the **roles** you added to the service account. If you need to add additional **roles**, you have to create another service account, download the JSON file, and upload the file to Metabase.

You can leave this field empty if you're using [Application Default Credentials](#application-default-credentials-adc) or [Workload Identity Federation](#workload-identity-federation).

### Credential Configuration (JSON)

Use this field for [Workload Identity Federation](#workload-identity-federation) configurations. This is an alternative to the service account JSON file that allows authentication from external identity providers (like Azure AD, AWS, or Kubernetes).

Leave this field empty if you're using a service account JSON file or Application Default Credentials from the environment.

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

### Alternate hostname

If you want to use a different hostname to connect to BigQuery. Format: `https://<hostname>:<port>`. If you're using a proxy service to connect to BigQuery (e.g. a privacy proxy that anonymizes PII), you should configure this field to the proxy hostname or IP. Remember to set the complete URI with protocol and port number.

### Re-run queries for simple explorations

Turn this option **OFF** if people want to click **Run** (the play button) before applying any [Summarize](../../questions/query-builder/summarizing-and-grouping.md) or filter selections.

By default, Metabase will execute a query as soon as you choose an grouping option from the **Summarize** menu or a filter condition from the [drill-through menu](https://www.metabase.com/learn/metabase-basics/querying-and-dashboards/questions/drill-through). If your database is slow, you may want to disable re-running to avoid loading data on each click.

### Choose when syncs and scans happen

See [syncs and scans](../sync-scan.md#choose-when-syncs-and-scans-happen).

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

## Model features

There aren't (yet) any model features available for BigQuery.

## Database routing

With database routing, an admin can build a question once using one database, and the question will run its query against a different database with the same schema depending on who is viewing the question.

Database routing for BigQuery works between BigQuery **projects** with identical schemas.

See [Database routing](../../permissions/database-routing.md).

## Alternative authentication methods

In addition to service account JSON files, Metabase supports other Google Cloud authentication methods that are useful in cloud-native environments.

### Application Default Credentials (ADC)

Application Default Credentials (ADC) allow Metabase to authenticate without explicitly providing credentials in the connection settings. ADC automatically finds credentials from the environment.

ADC works in the following scenarios:

- **Google Kubernetes Engine (GKE) Workload Identity**: When running Metabase on GKE with Workload Identity enabled, the pod automatically receives credentials from the Kubernetes service account.
- **Google Compute Engine (GCE)**: When running on a GCE instance with an attached service account.
- **Local development**: When you've run `gcloud auth application-default login`.
- **GOOGLE_APPLICATION_CREDENTIALS environment variable**: When you've set this variable to point to a service account JSON file.

To use ADC:

1. Leave both **Service account JSON file** and **Credential Configuration (JSON)** fields empty.
2. Enter the **Project ID** (required when using ADC).
3. Ensure your environment is configured with valid Google Cloud credentials.

### Workload Identity Federation

Workload Identity Federation allows external identity providers (such as Azure AD, AWS, or Kubernetes OIDC) to authenticate with Google Cloud without using service account keys.

This is useful when:

- Running Metabase on Azure Kubernetes Service (AKS) and accessing BigQuery.
- Running Metabase on AWS EKS and accessing BigQuery.
- Running on any Kubernetes cluster with OIDC tokens.

To use Workload Identity Federation:

1. [Set up Workload Identity Federation](https://cloud.google.com/iam/docs/workload-identity-federation) in your Google Cloud project.
2. Create a credential configuration file using the Google Cloud CLI:
   ```bash
   gcloud iam workload-identity-pools create-cred-config \
     projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID \
     --service-account=SERVICE_ACCOUNT_EMAIL \
     --output-file=credential-config.json \
     --credential-source-file=/path/to/oidc/token
   ```
3. Copy the contents of the generated JSON file.
4. Paste it into the **Credential Configuration (JSON)** field in Metabase.
5. Enter the **Project ID** (required when using Workload Identity Federation).

The credential configuration JSON will look something like:

```json
{
  "type": "external_account",
  "audience": "//iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/providers/PROVIDER_ID",
  "subject_token_type": "urn:ietf:params:oauth:token-type:jwt",
  "token_url": "https://sts.googleapis.com/v1/token",
  "credential_source": {
    "file": "/var/run/secrets/tokens/gcp-token"
  }
}
```

> When using Workload Identity Federation, the token file path in `credential_source.file` must be accessible to the Metabase process. In Kubernetes, this is typically a projected service account token volume.

## Danger zone

See [Danger zone](../danger-zone.md).

## Further reading

- [Managing databases](../../databases/connecting.md)
- [Metadata editing](../../data-modeling/metadata-editing.md)
- [Models](../../data-modeling/models.md)
- [Setting data access permissions](../../permissions/data.md)
