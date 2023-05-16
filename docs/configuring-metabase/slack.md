---
title: Slack
redirect_from:
  - /docs/latest/administration-guide/09-setting-up-slack
---

# Slack

If you want to have your [Dashboard subscriptions](../dashboards/subscriptions.md) or [alerts](../questions/sharing/alerts.md) sent to Slack channels (or people on Slack), an admin must first integrate your Metabase with Slack.

## Create your Slack App

For Metabase to post to your Slack channels, you’ll need to create a Slack App and make it available to Metabase.

From any Metabase page, go to **Admin settings** > **Settings** > **Slack**.

Click on **Open Slack Apps**. Metabase will open a new browser tab and send you over to the Slack website to create the Slack app.

On the Slack website, click **Create an App**.

### Pick a workspace to develop your app

Select the workspace you want to create your app.

### The app manifest

When you click on **Open Slack App**, Metabase will pass along the app manifest, which Slack will use to set up your app.

You may get a warning that says:

**This app is created from a 3rd party manifest** Always verify URLs and permissions below.

This warning is expected (Metabase is the third party here). You can click on **Configure** to see the app manifest Metabase sent along in the URL. Here is the manifest in YAML format:

```
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
```

The manifest just take cares of some settings for your app and helps speed things along.

Click the **Next** button. Then hit **Create** to set up your Slack app.

## Install your app to your workspace

On the Slack site for your newly created app, in the **Settings** > **Basic Information** tab, under **Install your app**, click on **Install to workspace**. On the next screen, click **Allow** to give Metabase access to your Slack workspace.

## The Bot User OAuth Token

On the Slack site page for your Slack app, on the left in the **Features** section, click on **OAuth and Permissions** in the Slack Apps sidebar and then copy the **Bot User OAuth Token**. Return to the Slack settings page in your Metabase and paste this token in the Metabase field with the same name.

## Create a dedicated Metabase channel in your Slack

In your Slack workspace, create a public channel named whatever you want — we think something like "metabase" does just fine — then enter that channel's name in the **Slack Channel Name** field in Metabase. This channel allows your Metabase to post to your Slack workspace without having to deal with unnecessary permissions. Make sure the channel you create is the same channel that you enter in this field in Metabase (omit the "#" prefix).

> If you rename the channel in Slack, you'll need to update the **Slack Channel Name** in Metabase to that new name.

## Save your changes in Metabase

In Metabase, click on the **Save changes** button and that’s it! Metabase will automatically run a quick test to check that the API token and your dedicated Slack channel are working properly. If something goes wrong, it'll give you an error message.

## Further reading

- [Alerts](../questions/sharing/alerts.md)
- [Dashboard subscriptions](../dashboards/subscriptions.md)
- [Notification permissions](../permissions/notifications.md)
- [Setting up email](./email.md)
- [Auditing Metabase](../usage-and-performance-tools/audit.md)

