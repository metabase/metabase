## Troubleshooting Process
1. Try to log in with a local account
2. Try to log in with a Google Auth SSO account
3. Example JavaScript and Server logs if you are not able to log in.

## Specific Problems:


### Invalid Google Auth Token:
Sometimes your token from Google will expire.

#### How to detect this:
Open up the JavaScript console. Try to log in with Google Auth, see if there are any error messages in the JavaScript console indicating an invalid account.

Also open up your server logs, and see if there are any errors related to authentication. If there are, try recreating the token.

#### How to fix this:
Remove the old token from the Google Auth SSO tab in the Admin Panel and create a new one. If the root cause was an invalid auth token, this should fix the problem.



## Helpful tidbits

### Accessing the Metabase server logs
While you can always look for the logs Metabase leaves on your server file system (or however you collect logs), if you are logged into Metabase with an admin account, you can also access them from the drop down menu in the upper right hand corner.

![Logs Screenshot](images/ServerLogs.png)

### Checking for JavaScript errors in your web browser
Metabase will print debugging information and errors to your browser's JavaScript Console.

You can open the JavaScript console by following the instructions for your specific browser:
* [Google Chrome](https://developers.google.com/web/tools/chrome-devtools/console/)
* [Mozilla Firefox](https://developer.mozilla.org/en-US/docs/Tools/Web_Console)
* [Safari](https://developer.apple.com/library/content/documentation/AppleApplications/Conceptual/Safari_Developer_Guide/Introduction/Introduction.html)
* [Internet Explorer](https://msdn.microsoft.com/en-us/library/gg589530(v=vs.85).aspx) (On many versions of IE you can also access the console by pressing the F12 key on your keyboard.)
* [Microsoft Edge](https://docs.microsoft.com/en-us/microsoft-edge/f12-devtools-guide/console)
