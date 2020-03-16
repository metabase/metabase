## Troubleshooting Process

1. Try to log in with a local account
2. Try to log in with a Google Auth SSO account
3. Example JavaScript and Server logs if you are not able to log in.

## Specific Problems:

### Forgotten Password

[This FAQ](../faq/using-metabase/how-do-i-reset-my-password.md) will tell you what to do in the event of a forgotten password.

### Invalid Google Auth Token:

Sometimes your token from Google will expire.

#### How to detect this:

Open up the JavaScript console. Try to log in with Google Auth, see if there are any error messages in the JavaScript console indicating an invalid account.

Also open up your server logs, and see if there are any errors related to authentication. If there are, try recreating the token.

#### How to fix this:

Remove the old token from the Google Auth SSO tab in the Admin Panel and create a new one. If the root cause was an invalid auth token, this should fix the problem.

## Helpful tidbits

### Accessing the Metabase server logs

While you can always look for the logs Metabase leaves on your server file system (or however you collect logs), if you are logged into Metabase with an admin account you can also access them from the Logs tab in the Troubleshooting section of the Admin Panel. To get to the Admin Panel, click the gear icon in the top-right of Metabase.

### Checking for Javascript console errors

Metabase will send debugging information and errors to your browser's developer console. To open the developer console, follow the instructions for your web browser of choice:

- [Chrome](https://developers.google.com/web/tools/chrome-devtools/open#console)
- [Firefox](https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console)
- [Safari](https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac)
- [Edge](https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium)
