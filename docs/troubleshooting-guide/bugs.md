If you come across something that looks like a bug, start by searching our [Github issues](https://github.com/metabase/metabase/issues) to see if it has already been reported. If it has, please let us know you're experiencing the same issue by reacting with a thumbs up emoji or adding a comment providing additional information.

If the bug has not yet been reported, go ahead and [open a bug report](https://github.com/metabase/metabase/issues/new?assignees=&labels=Bug&template=bug_report.md&title=). We suggest collecting the following information to help us reproduce the issue:

1. Metabase server logs
2. Javascript console logs
3. Can it be reproduced on the sample dataset?
4. Your Metabase version
5. Where Metabase is running (Docker image, AWS Elastic Beanstalk, Heroku, Linux/Ubuntu, etc)
6. Which database is used
7. What browser version
8. Screenshots (if relevant)

## Helpful tidbits

### Accessing the Metabase server logs
While you can always look for the logs Metabase leaves on your server file system (or however you collect logs), if you are logged into Metabase with an admin account, you can also access them from the gear drop down menu in the upper right hand corner -> Admin -> Troubleshooting -> Logs.

### Checking for Javascript console errors
Metabase will send debugging information and errors to your browser's developer console. To open the developer console, follow the instructions for your web browser of choice:

* [Chrome](https://developers.google.com/web/tools/chrome-devtools/open#console)
* [Firefox](https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console)
* [Safari](https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac)
* [Edge](https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium)
