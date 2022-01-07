# Setting up Slack

If you want to have your [Dashboard subscriptions][dashboard-subscriptions] sent to Slack channels (or people), then you’ll first need to integrate your Metabase instance with Slack.

## Creating your Slack App

For Metabase to post to your Slack channels, you’ll need to create a Slack App and make it available to Metabase.

From any Metabase page, go to **Admin settings** > **Settings** > **Slack**. 

Click on **Open Slack Apps**. Metabase will open a new browser tab and send you over to Slack to create the App.

On the Slack website, click **Create an App**.

### The app manifest

Select **From an app manifest** and and select the Slack workspace you want Metabase to post to.

To get the manifest, head back to Metabase, copy the manifest, and return to the Slack website to paste in the manifest. The manifest will take care of settings for your app and help speed things along. Once you've pasted the manifest in Slack Apps, click the **Next** button and then **Create** to set up your Slack App.

### The Bot User OAuth Token

Almost there! We just need a couple things from you to help Slack talk to Metabase. Click on **OAuth and Permissions** in the Slack Apps sidebar and copy the **Bot User OAuth Token**. Paste this token in the Metabase field with the same name:

## Create a dedicated Metabase channel in your Slack

In your Slack workspace, create a public channel named whatever you want — we think something like "Metabase" does just fine — then enter that channel's name in the **Slack Channel Name** field in Metabase. This channel allows your Metabase to post to your Slack workspace without having to deal with unnecessary permissions. Due to the way the Slack API is set up, we’ll need this channel to attach charts Dashboard Subscriptions. 

## Save your changes in Metabase

In Metabase, click on the **Save changes** button and that’s it! Metabase will automatically run a quick test to check that the API token is working properly. If something goes wrong, it'll give you an error message.

---

## Next: configuring Metabase
There are a few other settings you configure in Metabase. [Learn how](08-configuration-settings.md).

[dashboard-subscriptions]: ../users-guide/dashboard-subscriptions.html
