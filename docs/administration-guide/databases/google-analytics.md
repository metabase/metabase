## Working with Google Analytics in Metabase

This page provides information on how to create and manage a connection to a [Google Analytics](https://cloud.google.com/analytics) dataset.

## Prerequisites

You will need to have a [Google Cloud Platform](https://cloud.google.com/) account and create the [project](https://cloud.google.com/resource-manager/docs/creating-managing-projects#creating_a_project) you would like to use in Metabase. Consult the Google Cloud Platform documentation on how to [create and manage a project](https://cloud.google.com/resource-manager/docs/creating-managing-projects) if you do not have one.

## Google Cloud Platform: creating OAuth client ID

To get the **Client ID** and **Client Secret**, follow Google's Cloud Platform Help on [how to create an OAuth client ID](https://support.google.com/cloud/answer/6158849?hl=en). For application type, select "Desktop App" (this avoids a `redirect_uri_mismatch` when requesting **Auth Codes**).

### Enabling Google Analytics API
To enable the Google Analytics API, go to this page in the Google Cloud Platform console: https://console.cloud.google.com/apis/api/analytics.googleapis.com/overview. Double check that the previously created project is selected and click on "Enable".

For further documentation please refer to [Enable and disable APIs](https://support.google.com/googleapi/answer/6158841?hl=en).


##### Adding the API scopes
Refer to Google's Analytics API documentation for the required [scopes](https://developers.google.com/identity/protocols/oauth2/scopes).


## Metabase: adding a Google Analytics Dataset

In your Metabase, click on the **settings** cog, and select **Admin** to bring up the Admin panel. In the **Databases** section, click on the **Add database** button in the upper right.

On the **ADD DATABASE** page, select **Google Analytics** from the **Database type** dropdown. Metabase will present you with the relevant configuration settings to fill out:

![images](../images/google_analytics_add_database.png)

### Settings

#### Name

**Name** is the title of your database in Metabase.

#### Google Analytics Account ID

Get the **Account id** from [Google Analytics Console](https://analytics.google.com/). Click the **Admin** cog, in the admin tab, go to the **Account Settings** section. You will find the **Account Id** below the Basic Settings heading.

#### Client ID and Client Secret

Paste the **Client ID** and **Client Secret** you created when following the [steps above](#google-cloud-platform-creating-oauth-client-id). These credentials should be correctly associated to scopes allowing interaction with Google Analytics API.

#### Auth Code

Once you've provided **Client ID** and **Client Secret** with valid scopes, a **Click here to get an auth code** link will appear over the **Auth Code** text box. Authorize the connection with your Google Login Credentials to see the Auth Code, then copy and paste the code here.

#### Automatically run queries when doing simple filtering and summarizing.

_Default: Enabled_

When this slider is on, Metabase will automatically run queries when users do simple explorations with the Summarize and Filter buttons when viewing a table or chart. You can turn this off if querying this database is slow. This setting doesn’t affect drill-throughs or SQL queries.

#### This is a large database, so let me choose when Metabase syncs and scans

_Default: Disabled_

By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, we recommend turning this on and reviewing when and how often the field value scans happen.

See [database sync and analysis documentation](https://www.metabase.com/docs/latest/administration-guide/01-managing-databases.html#database-sync-and-analysis) for more details about these configuration items.

### Save your database configuration

When you're done, click the **Save** button. A modal should pop up, informing you that your database has been added.

![Database added](../images/database-added.png)

You can click on **Explore this data** to see some automatic explorations of your data, or click **I'm good thanks** to stay in the Admin Panel.

Give Metabase some time to sync with your Google Analytics dataset, then exit Admin mode, click on **Browse Data**, find your database, and start exploring your data. Once Metabase is finished syncing, you should see the names of your Properties & Apps in the data browser.

## Troubleshooting

If you're having trouble with your Google Analytics connection, you can check out this [troubleshooting guide](https://www.metabase.com/docs/latest/troubleshooting-guide/datawarehouse.html), or visit [Metabase's discussion forum](https://discourse.metabase.com/search?q=bigquery) to see if someone has encountered and resolved a similar issue.
