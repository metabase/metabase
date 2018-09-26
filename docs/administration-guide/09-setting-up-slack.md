
## Setting up Slack

If you are using Slack for team communication and would like to have your Pulses be sent to Slack channels (or users) then you'll need to integrate your Metabase instance with Slack.  Luckily, this is really easy!

### Generating a Slack API Token

For Metabase to post to your Slack channels, you'll need to generate a Slack API token and make it available to Metabase.

To start, go to the Admin Panel from the dropdown menu in the top right of Metabase, then from the Settings page, click on **Slack** in the left menu.

You should see this form:

![Slack Settings](images/SlackSettings.png)

Then just click on the large and conveniently placed button `Create a Slack Bot User for Metabot` which will open a new browser tab and send you over to Slack to create the Bot user account.

Click over to the tab that was opened and you'll now be on the Slack Bot creation page.

![Slack API Auth](images/SlackAPIAuth.png)

Now give the Bot user a helpful name (we suggest `Metabot`) and click the `Add bot integration` button and a bot user will be generated for you.  Look for the Bot's API token in the next page. It will look like `xoxp-etc-etc-etc` and all you need to do is copy that value and head back to Metabase.

Paste the value into the text box for `Slack API Token` and click the button to save your changes.

Now go to Slack and create a new channel named `metabase_files`. Due to the Slack api, we'll need this to attach graphs to pulses and Metabot answers.

That's it!  Metabase will automatically run a quick test to check that the API token is working properly and if not you'll get an error message.

---

## Next: configuring Metabase
There are a few other settings you configure in Metabase. [Learn how](08-configuration-settings.md).
