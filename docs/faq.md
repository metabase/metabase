# Frequently Asked Questions

### I can't log into Metabase. Can you reset my password?

If you are running the Mac OS X application on your laptop, you can click on the Help menu item and click `Reset Password`.

If you are using a browser to access Metabase, then someone downloaded our software and installed it on a server. We at Metabase don't host your instance. We write software that someone at your company decided to run.  You should ask whoever it is that set up your company's Metabase (a good starting point for this would be to ask whoever). 

### How should I use the Mac OS X application?

Our Mac OS X application is best thought of as Metabase in single-player mode. It's meant to be a way to quickly try out the program and see if it's something you'd want to use across your team. It's also useful for use on your own.

When you need to share dashboards or pulses with others, we *strongly* recommend you run our server application. 

### Does Metabase support SQL Joins?

Metabase does not expose a "Join" operator, but we do provide ways for non-SQL-proficient users to perform the tasks that joins are used for such as filtering or grouping by columns in other tables, etc.

For more info see our [blog post on the subject](http://www.metabase.com/blog/Joins)

### Can I use SQL with Metabase?

[Yes](http://www.metabase.com/docs/latest/users-guide/03-asking-questions.html#using-sql). 


### Do I need to know SQL to use Metabase?
[No](http://www.metabase.com/docs/latest/users-guide/03-asking-questions.html)


### Why can't I do X in the Query Builder?

The primary audience of the GUI querying interface is a non-technical user who doesn't SQL. Advanced users can always [use SQL](http://www.metabase.com/docs/latest/users-guide/03-asking-questions.html#using-sql).

We're constantly trying to walk the line between putting more functionality into the GUI interface and creating a confusing mess. You can expect it to improve and change with time, but in the meantime, you can always lean on SQL directly for the complicated matters.

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
* SQL Server
* SQLite 

### Can Metabase support database X?

Metabase is built by a small core team, and we have very limited engineering bandwidth. Each additional database we connect to slows down overall product development, increases the time and cost of our automated testing and requires us to learn a lot about the edge cases of the specific database driver. While writing a given driver might only take a few days, supporting it places a cost on us indefinitely.

That said, we will build out additional database connectors as we are able to. We generally select additional drivers based on demand from the community and our ability to set up a test database server easily in our integrated testing environment. 

We welcome community contributions of database connectors. If you're able to help, we have [open issues](https://github.com/metabase/metabase/labels/Database%20Support) for a number of databases. We'd greatly appreciate your help!

### Can Metabase connect to Google Analytics, Salesforce, etc.?

No. Metabase is a fast and easy way for you to access and share information you have in a database. We do not currently offer a way to connect to third-party APIs or services directly. What people do instead in these situations is download data from these services into a database they control and then use Metabase to access that database directly. This can be done either by writing code or more commonly using a third-party service. There are a large number of these services, and you can ask other users and discuss pros and cons at our [user forum](https://discourse.metabase.com).

One caveat is that if you are using Google Analytics Premium, one of the features is direct access to a BigQuery database with your personal Google Analytics data. In this situation, you can use Metabase with that BigQuery dataset directly.

### Can I upload data to Metabase?

Not exactly. Metabase provides access to data you have in an existing database you control. We currently do not add or modify the information in your database. You should ask whomever controls the database you are accessing how to upload the data you're interested in accessing.

### Can you help me debug something?

Yes, to the extent that we are able to and have time. 

In the event of a clear bug, please [open an issue](https://github.com/metabase/metabase/issues/new).

If you're having other trouble, please start a conversation at our [discussion forum](http://discourse.metabase.com) and check out the other threads. Someone else might have experienced the same problem. 

### Do you offer paid support?

We are experimenting with offering paid support to a limited number of companies. [Contact us](http://www.metabase.com/services/) if you want more information. 

### Can I embed charts or dashboards in another application?

Not yet. We're working on it however, and you should expect it in the near future. (Late summer/early fall 2016). Keep tabs on it at the main [tracking issue](https://github.com/metabase/metabase/issues/1380)
