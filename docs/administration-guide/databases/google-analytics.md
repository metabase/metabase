## Working with Google Analytics in Metabase

This page provides information on how to create and manage a connection to a [Google Analytics][google-analytics] dataset.

## Prerequisites

You will need to have a [Google Cloud Platform][google-cloud] account and create the [project][google-cloud-create-project] you would like to use in Metabase. Consult the Google Cloud Platform documentation on how to [create and manage a project][google-cloud-management] if you do not have one.

## Google Cloud Platform: creating a service account and JSON file

You'll first need a [service account](https://cloud.google.com/iam/docs/service-accounts) JSON file that Metabase can
use to access your Google Analytics dataset. Service accounts are intended for non-human users (such as applications
like Metabase) to authenticate (who am I?) and authorize (what can I do?) their API calls.

To create the service account JSON file, follow Google's documentation on [setting up a service
account](https://cloud.google.com/iam/docs/creating-managing-service-accounts) for your Google Analytics dataset.
Here's the basic flow:

1. **Create service account**. From your Google Cloud Platform project console, open the main sidebar menu on the
   left, go to the **IAM & Admin** section, and select **Service account**. The console will list existing service
   accounts, if any. At the top of the screen, click on **+ CREATE SERVICE ACCOUNT**.

2. **Fill out the service account details**. Name the service account, and add a description (the service account ID
   will populate once you add a name). Then click the **Create** button.

3. The **Service account permissions (optional)** section is not required. Click **Continue**.

4. **Create key**. Once you have assigned roles to the service account, click on the **Create Key** button, and select
   **JSON** for the **key type**. The JSON file will download to your computer.

> **You can only download the key once**. If you delete the key, you'll need to create another service account with
> the same roles.

### Adding the service account to your Google Analytics account

The newly created service account will have an email address that looks similar to:

```
my_service_account_name@my_project_id.iam.gserviceaccount.com
```

You must add this service account user to your Google Analytics account in order to use it. Add it by following the
instructions [here][google-analytics-add-user]. Only Read and Analyze permissions are needed for Metabase.

### Enabling Google Analytics API

To enable the Google Analytics API, go to <https://console.cloud.google.com/apis/api/analytics.googleapis.com/overview> in the Google Cloud Platform console. Double-check that the previously created project is selected and click on "Enable". For further documentation please refer to [Enable and disable APIs][google-enable-disable-apis].

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

## Save your database configuration

When you're done, click the **Save** button. A modal dialog will inform you that your database has been added. You can click on **Explore this data** to see some automatic explorations of your data, or click **I'm good thanks** to stay in the **Admin Panel**.

Give Metabase some time to sync with your Google Analytics dataset, then exit the **Admin Panel**, click on **Browse Data**, find your Google Analytics database, and start exploring. Once Metabase is finished syncing, you will see the names of your Properties & Apps in the data browser.

[google-analytics]: https://cloud.google.com/analytics
[google-analytics-add-user]: https://support.google.com/analytics/answer/1009702
[google-cloud]: https://cloud.google.com/
[google-cloud-create-project]: https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project
[google-cloud-management]: https://cloud.google.com/resource-manager/docs/creating-managing-projects
[google-cloud-oauth]: https://support.google.com/cloud/answer/6158849
[google-enable-disable-apis]: https://support.google.com/googleapi/answer/6158841
[google-oauth-scopes]: https://developers.google.com/identity/protocols/oauth2/scopes
[sync-docs]: ../../administration-guide/01-managing-databases.html#choose-when-metabase-syncs-and-scans
