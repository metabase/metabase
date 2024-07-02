---
title: Upgrading Metabase
redirect_from:
  - /docs/latest/operations-guide/upgrading-metabase
---

# Upgrading Metabase

Instructions for upgrading to a new [Metabase release](../releases.md).

## Backing up your application database

The application database keeps track of all of your people, dashboards, questions, collections, permissions: all the application data in Metabase (that is, everything but the data you've connected to Metabase). While it's unlikely you'll need to roll back to your current version, a backup will do wonders for your peace of mind.

See [Backing up Metabase application data](backing-up-metabase-application-data.md).

## Swapping in the new Metabase version

Steps differ depending on whether you're running the JAR or a Docker image.

### Upgrading a JAR running locally

If you're running the JVM Jar file directly:

1. [Back up your application database](backing-up-metabase-application-data.md).

2. Download the latest version of the JAR file:

   - [Metabase Open Source JAR](https://www.metabase.com/start/oss/jar)
   - [Metabase Pro or Enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar)

3. Use a terminal to access your existing Metabase process and kill it (usually CTRL-C).

4. Replace the existing JAR file (`metabase.jar`) in your Metabase directory with the newer version.

5. Restart the server:

   ```
   java -jar metabase.jar
   ```

On startup, Metabase will perform any tasks it needs to complete the upgrade. Once Metabase has completed those tasks, you'll be running the new version.

### Upgrading a JAR running in production as a service

To upgrade, you'll need to stop the service, replace the JAR with the newer version, and restart the service.

E.g., if you're running Metabase on Debian as a service using Nginx.

1. [Back up your application database](backing-up-metabase-application-data.md).

2. Download the latest version of the JAR file:

   - [Metabase Open Source JAR](https://www.metabase.com/start/oss/jar)
   - [Metabase Pro or Enterprise JAR](https://downloads.metabase.com/enterprise/latest/metabase.jar)

3. Stop the Metabase service. Aassuming you called your service `metabase.service`), you'll run:

   ```
   sudo systemctl stop metabase.service
   ```

4. In your Metabase directory on your server, replace the current (older) Metabase JAR file with the newer JAR you downloaded.

5. Restart the service:

   ```
   sudo systemctl restart metabase.service
   ```

### Upgrading the Docker image

If you're running Metabase in a Docker container:

1. [Back up your application database](backing-up-metabase-application-data.md).

   > WARNING: If you're not using a [production-ready database](migrating-from-h2.md), your application data (questions, dashboards, and so on) will have been stored in an H2 database _inside_ your container. Upgrading requires swapping out your existing container for a new image with the upgraded Metabase JAR, which will wipe out your application data. We recommend switching to a production-ready database before you upgrade.

2. Stop the current Docker container.

3. Pull the latest Metabase Docker image.

   Metabase Open Source:

   ```
   docker pull metabase/metabase:latest
   ```

   Metabase Pro or Enterprise:

   ```
   docker pull metabase/metabase-enterprise:latest
   ```

4. Start the new Docker container. Depending on the ports and what you want to name the container, the command will look something like:

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

For a list of releases, see [Metabase versions](../releases.md).

## Upgrading Metabase Cloud

If you're on a [Metabase Cloud](https://www.metabase.com/pricing) plan, we'll upgrade your Metabase automatically with each new release; no action needed on your end. How soon we upgrade you depends on the type of release:

- Minor releases (e.g., x.47.4 to x.47.5): Usually about a week.
- Major releases (e.g., x.47.4 to x.48.0): Longer, usually weeks (just to make sure everything goes smoothly).

Cloud customers can request an early upgrade by emailing support at help@metabase.com. Include the URL of the Metabase you want us to upgrade.

## Upgrading Metabase on other platforms

- [Upgrading Azure Web Apps deployments](running-metabase-on-azure.md#additional-configurations)

## Rolling back an upgrade

In general, regular backups (especially backups before upgrading), are the best policy, so we recommend reverting to a backup of your application database to roll back an upgrade.

But if you've made changes to your application database since upgrading that you want to keep, you may be able to use the `migrate down` command to roll back your Metabase application database to support the previous Metabase version you were running. When Metabase upgrades to a new version, it runs migrations that may change the application database schema. The `migrate down` command undoes those schema changes. In general, we recommend restoring from a backup (the backup that you definitely remembered to generate before upgrading), and only using the `migrate down` command if you really need to keep changes made after your upgrade.

### Using the migrate down command

Stop your Metabase and use the current, upgraded Metabase JAR (not the Metabase JAR you want to roll back to) to complete the rollback with the `migrate down` command. Make sure that the connection details for your application database are set in the environment variables, for example:

```
export MB_DB_TYPE=postgres
export MB_DB_DBNAME=metabaseappdb
export MB_DB_PORT=5432
export MB_DB_USER=username
export MB_DB_PASS=password
export MB_DB_HOST=localhost
java -jar metabase.jar migrate down
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
--rm metabase/metabase "migrate down"
```

Once the migration process completes, start up Metabase using the JAR or Docker image for the version you want to run.
