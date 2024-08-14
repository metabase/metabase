---
title: Running Metabase on Docker
redirect_from:
  - /docs/latest/operations-guide/running-metabase-on-docker
---

# Running Metabase on Docker

Metabase provides an official Docker image via Dockerhub that can be used for deployments on any system that is running Docker.

If you're trying to upgrade your Metabase version on Docker, check out these [upgrading instructions](upgrading-metabase.md).

## Open Source quick start

Use this quick start to run the Open Source version of Metabase locally. See below for instructions on [running Metabase in production](#production-installation).

Assuming you have [Docker](https://www.docker.com/) installed and running, get the latest Docker image:

```
docker pull metabase/metabase:latest
```

Then start the Metabase container:

```
docker run -d -p 3000:3000 --name metabase metabase/metabase
```

This will launch an Metabase server on port 3000 by default.

Optional: to view the logs as your Open Source Metabase initializes, run:

```
docker logs -f metabase
```

Once startup completes, you can access your Open Source Metabase at `http://localhost:3000`.

To run your Open Source Metabase on a different port, say port 12345:

```
docker run -d -p 12345:3000 --name metabase metabase/metabase
```

## Pro or Enterprise quick start

Use this quick start if you have a [license token](../paid-features/activating-the-enterprise-edition.md) for a [Pro or Enterprise version](https://www.metabase.com/pricing) of Metabase, and you want to run Metabase locally. See below for instructions on [running Metabase in production](#production-installation).

Assuming you have [Docker](https://www.docker.com/) installed and running, get the latest Docker image:

```
docker pull metabase/metabase-enterprise:latest
```

Then start the Metabase container:

```
docker run -d -p 3000:3000 --name metabase metabase/metabase-enterprise
```

This will launch a Metabase server on port 3000 by default.

Optional: to view the logs as Metabase initializes, run:

```
docker logs -f metabase
```

Once startup completes, you can access your Pro or Enterprise Metabase at `http://localhost:3000`.

To run your Pro or Enterprise Metabase on a different port, say port 12345:

```
docker run -d -p 12345:3000 --name metabase metabase/metabase-enterprise
```

## Production installation

Metabase ships with an embedded H2 database that uses the file system to store its own application data. Meaning, if you remove the container, you'll lose your Metabase application data (your questions, dashboards, collections, and so on).

If you want to run Metabase in production, you'll need store your application data in a [production-ready database](./migrating-from-h2.md#supported-databases-for-storing-your-metabase-application-data).

Once you've provisioned a database, like Postgres, for Metabase to use to store its application data, all you need to do is provide Metabase with the connection information and credentials so Metabase can connect to it.

### Running Docker in production

Let's say you set up a Postgres database by running:

```
createdb metabaseappdb
```

No need to add any tables; Metabase will create those on startup. And let's assume that database is accessible via `my-database-host:5432` with username `name` and password `password`.

Here's an example Docker command that tells Metabase to use that database:

```
docker run -d -p 3000:3000 \
  -e "MB_DB_TYPE=postgres" \
  -e "MB_DB_DBNAME=metabaseappdb" \
  -e "MB_DB_PORT=5432" \
  -e "MB_DB_USER=name" \
  -e "MB_DB_PASS=password" \
  -e "MB_DB_HOST=my-database-host" \
   --name metabase metabase/metabase
```

Keep in mind that Metabase will be connecting from _within_ your Docker container, so make sure that either: a) you're using a fully qualified hostname, or b) that you've set a proper entry in your container's `/etc/hosts file`.

## Migrating to a production installation

If you've already been running Metabase with the default application database (H2), and want to use a production-ready application database without losing your app data (your questions, dashboards, etc), see [Migrating from H2 to a production database](migrating-from-h2.md).

## Example Docker compose YAML file

Here's an example `docker-compose.yml` file for running Metabase with a PostgreSQL database `metabaseappdb`:

```yml
version: "3.9"
services:
  metabase:
    image: metabase/metabase:latest
    container_name: metabase
    hostname: metabase
    volumes:
      - /dev/urandom:/dev/random:ro
    ports:
      - 3000:3000
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabaseappdb
      MB_DB_PORT: 5432
      MB_DB_USER: metabase
      MB_DB_PASS: mysecretpassword
      MB_DB_HOST: postgres
    networks:
      - metanet1
    healthcheck:
      test: curl --fail -I http://localhost:3000/api/health || exit 1
      interval: 15s
      timeout: 5s
      retries: 5
  postgres:
    image: postgres:latest
    container_name: postgres
    hostname: postgres
    environment:
      POSTGRES_USER: metabase
      POSTGRES_DB: metabaseappdb
      POSTGRES_PASSWORD: mysecretpassword
    networks:
      - metanet1
networks:
  metanet1:
    driver: bridge
```

## Additional Docker maintenance and configuration

- [Customizing the Metabase Jetty server](#customizing-the-metabase-jetty-server)
- [Docker-specific environment variables](#docker-specific-environment-variables)
- [Setting the Java Timezone](#setting-the-java-timezone)
- [Copying the application database](#copying-the-application-database)
- [Mounting a mapped file storage volume](#mounting-a-mapped-file-storage-volume)
- [Getting your config back if you stopped your container](#getting-your-config-back-if-you-stopped-your-container)
- [Adding external dependencies or plugins](#adding-external-dependencies-or-plugins)
- [Use Docker Secrets to hide sensitive parameters](#use-docker-secrets-to-hide-sensitive-parameters)
- [Troubleshooting](#troubleshooting)
- [Continue to setup](#continue-to-setup)

### Customizing the Metabase Jetty server

You can use any of the custom settings from [Customizing the Metabase Jetty Webserver](../configuring-metabase/customizing-jetty-webserver.md) by setting environment variables in your Docker run command.

### Docker-specific environment variables

In addition to the standard custom settings there are two docker specific environment variables `MUID` and `MGID` which are used to set the user and group IDs used by metabase when running in a docker container. These settings make it possible to match file permissions when files, such as the application database, are shared between the host and the container.

Here's how to use a database file, owned by your account and stored in your home directory:

```
docker run -d -v ~/my-metabase-db:/metabase.db --name metabase -e MB_DB_FILE=/metabase.db -e MUID=$UID -e MGID=$GID -p 3000:3000 metabase/metabase
```

### Setting the Java Timezone

It's best to set your Java timezone to match the timezone you'd like all your reports to come in. You can do this by simply specifying the `JAVA_TIMEZONE` environment variable which is picked up by the Metabase launch script. For example:

```
docker run -d -p 3000:3000 \
  -e "JAVA_TIMEZONE=US/Pacific" \
  --name metabase metabase/metabase
```

### Copying the application database

The default location for the application database in the container is `/metabase.db/metabase.db.mv.db`. You can copy this directory out of the container using the following command (replacing `CONTAINER_ID` with the actual container ID or name, `metabase` if you named the container):

```
docker cp CONTAINER_ID:/metabase.db ./
```

The DB contents will be left in a directory named metabase.db.

### Mounting a mapped file storage volume

To persist your data outside of the container and make it available for use between container launches, we can mount a local file path inside our container.

```
docker run -d -p 3000:3000 \
  -v ~/metabase-data:/metabase-data \
  -e "MB_DB_FILE=/metabase-data/metabase.db" \
  --name metabase metabase/metabase
```

When you launch your container, Metabase will use the database file (`MB_DB_FILE`) at `~/metabase-data/metabase.db` instead of its default location. and we are mounting that folder from our local filesystem into the container.

### Getting your config back if you stopped your container

If you've previously run and configured your Metabase using the local Database and then stopped the container, your data will still be there unless you deleted the container with the `docker rm` command. To recover your previous configuration:

#### 1. Find the stopped container using the `docker ps -a` command. It will look something like this:

```
docker ps -a | grep metabase
    ca072cd44a49        metabase/metabase        "/app/run_metabase.sh"   About an hour ago   Up About an hour          0.0.0.0:3000->3000/tcp   metabase
    02e4dff057d2        262aa3d0f714             "/app/run_metabase.sh"   23 hours ago        Exited (0) 23 hours ago                            pedantic_hypatia
    0d2170d4aa4a        262aa3d0f714             "/app/run_metabase.sh"   23 hours ago        Exited (0) 23 hours ago                            stoic_lumiere
```

Once you have identified the stopped container with your configuration in it, save the container ID from the left most column for the next step.

#### 2. Use `docker commit` to create a new custom docker image from the stopped container containing your configuration.

```
docker commit ca072cd44a49 mycompany/metabase-custom
sha256:9ff56186de4dd0b9bb2a37c977c3a4c9358647cde60a16f11f4c05bded1fe77a
```

#### 3. Run your new image using `docker run` to get up and running again.

```
docker run -d -p 3000:3000 --name metabase mycompany/metabase-custom
430bb02a37bb2471176e54ca323d0940c4e0ee210c3ab04262cb6576fe4ded6d
```

You should have your previously configured Metabase Installation back. If it's not the one you expected, try a different stopped container and repeat these steps.

### Adding external dependencies or plugins

To add external dependency JAR files, such as the Oracle or Vertica JDBC drivers or 3rd-party Metabase drivers), you'll need to:

- create a `plugins` directory in your host system, and
- bind that directory so it's available to Metabase as the path `/plugins` (using either `--mount` or `-v`/`--volume`).

For example, if you have a directory named `/path/to/plugins` on your host system, you can make its contents available to Metabase using the `--mount` option as follows:

```
docker run -d -p 3000:3000 \
  --mount type=bind,source=/path/to/plugins,destination=/plugins \
  --name metabase metabase/metabase
```

Note that Metabase will use this directory to extract plugins bundled with the default Metabase distribution (such as drivers for various databases such as SQLite), thus it must be readable and writable by Docker.

### Use Docker Secrets to hide sensitive parameters

In order to keep your connection parameters hidden from plain sight, you can use Docker Secrets to put all parameters in files so Docker can read and load them in memory before it starts the container.

Here is an example `docker-compose.yml` file to start a Metabase Docker container with secrets to connect to a PostgreSQL database.

In addition to this example yml file, you'll need to create two files:

- db_user.txt
- db_password.txt

These files should be in the same directory as the `docker-compose.yml`. Put the db_user in the db_user.txt file, and db_password in the db_password.txt file.

Notice the "\_FILE" on the environment variables that have a secret:

```yml
version: "3.9"
services:
  metabase:
    image: metabase/metabase:latest
    container_name: metabase
    hostname: metabase
    volumes:
      - /dev/urandom:/dev/random:ro
    ports:
      - 3000:3000
    environment:
      MB_DB_TYPE: postgres
      MB_DB_DBNAME: metabase
      MB_DB_PORT: 5432
      MB_DB_USER_FILE: /run/secrets/db_user
      MB_DB_PASS_FILE: /run/secrets/db_password
      MB_DB_HOST: postgres
    networks:
      - metanet1
    secrets:
      - db_password
      - db_user
    healthcheck:
      test: curl --fail -I http://localhost:3000/api/health || exit 1
      interval: 15s
      timeout: 5s
      retries: 5
  postgres:
    image: postgres:latest
    container_name: postgres
    hostname: postgres
    environment:
      POSTGRES_USER_FILE: /run/secrets/db_user
      POSTGRES_DB: metabase
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    networks:
      - metanet1
    secrets:
      - db_password
      - db_user
networks:
  metanet1:
    driver: bridge
secrets:
  db_password:
    file: db_password.txt
  db_user:
    file: db_user.txt
```

We currently support the following [environment variables](../configuring-metabase/environment-variables.md) to be used as secrets:

- MB_DB_USER
- MB_DB_PASS
- MB_DB_CONNECTION_URI
- MB_EMAIL_SMTP_PASSWORD
- MB_EMAIL_SMTP_USERNAME
- MB_LDAP_PASSWORD
- MB_LDAP_BIND_DN

In order for the Metabase container to read the files and use the contents as a secret, the environment variable name needs to be appended with a "\_FILE" as explained above.

## Troubleshooting

See Running Metabase in the [Troubleshooting guide](../troubleshooting-guide/running.md).

## Continue to setup

Now that you've installed Metabase, it's time to [set it up and connect it to your database](../configuring-metabase/setting-up-metabase.md).
