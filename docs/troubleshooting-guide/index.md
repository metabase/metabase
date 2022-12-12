---
title: Troubleshooting guides
---

# Troubleshooting guides

Problems, their causes, how to detect them, and how to fix them.

## Installation

- [Running the Metabase JAR][running].
- [Running Metabase on Docker][docker].
- [Using or migrating from an H2 application database][appdb].

## Authentication

- [People can't log in to Metabase][login].
- [LDAP][ldap].
- [SAML][saml].

## Permissions

- [My permissions aren't working][permissions].
- [My data sandboxes aren't working][sandbox].

## Databases

- [I can't connect to a database][db-connection].
- [I can't see my tables][cant-see-tables].
- [The data in Metabase doesn't match my database][sync-fingerprint-scan].
- [My database is slow][db-performance].
- [My connection or query is timing out][timeout].

## Questions and dashboards

- [I can't save my question or dashboard][proxies].
- [I can't view or edit my question or dashboard][view-edit].
- [My visualizations are wrong][visualization].
- [My dashboard is slow or failing to load][slow-dashboard].
- [My SQL question doesn't work][sql].
- [The dates and times in my questions and charts are wrong][incorrect-times].
- [My filters don't work][filters].
- [My linked filters don't work][linked-filters].

## Models

- [My model doesn't work][models].

## Email and alerts

- [Metabase isn't sending email][not-sending-email].

## Error messages

- [I'm getting an error message][error-message].

## Think you found a bug?

- [How to find known bugs or limitations][known-issues].
- [Filing a bug report][bugs].

## Feature requests

See [Requesting new features][feature-request].

## Metabase server and console logs

Metabase will log errors, both on the server and in the browser console, depending on where the error occurs, which can help you track down an issue. Administrators will have access to the server logs, and everyone with a browser can open the developer tools to see the console logs.

**Accessing the Metabase server logs**: You can look for the logs that Metabase leaves on the server's file system (or wherever else you collect logs). If you're logged into Metabase with an Admin account, you can also access the logs by going to the top right of the screen and clicking on the **gear** icon > **Admin settings** > **Troubleshooting** > **Logs**. Check out [How to read the server logs][server-logs].

**Checking for Javascript console errors:** Metabase will send debugging information and errors to your browser's developer console. To open the developer console, follow the instructions for your web browser:

- [Chrome][chrome]
- [Firefox][firefox]
- [Safari][safari]
- [Edge][edge]

## Metabase tutorials

For tutorials that walk you through how to use Metabase features, check out [Learn Metabase][learn].

## Metabase forum

To see if someone else has run into a similar issue, check out [our forum on Discourse][forum].

## Upgrading Metabase

Metabase adds new features and squashes bugs with each release. [Upgrading to the latest and greatest][upgrade] may resolve your issue. If you're using [Metabase Cloud][cloud], we'll handle the upgrades for you. You can checkout the [release notes][releases] to see what's new.

[appdb]: ./loading-from-h2.md
[bugs]: ./bugs.md
[cant-see-tables]: ./cant-see-tables.md
[chrome]: https://developers.google.com/web/tools/chrome-devtools/open#console
[cloud]: https://www.metabase.com/start/
[db-connection]: ./db-connection.md
[db-performance]: ./db-performance.md
[docker]: ./docker.md
[edge]: https://docs.microsoft.com/en-us/microsoft-edge/devtools-guide-chromium
[error-message]: error-message.md
[feature-request]: requesting-new-features.md
[filters]: ./filters.md
[firefox]: https://developer.mozilla.org/en-US/docs/Tools/Web_Console/Opening_the_Web_Console
[forum]: https://discourse.metabase.com/
[incorrect-times]: ./timezones.md
[known-issues]: ./known-issues.md
[ldap]: ./ldap.md
[learn]: https://www.metabase.com/learn
[linked-filters]: ./linked-filters.md
[login]: ./cant-log-in.md
[models]: ./models.md
[not-sending-email]: ./cant-send-email.md
[permissions]: ./permissions.md
[proxies]: ./proxies.md
[releases]: https://github.com/metabase/metabase/releases
[running]: ./running.md
[safari]: https://support.apple.com/guide/safari-developer/develop-menu-dev39df999c1/mac
[server-logs]: ./server-logs.md
[saml]: ./saml.md
[sandbox]: ./sandboxing.md
[slow-dashboard]: ./my-dashboard-is-slow.md
[sql]: ./sql.md
[sync-fingerprint-scan]: ./sync-fingerprint-scan.md
[timeout]: ./timeout.md
[upgrade]: ../installation-and-operation/upgrading-metabase.md
[view-edit]: ./cant-view-or-edit.md
[visualization]: ./visualization.md
