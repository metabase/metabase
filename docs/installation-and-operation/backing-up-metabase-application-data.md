---
title: Backing up Metabase
redirect_from:
  - /docs/latest/operations-guide/backing-up-metabase-application-data
---

# Backing up Metabase

Avoid losing your application data (all of your questions, dashboards, collections and so on) by backing up your data.

Metabase uses a single SQL database for all of its runtime application data, so all you need to do is back up that database and you're good to go. You can use that backup to restore your Metabase installation if anything goes wrong (like during an upgrade).

## Backing up the default H2 database

If you didn't specify an application database using environment variables when you launched Metabase, Metabase will have created an embedded H2 database in its directory.

But if you're at the point where you have questions and dashboards that you want to keep, you should consider migrating to a [production-ready database](migrating-from-h2.md) before you upgrade.

If you're just using Metabase for personal use and want to keep your application data, here's what you'll need to do.

### If you're running the Metabase JAR

1. Navigate to your Metabase directory.
2. If your Metabase is running, stop the Metabase process. You can either close the terminal or kill the process with CTRL-C. If you are running the process as a service, then stop the service.
3. Copy the application database file (called `metabase.db.mv.db`) and keep that copy somewhere safe. That's it.
4. Restart Metabase: `java -jar metabase.jar` or start the service again.

### If you're running the Metabase Docker image

If you're running Docker, you should already have switched to a [production-ready database](migrating-from-h2.md).

Before migrating to a production application database, you should copy the H2 app db file out of the Docker container. For example, if the container is called metabase, you'd run:

```
docker cp metabase:/metabase.db/metabase.db.mv.db ./
```

The above command would copy the database file to the directory you ran the command from. You can also create a copy of this H2 file and use it to migrate the data to a production-ready database. See [Migrating from H2](migrating-from-h2.md).

## Amazon RDS for the application database

Amazon has its own best practices on how to backup and restore RDS databases, so we'll defer to them. We recommend that you enable automated RDS Backups.

Instructions can be found in the [Amazon RDS User Guide](http://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.html).

## Self-hosted PostgreSQL database

If you're hosting your own PostgreSQL database, simply follow PostgreSQL's instructions for [backing up your database](https://www.postgresql.org/docs/current/backup.html).

As long as you have a dump of the Metabase database, you should be good to go.
