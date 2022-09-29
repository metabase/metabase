---
title: Upgrading Metabase
redirect_from:
  - /docs/latest/operations-guide/upgrading-metabase
---

# Upgrading Metabase

## Backing up your application database

The application database keeps track of all of your people, dashboards, questions, collections, permissions: all the application data in Metabase (that is, everything but the data you've connected to Metabase). While it's unlikely you'll need to roll back to your current version, a backup will do wonders for your peace of mind.

See [Backing up Metabase application data](backing-up-metabase-application-data.md).

## Swapping in the new Metabase version

Steps differ depending on whether you're running the JAR or a Docker image.

- [Upgrading a JAR running locally](#upgrading-a-jar-running-locally)
- [Upgrading a JAR running in production as a service](#upgrading-a-jar-running-in-production-as-a-service)
- [Upgrading the Docker image](#upgrading-the-docker-image)

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

## Upgrading Metabase Cloud

If you're on a [Metabase Cloud](https://www.metabase.com/pricing) plan, your Metabase will upgrade automatically with each new release; no action needed on your end. There's usually a short period of time (typically a week or so), between when Metabase announces a new release and when the Cloud team starts rolling out the new version on Metabase Cloud. This buffer just gives the Cloud team some time to make sure the upgrades go smoothly.

## Upgrading Metabase on other platforms

- [AWS Elastic Beanstalk deployments](./running-metabase-on-elastic-beanstalk.md#deploying-new-versions-of-metabase-on-elastic-beanstalk)
- [Azure Web Apps deployments](./running-metabase-on-azure.md#additional-configurations)
- [Heroku deployments](./running-metabase-on-heroku.md#deploying-new-versions-of-metabase)

