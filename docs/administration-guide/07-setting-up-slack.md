
## Setting up Slack

If you are using Slack for team communication and would like to have your Pulses be sent to Slack channels (or users) then you'll need to integrate your Metabase instance with Slack.  Luckily, this is really easy!

### Generating a Slack API Token

For Metabase to post to your Slack channels, you'll need to generate a Slack API token and make it available to Metabase.

To start, go to the Admin Panel from the dropdown menu in the top right of Metabase, then from the Settings page, click on **Slack** in the left menu.

You should see this form:

![Slack Settings](images/SlackSettings.png)

Then just click on the large and conveniently placed button `Get an API token from Slack` which will open a new browser tab and send you over to Slack to create the token.

Click over to the tab that was opened and you'll now be on the Slack API page under the Authentication section which will show you any API tokens that you have created for your various Slack teams.  

![Slack API Auth](images/SlackAPIAuth.png)

Now just click the `Create token` button next to the team you want to integrate with and a token will be generated for you.  It will look like `xoxp-etc-etc-etc` and all you need to do is copy that value and head back to Metabase.

Paste the value into the text box for `Slack API Token` and click the button to save your changes.  That's it!  Metabase will automatically run a quick test to check that the API token is working properly and if not you'll get an error message.

## Next: Single Sign On
Learn how to [configure Single Sign On](08-single-sign-on.md) to let users sign in or sign up with just a click.
