# Frequently Asked Questions

## Logging in

### I can't log into Metabase. Can you reset my password?

If you are running the MacOS application on your laptop, you can click on the Help menu item and click `Reset Password`.

If you are using a browser to access Metabase, then someone downloaded our software and installed it on a server. We at Metabase don't host your instance. We write software that someone at your company decided to run. You should ask whomever it was that set up your company's Metabase for help resetting your password.


## Metabase on macOS

### How should I use the macOS application?

Our macOS application is best thought of as Metabase in single-player mode. It's meant to be a way to quickly try Metabase out and see if it's something you'd want to use across your team. It's also useful for use on your own.

When you need to share dashboards or pulses with others, we *strongly* recommend you run our server application.


## Asking questions and running queries

### Can I use SQL with Metabase?
[Yes](http://www.metabase.com/docs/latest/users-guide/04-asking-questions.html#using-sql).

### Do I need to know SQL to use Metabase?
[No](http://www.metabase.com/docs/latest/users-guide/04-asking-questions.html)

### Does Metabase support SQL Joins?

Metabase does not expose a "Join" operator, but we do provide ways for non-SQL-proficient users to perform the tasks that joins are used for such as filtering or grouping by columns in other tables, etc.

For more info see our [blog post on the subject](http://www.metabase.com/blog/Joins)

### Why can't I do X in the Query Builder?

The primary audience of the GUI querying interface is a non-technical user who doesn't SQL. Advanced users can always [use SQL](http://www.metabase.com/docs/latest/users-guide/04-asking-questions.html#using-sql).

We're constantly trying to walk the line between putting more functionality into the GUI interface and creating a confusing mess. You can expect it to improve and change with time, but in the meantime, you can always lean on SQL directly for the complicated matters.

### Why can't I seem to use drill-through or question actions?

Metabase allows you to [click on your charts or tables to explore or zoom in](http://www.metabase.com/docs/latest/users-guide/03-basic-exploration.html), but these features don't currently work with SQL/native queries (this is because Metabase doesn't currently parse these kinds of queries). The same is true of the question actions menu in the bottom-right of the question detail page.

However, in [Metabase version 0.25 we introduced nested queries](http://www.metabase.com/blog/Metabase-0.25#nested-questions), a feature that lets you use the results of SQL/native queries as the starting table for GUI-based questions. This means you'll be able to use sophisticated SQL/native queries to create the exact segments you need, and you and your team will be able to use drill-through and actions if you create GUI-based questions from those segments.

## Why are my field or table names showing up with weird spacing?

By default, Metabase attempts to make field names more readable by changing things like `somehorriblename` to `Some Horrible Name`. This does not work well for languages other than English, or for fields that have lots of abbreviations or codes in them. If you'd like to turn this setting off, you can do so from the Admin Panel under Settings > General > Friendly Table and Field Names.

To manually fix field or table names if they still look wrong, you can go to the Metadata section of the Admin Panel, select the database that contains the table or field you want to edit, select the table, and then edit the name(s) in the input boxes that appear.

## Dashboards

### Can I add headings, free text, section dividers, or images to my dashboards?
Not currently, but these are all enhancements that we're considering.

### Why do my cards fade out when I use dashboard filters?
When one or more dashboard filters are active, any card on that dashboard that isn't connected to *every currently active filter* will fade out a bit to clarify that they are not being affected by all active filters. We understand this behavior is contentious, so we're [actively discussing it on GitHub](https://github.com/metabase/metabase/issues/4220).

### Can I set permissions to choose which users can view which dashboards?
Not directly. But if a user does not have permission to view *any* of the cards that a dashboard includes, she won't see that dashboard listed in the Dashboards section, and won't be allowed to see that dashboard if given a direct link to it. Additionally, we're currently actively considering placing dashboards inside collections, which would allow administrators to use collection permissions to restrict user group access to dashboards the same way they currently can to restrict access to saved questions.

### Why can't I make my dashboard cards smaller?
Metabase has minimum size limits for dashboard cards to ensure that numbers and charts on dashboards are legible. You might be asking this question because you're trying to fit a lot of things in a dashboard, and another way we're exploring to solve *that* problem is by making it easier to put more than one series or metric in the same question, which would reduce the number of cards required to be on a dashboard in the first place.

### When I make a number card on a dashboard small, the number changes. Why?
In an effort to make sure that dashboards are legible, Metabase changes the way charts and numbers in cards look at different sizes. When a number card is small, Metabase abbreviates numbers like 42,177 to 42k, for example.


## Pulses and Metabot

### Why do my charts look different when I put them in a Pulse?
Metabase automatically changes the visualization type of saved questions you put in Pulses so that they fit better in emails and Slack. Here is [an inventory of how charts get changed](https://github.com/metabase/metabase/issues/5493#issuecomment-318198816), and here is [the logic for how this works](https://github.com/metabase/metabase/blob/8f1a287496899250d89a20ec57ac8477cd20bce5/src/metabase/pulse/render.clj#L385-L397).

We understand this behavior isn't expected, and are currently exploring ways to handle this better.

### Why can't I send tables?
Metabase currently has a limit on how many columns and rows can be included in a Pulse as a safeguard against massive tables getting plopped in users' inboxes, but this is [an issue we're actively discussing changing](https://github.com/metabase/metabase/issues/3894).

### Can I attach files like CSVs to a Pulse?
Not yet, but [the community is working on it](https://github.com/metabase/metabase/pull/5502)!

### Can I set more specific or granular schedules for Pulses?
Not yet, but [we'd love your help](https://github.com/metabase/metabase/issues/3846#issuecomment-318516189) working on implementing designs for this feature.

### Can I send Pulses to private Slack channels, or to multiple channels?
No, this is currently [a limitation with the way we're required to implement our Slack integration](https://github.com/metabase/metabase/issues/2694).



## Databases

### Does Metabase support database X?

Metabase currently supports:

* Amazon Redshift
* BigQuery
* CrateDB (version 0.57 or higher)
* Druid
* H2
* MongoDB (version 3.0 or higher)
* MySQL (and MariaDB)
* PostgreSQL
* Presto
* SQL Server
* SQLite

### Can Metabase support database X?

Metabase is built by a small core team, and we have very limited engineering bandwidth. Each additional database we connect to slows down overall product development, increases the time and cost of our automated testing and requires us to learn a lot about the edge cases of the specific database driver. While writing a given driver might only take a few days, supporting it places a cost on us indefinitely.

That said, we will build out additional database connectors as we are able to. We generally select additional drivers based on demand from the community and our ability to set up a test database server easily in our integrated testing environment.

We welcome community contributions of database connectors. If you're able to help, we have [open issues](https://github.com/metabase/metabase/labels/Database%20Support) for a number of databases. We'd greatly appreciate your help!

### Can Metabase connect to Google Analytics, Salesforce, etc.?

Metabase currently supports Google Analytics as a data source. The connection can be set up by an admin the same way database connections are set. If you are using Google Analytics Premium, one of the features is direct access to a BigQuery database with your personal Google Analytics data. BigQuery is also supported by Metabase.

We do not currently offer a way to connect to other third-party APIs or services directly. What people do instead in these situations is download data from these services into a database they control and then use Metabase to access that database directly. This can be done either by writing code or more commonly using a third-party service. There are a large number of these services, and you can ask other users and discuss pros and cons at our [user forum](https://discourse.metabase.com).

### Can I upload data to Metabase?

Not exactly. Metabase provides access to data you have in an existing database you control. We currently do not add or modify the information in your database. You should ask whomever controls the database you are accessing how to upload the data you're interested in accessing.



## Support and troubleshooting

### Can you help me debug something?

Yes, to the extent that we are able to and have time.

If you're sure you've found a bug, please [open an issue](https://github.com/metabase/metabase/issues/new). Otherwise, try checking out the [troubleshooting guide](http://www.metabase.com/troubleshooting/) first to see if the answer to your problem is there.

If you're still having trouble, please start a conversation at our [discussion forum](http://discourse.metabase.com) and check out the other threads. Someone else might have experienced the same problem.

### Do you offer paid support?

We are experimenting with offering paid support to a limited number of companies. [Contact us](http://www.metabase.com/services/) if you want more information.

## Embedding

### Can I embed charts or dashboards in another application?

Yes, Metabase offers two solutions for sharing charts and dashboards:
- [Public links](http://www.metabase.com/docs/latest/administration-guide/12-public-links.html) let you share or embed charts with simplicity.
- A powerful [application embedding](http://www.metabase.com/docs/latest/administration-guide/13-embedding.html) let you to embed and customize charts in your own web applications.
