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

This will launch a Metabase server on port 3000 by default.

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

Use this quick start if you have a [license token](../installation-and-operation/activating-the-enterprise-edition.md) for a [Pro or Enterprise version](https://www.metabase.com/pricing) of Metabase, and you want to run Metabase locally.

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

If you want to run Metabase in production, you'll need to store your application data in a [production-ready database](./migrating-from-h2.md#supported-databases-for-storing-your-metabase-application-data).

Once you've provisioned a database, like Postgres, for Metabase to use to store its application data, all you need to do is provide Metabase with the connection information and credentials so Metabase can connect to it.

### Running Podman in production

Let's say you set up a Postgres database for Metabase by running:

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
   --name metabase docker.io/metabase/metabase
```

Keep in mind that Metabase will be connecting from _within_ your Podman container. If your Postgres database is running on the same machine you can replace `my-database-host` with `host.containers.internal`. Otherwise make sure that either a) you're using a fully qualified hostname, or b) that you've set a proper entry in your container's `/etc/hosts` file.

## Migrating to a production installation

If you've already been running Metabase with the default application database (H2), and want to use a production-ready application database without losing your app data (your questions, dashboards, etc), see [Migrating from H2 to a production database](migrating-from-h2.md).

## Additional Podman maintenance and configuration

- [Running Metabase as a user-level service](#running-metabase-as-a-user-level-service)
- [Customizing the Metabase Jetty server](#customizing-the-metabase-jetty-server)
- [Setting the Java Timezone](#setting-the-java-timezone)
- [Troubleshooting](#troubleshooting)
- [Continue to setup](#continue-to-setup)

### Running Metabase as a user-level service

One of Podman's advantages is that you can run Metabase as a user through systemd instead of as root. Before executing this process: 

* Ensure that the Metabase container is operational.
* Choose or create the user you will use to run Metabase.
* Make sure that user has a systemd service file folder by running `mkdir -p ~/.config/containers/systemd/` as the user.
* Run `loginctl enable-linger [user]` where `[user]` is the user that will own your Metabase process. Doing so will ensure that Metabase continues to run after you have logged out of that user's session.

Create a new file called `metabase.container` in `~/.config/containers/systemd/`. Add the following to the file:

```
# metabase.container
[Unit]
Description=Metabase container
[Container]
ContainerName=metabase
Environment=MB_DB_TYPE=postgres MB_DB_DBNAME=metabase MB_DB_PORT=5432 MB_DB_USER=name MB_DB_PASS=password MB_DB_HOST=my-database-host
Image=docker.io/metabase/metabase:latest
PublishPort=3000:3000
[Install]
WantedBy=default.target
```

Replace the `MB_DB` variables with your Postgres login information and ports. As with the Podman command above, you can replace `my-database-host` with `host.containers.internal` if Postgres is on your localhost and not in a container. Make sure you pick a port that is available to your user.

Save your unit file.

Next, inform systemd about the new unit file:

`systemctl --user daemon-reload`

This command will create a new service file that systemd will use. You can test that its creation went well by checking its status:

`systemctl --user status metabase.service`

You should see something like:

```
● metabase.service - Metabase container
     Loaded: loaded (/home/user/.config/containers/systemd/metabase.container; enabled; preset: disabled)
     Active: inactive (dead)
```

If you don't see the service has loaded, you can use Podman's quadlet tool to help debug:

`/usr/libexec/podman/quadlet -dryrun -user`

That command will pretend to run through the process of creating the service file with some verbosity and help expose any issues.

If you see that the service's status is loaded and inactive then you can inspect the contents of the service file at `~/.config/systemd/user/metabase.service`. Verify that all the accurate configuration details from your unit file are present and that there are no surprises. For instance, it pays to make sure your database password doesn't contain a % sign which might trigger a [existing systemd unit specifier](https://docs.redhat.com/en/documentation/red_hat_enterprise_linux/9/html/using_systemd_unit_files_to_customize_and_optimize_your_system/assembly_working-with-systemd-unit-files_working-with-systemd#important-unit-specifiers_assembly_working-with-systemd-unit-files).

If all looks good, start the service:

`systemctl --user start metabase.service`

The service should start up and you should be able to visit `http://localhost:3000` and see a welcome screen. If that works, your last step is to ensure that Metabase will start automatically on reboot:

`systemctl --user enable metabase.service`

To verify that systemd is managing Metabase correctly, reboot the system. Upon reboot the Metabase container should be operational as intended.

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
