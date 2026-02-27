---
title: Set up Slack
redirect_from:
  - /docs/latest/administration-guide/09-setting-up-slack
---

# Set up Slack

_Admin > Settings > Notification channels > Slack_

If you want to have your [dashboard subscriptions](../dashboards/subscriptions.md) or [alerts](../questions/alerts.md) sent to Slack channels (or people on Slack), you need to first integrate your Metabase with Slack.

Both admins and people with [settings access](../permissions/application.md#settings-access) can set up Slack.

## Create your Slack App

For Metabase to post to your Slack channels, you’ll need to create a Slack App and make it available to Metabase.

1. In Metabase, go to **Admin > Settings > Notification channels**.
2. Click **Connect to Slack**.
3. Click **Create a Slack App**. Metabase will open a new tab with the Slack website.
4. On the Slack website, click **Create an App**.
5. Pick a workspace to develop your app.
6. You may get a warning that says **This app is created from a 3rd party manifest. Always verify URLs and permissions below.**

   This warning is expected (Metabase is the third party here). You can click on **Edit configurations** to see the app manifest Metabase sent along in the URL. Here is the manifest in YAML format:

   ```yml
   _metadata:
     major_version: 1
     minor_version: 1
   display_information:
     name: Metabase
     description: Bringing the power of Metabase to your Slack #channels!
     background_color: "#509EE3"
   features:
     bot_user:
       display_name: Metabase
   oauth_config:
     scopes:
       bot:
         - users:read
         - channels:read
         - channels:join
         - files:write
         - chat:write
         - chat:write.customize
         - chat:write.public
         - groups:read
   ```

   The manifest just take cares of some settings for your app and helps speed things along.

7. Click the **Next** button. Then hit **Create** to set up your Slack app.

## Install your app to your workspace

1. On the Slack site for your newly created app, go to **Settings** > **Basic Information** tab
2. Under **Install your app**, click on **Install to workspace**.
3. On the next screen, click **Allow** to give Metabase access to your Slack workspace.

## Configure your app in Metabase

Once you [created the app](#create-your-slack-app) and [installed it in your workspace](#install-your-app-to-your-workspace), you tell Metabase to use it by giving Metabase the OAuth token for the app.

To obtain the OAuth token for the Slack aopp:

1. Go to the Slack site page for your Slack app.
2. On the Slack page for your app, go to **OAuth & Permissions** in the left sidebar.
3. On the **OAuth & Permissions** page for your Slack app, copy the **Bot User OAuth Token**.

To set up the app in Metabase:

1. In Metabase, go to **Admin > Settings > Notification channels > Slack**. Click **Connect to Slack**
2. Paste the token into **Slack bot user OAuth token**
3. **Save changes** in Metabase.

   Metabase will automatically run a quick test to check that the API token is working properly. If something goes wrong, it'll give you an error message.

## Sending alerts and subscriptions to private Slack channels

In order to send [subscriptions](../dashboards/subscriptions.md) and [alerts](../questions/alerts.md) to private Slack channels, you must first add the Metabase app to the private channel.

To add your app to a private Slack channel:

1. In Slack, go to the private channel and mention the Metabase app. For example, if you called your Slack app "Metabase", you'd just type `@Metabase`.

2. Slack will ask you if you want to invite your app to your channel, which you should.

Once you added the app to a private channel, you should see the channel in the list of channels when setting up a subscription or alerts within 10 mins (it can take a little time for Metabase to see all the channels the app has been invited to).

In order for metabase to see private channels, the app must have the `groups:read` OAuth scope. Although this scope should be granted when setting up the app through Metabase, older installations might not have this scope.

To check or edit your OAuth settings:

1. [Visit the app settings in slack](https://api.slack.com/apps/):
2. Click on the Metabase app in the list of apps.
3. Go to **OAuth & Permissions** in the sidebar.
4. Under **Scopes**, add the `groups:read` scope if it's not added already.
5. Reinstall the app by clicking the **Reinstall** button under **OAuth Tokens**.

## Further reading

- [Alerts](../questions/alerts.md)
- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Notification permissions](../permissions/notifications.md)
- [Setting up email](./email.md)
- [Usage analytics](../usage-and-performance-tools/usage-analytics.md)
