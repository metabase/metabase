---
title: Working with Google Analytics in Metabase
redirect_from:
  - /docs/latest/administration-guide/databases/google-analytics
---

# Working with Google Analytics in Metabase

This page provides information on how to create and manage a connection to a [Google Analytics][google-analytics] dataset.

Setting up Google Analytics will require you to configure:

1. A [Google Cloud Platform (GCP) account](#prerequisites).
2. The [Google Cloud Platform (GCP) console](#google-cloud-platform-creating-a-service-account-and-json-file).
3. Your [Metabase admin settings](#metabase-adding-a-google-analytics-dataset).

Once you've configured Google Analytics in both places, you can [check if your Google Analytics setup is working correctly](#checking-if-google-analytics-is-working-correctly).

## Prerequisites

You will need to have a [Google Cloud Platform (GCP)][google-cloud] account and create the [project][google-cloud-create-project] you would like to use in Metabase. Consult the Google Cloud Platform documentation on how to [create and manage a project][google-cloud-management] if you do not have one.

## Google Cloud Platform: creating a service account and JSON file

You'll first need a [service account][google-service-accounts] JSON file that Metabase can
use to access your Google Analytics dataset. Service accounts are intended for non-human users (such as applications
like Metabase) to authenticate (who am I?) and authorize (what can I do?) their API calls.

To create the service account JSON file, follow Google's documentation on [setting up service accounts][google-managing-service-accounts] for your Google Analytics dataset.

1. From your [Google Cloud Platform console][google-cloud-platform-console], go to **IAM & Admin** > **Service accounts**.

2. Click **+ CREATE SERVICE ACCOUNT** and fill out your service account details.
   - Name the service account.
   - Add a description (the service account ID will populate once you add a name). 

3. Click **Continue** to skip the optional sections.

4. Click **Done** to create your service account.

4. From the **...** menu, go to **Manage keys** > **Add key**.
   - Select **JSON** for the **key type**. 
   - Click **Create** to download the JSON file to your computer. **You can only download the key once**. 
   - If you delete the key, you'll need to create another service account with the same roles.

5. [**Add the service account**][google-analytics-add-user] to your Google Analytics account. 

   - Find the service account email by clicking into your service account name from **IAM & Admin** > **Service accounts**.
   - The service account email will like:
     ```
     my_service_account_name@my_project_id.iam.gserviceaccount.com
     ```
   - Only Read and Analyze permissions are needed for Metabase.

6. Enable the Google Analytics API from the [API overview][google-api-overview].
   - Check that you're in the correct project before you click **Enable**.
   - For further documentation please refer to [Enable and disable APIs][google-enable-disable-apis].

## Metabase: adding a Google Analytics dataset

In your Metabase, click on **Settings** and select "Admin" to bring up the **Admin Panel**. In the **Databases** section, click on the **Add database** button, then select "Google Analytics" from the "Database type" dropdown and fill in the configuration settings:

### Settings

#### Display name

**Name** is the title of your database in Metabase.

#### Account ID

To get the **Google Analytics Account ID**, go to [Google Analytics][google-analytics] and click the **Admin** cog. In
the admin tab, go to the **Account Settings** section: you will find the account ID below the "Basic Settings"
heading.

#### Service account JSON file

Upload the service account JSON file you created when following the steps above. The JSON file contains the
credentials your Metabase application will need to read and query your dataset.

### Advanced settings

- **Rerun queries for simple explorations**: When this setting is enabled (which it is by default), Metabase automatically runs queries when users do simple explorations with the Summarize and Filter buttons when viewing a table or chart. You can turn this off if you find performance is slow. This setting doesn’t affect drill-throughs or SQL queries.

- **Choose when syncs and scans happen**: When this setting is disabled (which it is by default), Metabase regularly checks the database to update its internal metadata. If you have a large database, we you can turn this on and control when and how often the field value scans happen.

- **Periodically refingerprint tables**: This setting — disabled by default — enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.

Please see the [database sync and analysis documentation][sync-docs] for more details about these toggle settings.

## Saving your database configuration

When you're done, click the **Save** button. A modal dialog will inform you that your database has been added. You can click on **Explore this data** to see some automatic explorations of your data, or click **I'm good thanks** to stay in the **Admin Panel**.

## Checking if Google Analytics is working correctly

Give Metabase [some time to sync][sync-docs] with your Google Analytics dataset, then exit the **Admin Panel**, click on **Browse Data**, find your Google Analytics database, and start exploring. Once Metabase is finished syncing, you will see the names of your Properties & Apps in the data browser.

If you're having trouble, see the guides under [Troubleshooting data sources][troubleshooting-data-sources].

[google-analytics]: https://cloud.google.com/analytics
[google-analytics-add-user]: https://support.google.com/analytics/answer/1009702
[google-api-overview]: https://console.cloud.google.com/apis/api/analytics.googleapis.com/overview
[google-cloud]: https://cloud.google.com/
[google-cloud-create-project]: https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project
[google-cloud-management]: https://cloud.google.com/resource-manager/docs/creating-managing-projects
[google-cloud-platform-console]: https://console.cloud.google.com/
[google-cloud-oauth]: https://support.google.com/cloud/answer/6158849
[google-enable-disable-apis]: https://support.google.com/googleapi/answer/6158841
[google-managing-service-accounts]: https://cloud.google.com/iam/docs/creating-managing-service-accounts
[google-oauth-scopes]: https://developers.google.com/identity/protocols/oauth2/scopes
[google-service-accounts]: https://cloud.google.com/iam/docs/service-accounts
[sync-docs]: ../connecting.md#choose-when-metabase-syncs-and-scans
[troubleshooting-data-sources]: ../../troubleshooting-guide/index.html#databases
