---
title: Upgrading Metabase
redirect_from:
  - /docs/latest/operations-guide/upgrading-metabase
---

# Upgrading Metabase

Instructions for upgrading to a new [Metabase release](https://github.com/metabase/metabase/releases).

## What happens during an upgrade or downgrade?

Metabase keeps all the metadata it needs to work on the application database. During a major version upgrade, the process will identify the version it's in and which version it needs to go to and perform all the migrations needed to start the new version.

If a major version downgrade occurs without migrating the schema first to a lower version, then Metabase will refuse to start.

You can move between minor versions across a specific major version without any issues. Unless it's critical, we don't perform any database migrations across minor versions.

## First: do a back up of your application database

The application database keeps track of every single thing (but the data of your connected database) of your Metabase instance. While it's unlikely you'll need to roll back to your current version, a backup will do wonders for your peace of mind in case something goes wrong.

See [Backing up Metabase application data](backing-up-metabase-application-data.md).

## Second: swapping in the new Metabase version

Steps differ depending on whether you're running the JAR or a container image.

### Upgrading the JAR

To upgrade, you'll need to stop the service, replace the JAR with the newer version, and restart the service.

E.g., if you're running Metabase on Debian as a service using Nginx.

1. Stop the Metabase service. Assuming you called your service `metabase.service`, you'll run:

   ```
   sudo systemctl stop metabase.service
   ```
2. Download the latest version of the JAR file:

   - [Metabase Open Source JAR](https://www.metabase.com/start/oss/jar)
   - [Metabase Pro or Enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar)

And replace the current (older) Metabase JAR file with the newer JAR you downloaded.

3. Restart the service:

   ```
   sudo systemctl restart metabase.service
   ```

### Upgrading the container image

If you're running Metabase in a container:

1. Stop the current container.

2. Pull the latest Metabase Docker image.

   Metabase Open Source:

   ```
   docker pull metabase/metabase:latest
   ```

   Metabase Pro or Enterprise:

   ```
   docker pull metabase/metabase-enterprise:latest
   ```

NOTE: we recommend that you pull a specific tag instead of using `latest`.

4. Start the new container image. Depending on the ports and what you want to name the container, the command will look something like:

   Metabase Open Source:

   ```
   docker run -d -p 3000:3000 -e MB_DB_CONNECTION_URI="jdbc:postgresql://<host>:5432/metabase?user=<username>&password=<password>" --name metabase metabase/metabase:latest
   ```

   Metabase Pro or Enterprise:

   ```
   docker run -d -p 3000:3000 -e MB_DB_CONNECTION_URI="jdbc:postgresql://<host>:5432/metabase?user=<username>&password=<password>" --name metabase metabase/metabase-enterprise:latest
   ```

On startup, Metabase will perform the upgrade automatically. Once Metabase has completed the upgrade, you'll be running the new version.

## Upgrading from older versions of Metabase

If you're on a Metabase version older than Metabase 40, you'll need to upgrade release by release until you're on the latest version of Metabase 40. From the latest version of Metabase 40, you can then jump to the current version of Metabase.

For example, if you're running Metabase 1.38, your upgrade path would look like:

- 1.38.X
- 1.39.X
- 1.40.X
- Latest

With X being the latest version available for each release.

Check out a list of [Metabase releases](https://github.com/metabase/metabase/releases).

## Upgrading Metabase Cloud

If you're on a [Metabase Cloud](https://www.metabase.com/pricing/) plan, we'll upgrade your Metabase automatically with each new release; no action needed on your end. How soon we upgrade you depends on the type of release:

- Minor releases (e.g., x.47.4 to x.47.5): Usually about a week.
- Major releases (e.g., x.47.4 to x.48.0): Longer, usually months (just to make sure everything goes smoothly).

Cloud customers can request an early upgrade by emailing support at help@metabase.com. Include the URL of the Metabase you want us to upgrade.

## Upgrading Metabase on other platforms

- [Upgrading Azure Web Apps deployments](running-metabase-on-azure.md#additional-configurations)

## Rolling back an upgrade or to an older version

In general, regular backups (especially backups before upgrading), are the best policy, so we recommend reverting to a backup of your application database to roll back an upgrade.

But if you've made any change (adding new questions/dashboards, etc) since upgrading that you want to keep, you may be able to use the `migrate down` command to roll back your Metabase application database to support the previous Metabase version you were running. When Metabase upgrades to a new version, it runs migrations that may change the application database schema. The `migrate down` command undoes those schema changes. In general, we recommend restoring from a backup (the backup that you definitely remembered to generate before upgrading), and only using the `migrate down` command if you really need to keep changes made after your upgrade.

### Using the migrate down command

Stop your Metabase and use the current, upgraded Metabase JAR (not the Metabase JAR you want to roll back to) to complete the rollback with the `migrate down` command. Make sure that the connection details for your application database are set in the environment variables, for example:

```
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabaseappdb
export MB_DB_PORT=5432
export MB_DB_USER=username
export MB_DB_PASS=password
export MB_DB_HOST=localhost
java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar migrate down
```

If you're running Docker, use the command `"migrate down"` (with the quotes around `"migrate down"`), and include the connection details for your application database, for example:

```
docker run
  -e "MB_DB_TYPE=postgres" \
  -e "MB_DB_DBNAME=metabaseappdb" \
  -e "MB_DB_PORT=5432" \
  -e "MB_DB_USER=name" \
  -e "MB_DB_PASS=password" \
  -e "MB_DB_HOST=my-database-host" \
--rm metabase/metabase:<tag> "migrate down"
```
(Note the quotes around `"migrate down"`)

or just open a shell into the container and run the migrate command inside it.

Once the migration process completes, start up Metabase using the JAR or container image for the version you want to run.

## Upgrading clusters

If you're running Metabase in a cluster:
1) reduce the number of nodes to just one
2) perform the upgrade
3) raise the number of nodes to the same quantity you had before

If you keep more than one node when you do a major version upgrade, the application will not behave correctly (since nodes running the older version will probably get wrong data/data with the wrong schema from the application database).

NOTE: you can't upgrade all nodes at the same time, since the process works by acquiring a migration lock on the application database from a single client, which performs the migration.
