# Setting up Slack

If you want to have your [Dashboard subscriptions][dashboard-subscriptions] sent to Slack channels (or people on Slack), an admin must first integrate your Metabase with Slack.

Here's an overview of the steps for setting up Slack:

1. [Create your Slack App](#create-your-slack-app)
2. [Give Slack your app manifest](#the-app-manifest)
3. [Install your app to your workspace](#install-your-app-to-your-workspace)
4. [Get the Bot User OAuth Token](#the-bot-user-oauth-token)
5. [Create a dedicated Metabase channel in your Slack](#create-a-dedicated-metabase-channel-in-your-slack)
6. [Save your changes](#save-your-changes-in-metabase)

## Create your Slack App

For Metabase to post to your Slack channels, you’ll need to create a Slack App and make it available to Metabase.

From any Metabase page, go to **Admin settings** > **Settings** > **Slack**.

Click on **Open Slack Apps**. Metabase will open a new browser tab and send you over to the Slack website to create the Slack app.

On the Slack website, click **Create an App**. Select **From an app manifest** and and select the Slack workspace you want Metabase to post to (you're not going to be developing an app, this is just telling Slack what workspace you want Metabase to post to).

## The app manifest

To get the app manifest, head back to Metabase and the Slack settings page, copy the manifest, and return to the Slack app creation page on the Slack website to paste in the manifest (the manifest is in YAML format). The manifest will take care of settings for your app and help speed things along. Once you've pasted the manifest, click the **Next** button. Then hit **Create** to set up your Slack app.

## Install your app to your workspace

On the Slack site for your newly created app, in the **Settings** > **Basic Information** tab, under **Install your app**, click on **Install to workspace**. On the next screen, click **Allow** to give Metabase access to your Slack workspace.

## The Bot User OAuth Token

On the Slack site page for your Slack app, on the left in the **Features** section, click on **OAuth and Permissions** in the Slack Apps sidebar and then copy the **Bot User OAuth Token**. Return to the Slack settings page in your Metabase and paste this token in the Metabase field with the same name.

## Create a dedicated Metabase channel in your Slack

In your Slack workspace, create a public channel named whatever you want — we think something like "metabase" does just fine — then enter that channel's name in the **Slack Channel Name** field in Metabase. This channel allows your Metabase to post to your Slack workspace without having to deal with unnecessary permissions. Make sure the channel you create is the same channel that you enter in this field in Metabase (omit the "#" prefix).

## Save your changes in Metabase

In Metabase, click on the **Save changes** button and that’s it! Metabase will automatically run a quick test to check that the API token and your dedicated Slack channel are working properly. If something goes wrong, it'll give you an error message.

---

## Next: configuring Metabase

There are a few other settings you configure in Metabase. [Learn how](08-configuration-settings).

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.html
