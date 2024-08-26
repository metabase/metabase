---
title: Running Metabase on Podman
redirect_from:
  - /docs/latest/operations-guide/running-metabase-on-podman
---

# Running Metabase on Podman

Our official Metabase Docker image is compatible on any system that is running [Podman](https://podman.io).

## Open Source quick start

Assuming you have [Podman](https://podman.io) installed and running, get the latest container image:

```
podman pull docker.io/metabase/metabase:latest
```

Then start the Metabase container:

```
podman run -d -p 3000:3000 --name=metabase docker.io/metabase/metabase:latest
```

This will launch an Metabase server on port 3000 by default.

Optional: to view the logs as your Open Source Metabase initializes, run:

```
podman logs -f metabase
```

Once startup completes, you can access your Open Source Metabase at `http://localhost:3000`.

To run your Open Source Metabase on a different port, say port 12345:

```
podman run -d -p 12345:3000 --name=metabase docker.io/metabase/metabase:latest
```

## Pro or Enterprise quick start

Use this quick start if you have a [license token](../paid-features/activating-the-enterprise-edition.md) for a [Pro or Enterprise version](https://www.metabase.com/pricing) of Metabase, and you want to run Metabase locally.

Assuming you have [Podman](https://podman.io) installed and running, get the latest container image:

```
podman pull docker.io/metabase/metabase-enterprise:latest
```

Then start the Metabase container:

```
podman run -d -p 3000:3000 --name=metabase docker.io/metabase/metabase-enterprise:latest
```

This will launch a Metabase server on port 3000 by default.

Optional: to view the logs as Metabase initializes, run:

```
podman logs -f metabase
```

Once startup completes, you can access your Pro or Enterprise Metabase at `http://localhost:3000`.

To run your Pro or Enterprise Metabase on a different port, say port 12345:

```
podman run -d -p 12345:3000 --name=metabase docker.io/metabase/metabase-enterprise:latest
```

## Production installation

Metabase ships with an embedded H2 database that uses the file system to store its own application data. Meaning, if you remove the container, you'll lose your Metabase application data (your questions, dashboards, collections, and so on).

If you want to run Metabase in production, you'll need store your application data in a [production-ready database](./migrating-from-h2.md#supported-databases-for-storing-your-metabase-application-data).

Once you've provisioned a database, like Postgres, for Metabase to use to store its application data, all you need to do is provide Metabase with the connection information and credentials so Metabase can connect to it.

### Running Podman in production

Let's say you set up a Postgres database by running:

```
createdb metabaseappdb
```

No need to add any tables; Metabase will create those on startup. And let's assume that database is accessible via `my-database-host:5432` with username `name` and password `password`.

Here's an example Podman command that tells Metabase to use that database:

```
podman run -d -p 3000:3000 \
  -e "MB_DB_TYPE=postgres" \
  -e "MB_DB_DBNAME=metabaseappdb" \
  -e "MB_DB_PORT=5432" \
  -e "MB_DB_USER=name" \
  -e "MB_DB_PASS=password" \
  -e "MB_DB_HOST=my-database-host" \
   --name metabase metabase/metabase
```

Keep in mind that Metabase will be connecting from _within_ your Podman container, so make sure that either: a) you're using a fully qualified hostname, or b) that you've set a proper entry in your container's `/etc/hosts file`.

## Migrating to a production installation

If you've already been running Metabase with the default application database (H2), and want to use a production-ready application database without losing your app data (your questions, dashboards, etc), see [Migrating from H2 to a production database](migrating-from-h2.md).

## Additional Podman maintenance and configuration

- [Running Metabase as a service](#running-metabase-as-a-service)
- [Customizing the Metabase Jetty server](#customizing-the-metabase-jetty-server)
- [Setting the Java Timezone](#setting-the-java-timezone)
- [Troubleshooting](#troubleshooting)
- [Continue to setup](#continue-to-setup)

### Running Metabase as a service

We can use the [systemd](https://systemd.io/) initialization service to register a Metabase service that can be started and stopped automatically. Prior to executing this process, ensure that the Metabase container is operational. Then, utilize Podman's built-in feature to generate the service file as follows:

```
sudo podman generate systemd --new --name metabase > metabase.service
```

Before executing the service, inspect the contents of the `metabase.service` file to verify that all the accurate configurations are present. Once confirmed, locate the service file to the appropriate location by running the command:

```
sudo mv metabase.service /etc/systemd/system
```

To enable the automatic initiation of the Metabase service during system boot, execute:

```
sudo systemctl enable metabase
```

To verify that the system functions correctly, reboot the system. Upon completion of the system initialization process, the Metabase container should be operational as intended.

### Customizing the Metabase Jetty server

You can use any of the custom settings from [Customizing the Metabase Jetty Webserver](../configuring-metabase/customizing-jetty-webserver.md) by setting environment variables in your Podman run command.

### Setting the Java Timezone

It's best to set your Java timezone to match the timezone you'd like all your reports to come in. You can do this by simply specifying the `JAVA_TIMEZONE` environment variable which is picked up by the Metabase launch script. For example:

```
podman run -d -p 3000:3000 \
  -e "JAVA_TIMEZONE=US/Pacific" \
  --name metabase metabase/metabase
```

## Troubleshooting

See Running Metabase in the [Troubleshooting guide](../troubleshooting-guide/running.md).

## Continue to setup

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../configuring-metabase/setting-up-metabase.md).
