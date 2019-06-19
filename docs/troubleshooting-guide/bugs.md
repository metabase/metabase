If you come across something that looks like a bug, we suggest collecting the following information to help us reproduce the issue.

1. Metabase server logs
2. Javascript console logs
3. Can it be reproduced on the sample dataset?
4. Your Metabase version
5. Where Metabase is running (Docker image, AWS Elastic Beanstalk, Heroku, Linux/Ubuntu, etc)
6. Which database is used
7. What browser version

## Helpful tidbits

### Accessing the Metabase server logs
While you can always look for the logs Metabase leaves on your server file system (or however you collect logs), if you are logged into Metabase with an admin account, you can also access them from the gear drop down menu in the upper right hand corner -> Admin -> Troubleshooting -> Logs.

### Checking for Javascript console errors
Metabase will send debugging information and errors to your browser's developer console.

#### Chrome
You can open the console in Chrome by following the instructions at 
[https://developers.google.com/web/tools/chrome-devtools/open#console](https://developers.google.com/web/tools/chrome-devtools/open#console)

#### Firefox
You can open the console in Firefox by following the instructions at 
[https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console](https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console)

#### Safari
You can open the console in Safari by following the instructions at 
[https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac](https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac)

#### Edge
You can open the console in Edge by following the instructions at 
[https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium](https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium)
