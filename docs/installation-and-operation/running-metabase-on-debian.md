---
title: Running Metabase as a systemd service
redirect_from:
  - /docs/latest/operations-guide/running-metabase-on-debian
---

# Running Metabase as a systemd service

For those people who don't (or can't) use Docker in their infrastructure, you can register Metabase as a [systemd](https://wiki.debian.org/systemd) service that can be started/stopped/uninstalled.

We'll use Debian as an example in this guide, but the steps should apply to most Linux distributions that use systemd. This is a _bare-bones recipe_ to get you started. Anyone can take it from here to do what they need to do on their systems, and should follow best practices for setting up and securing the rest of their server.

## Assumptions

The core assumptions in this guide:

- You have a [Java Runtime Environment (JRE)](../installation-and-operation/running-the-metabase-jar-file.md#1-install-java-jre) installed on your system
- You will run Metabase using the `metabase.jar` file
- You already have Nginx running on your server
- You will use environment variables to configure your Metabase instance
- You have root access on your server

For production setups, you must set up a [PostgreSQL or MySQL/MariaDB application database](../installation-and-operation/configuring-application-database.md) as Metabase's application database.

## Create an unprivileged user to run Metabase

For security reasons, we want to have Metabase run as an unprivileged user. If you don't already have such a user, create one called `metabase`:

```sh
# Create a "metabase" group
sudo groupadd -r metabase

# Create a "metabase" user, with a home directory at /home/metabase
sudo useradd -m -r -s /bin/false -g metabase metabase
```

## Download the Metabase JAR file

The Metabase JAR file can be stored anywhere that the `metabase` user can read from.
One convenient location is this user's home directory at `/home/metabase`.

If you prefer to use a different location for the Metabase JAR file, make sure to update any references to `/home/metabase/metabase.jar` in the following steps throughout this guide.

```sh
# Download the Metabase OSS JAR file into /home/metabase:
sudo -u metabase wget -O /home/metabase/metabase.jar https://downloads.metabase.com/latest/metabase.jar

# Or, if you're using Metabase Pro/Enterprise:
sudo -u metabase wget -O /home/metabase/metabase.jar https://downloads.metabase.com/enterprise/latest/metabase.jar

```

## Environment variables for Metabase

[Environment variables](../configuring-metabase/environment-variables.md) let you configure and customize your Metabase instance.

We'll create a file to store these environment variables, which we'll use when creating the systemd service for Metabase.

This command will create an environment variable file at `/home/metabase/.env`, which you should update to point to your [PostgreSQL application database](../installation-and-operation/configuring-application-database.md):

```bash
sudo -u metabase cat << EOF > /home/metabase/.env
MB_JETTY_HOST=127.0.0.1
MB_JETTY_PORT=3000

# Uncomment and update the variables below to connect to your Postgres application database
# If not set, Metabase will use a built-in database (not suitable for production)
# MB_DB_TYPE=postgres
# MB_DB_HOST=your_metabase_db_hostname
# MB_DB_PORT=5432
# MB_DB_DBNAME=your_metabase_db_name
# MB_DB_USER=your_metabase_db_user
# MB_DB_PASS=your_metabase_db_password
EOF
```

## Create a Metabase service

Every service needs a configuration file that tells systemd how to manage it and what capabilities it supports. System-wide services are typically registered at `/etc/systemd/system/<servicename>`. So, a Metabase service should live at `/etc/systemd/system/metabase.service`.

### The Metabase service file

The following command will create a file at `/etc/systemd/system/metabase.service` with a simple systemd service file to run Metabase:

```sh
sudo cat << EOF > /etc/systemd/system/metabase.service
[Unit]
Description=Metabase server
After=network.target

[Service]
WorkingDirectory=~
ExecStart=/usr/bin/java --add-opens java.base/java.nio=ALL-UNNAMED -jar /home/metabase/metabase.jar
EnvironmentFile=/home/metabase/.env
User=metabase
Type=simple
SuccessExitStatus=143
TimeoutStopSec=120
Restart=always

[Install]
WantedBy=multi-user.target
EOF
```

The best part of setting up Metabase as a systemd service is that it will start up at every system boot, and get restarted automatically if it crashes. We only have a few more quick steps to finish registering our service and having Metabase up and running.

## Ensure your database is ready

If you're running a PostgreSQL application database, make sure you've created a database for Metabase, as well as a user that can access that database. These values should match what you've set in your Metabase config for the `MB_DB_TYPE`, `MB_DB_DBNAME`, `MB_DB_USER`, and `MB_DB_PASS` environment variables. If you don't have your database properly configured, Metabase won't be able to start.

## Ensure Nginx proxies requests to Metabase

Getting into too much detail about configuring Nginx is well outside the scope of this guide, but here's a quick `nginx.conf` file that will get you up and running.

**Note:** The `nginx.conf` below assumes you are accepting incoming traffic on port 80 and want to proxy requests to Metabase, and that your Metabase instance is configured to run on `localhost` at port 3000. There are several proxy directives you may care about, so you should check those out further in the [official Nginx docs](https://nginx.org/en/docs/).

```
# sample nginx.conf
# proxy requests to Metabase instance
server {
  listen 80;
  listen [::]:80;
  server_name yourdomain.example.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
  }
}
```

## Register your Metabase service

Now, it's time to register our Metabase service with systemd so it will start up at system boot:

```
sudo systemctl daemon-reload
sudo systemctl start metabase.service
sudo systemctl status metabase.service
```

To print the live Metabase service logs, you can run:

```
journalctl -fxeu metabase.service
```

Once we are OK here, enable the service to start up during boot:

```
sudo systemctl enable metabase.service
```

## Start, stop, or restart Metabase

Now, whenever you need to restart, stop, or start Metabase, all you need to do is:

```
sudo systemctl restart metabase.service
sudo systemctl stop metabase.service
sudo systemctl start metabase.service
```
