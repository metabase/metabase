# What are you having trouble with?

This page collects resources for getting you unstuck.

## Troubleshooting guides

Problems, their causes, how to detect them, and how to fix them.

### Using Metabase

- [Logging in][login].

- [Saving questions or dashboards][proxies].

- [My dashboard is slow][slow-dashboard].

- [My dashboard filters don't work][filters].

- [My dashboard's linked filters don't work][linked-filters].

### Setup and administration

- [Running the Metabase JAR][running].

- [Running Metabase on Docker][docker].

- [Connecting to data warehouses with Metabase][datawarehouse].

- [Setting up LDAP][ldap].

- [Metabase isn't sending email][not-sending-email].

- [Using the default H2 application database][appdb].

- [Loading an exported H2 application database][loadh2].

- [The dates and times in my questions and charts are wrong][incorrect-times].

- [I can't see my tables][cant-see-tables].

- [Managing data sandboxing][sandbox].

- [Fixing missing or out-of-sync tables and columns][sync-fingerprint-scan].

## Think you found a bug?

Let us know by [filing a bug report][bugs].

## Metabase server and console logs

Metabase will log errors, both on the server and in the browser console, depending on where the error occurs, which can help you track down an issue. Administrators will have access to the server logs, and everyone with a browser can open the developer tools to see the console logs.

**Accessing the Metabase server logs**: You can look for the logs that Metabase leaves on the server's file system (or wherever else you collect logs). If you're logged into Metabase with an Admin account, you can also access the logs by clicking on the **gears icon** in the top right of the main nav, selecting **Admin**, clicking on the **Troubleshooting** tab, then viewing the **Logs** tab. Check out [How to read the server logs][server-logs].

**Checking for Javascript console errors:** Metabase will send debugging information and errors to your browser's developer console. To open the developer console, follow the instructions for web browser:

- [Chrome][chrome]
- [Firefox][firefox]
- [Safari][safari]
- [Edge][edge]

## Metabase tutorials 

For tutorials that walk you through how to use Metabase features, check out [Learn Metabase][learn].

## Metabase forum

To see if someone else has run into a similar issue, check out [our forum on Discourse][forum].

## Frequently asked questions

For quick answers to common questions, check out our [Frequently Asked Questions][faq].

## Upgrading Metabase

Metabase adds new features and squashes bugs with each release. [Upgrading to the latest and greatest][upgrade] may resolve your issue. If you're using [Metabase Cloud][cloud], we'll handle the upgrades for you. You can checkout the [release notes][releases] to see what's new.

[appdb]: ./application-database.html
[bugs]: ./bugs.html
[cant-see-tables]: ./cant-see-tables.html
[chrome]: https://developers.google.com/web/tools/chrome-devtools/open#console
[cloud]: https://www.metabase.com/start/ 
[datawarehouse]: ./datawarehouse.html
[docker]: ./docker.html
[edge]: https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium
[faq]: /faq
[filters]: ./filters.html
[firefox]: https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console
[forum]: https://discourse.metabase.com/
[incorrect-times]: ./times-appear-incorrect.html
[ldap]: ./ldap.html
[learn]: https://www.metabase.com/learn
[linked-filters]: ./linked-filters.html
[login]: ./loggingin.html
[loadh2]: ./loading-from-h2.html
[not-sending-email]: ./cant-send-email.html
[proxies]: ./proxies.html
[releases]: https://github.com/metabase/metabase/releases
[running]: ./running.html
[safari]: https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac
[server-logs]: ./server-logs.html
[sandbox]: ./sandboxing.html
[slow-dashboard]: ./my-dashboard-is-slow.html
[sync-fingerprint-scan]: ./sync-fingerprint-scan.html
[upgrade]: ../operations-guide/upgrading-metabase.html
