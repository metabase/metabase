---
title: Running Metabase on Docker
---

# Running Metabase on Docker

Docker simplifies many aspects of running Metabase, but there are some pitfalls to keep in mind. If you have trouble with Metabase under Docker, try going through the troubleshooting process below, then look below for details about the specific issue you've found.

1. Is the container running?
2. Is the server running inside the container?
3. Is Metabase using the correct application database?
4. Can you connect to the Docker host on the Metabase port?
5. Can you connect to the container from the Docker host?
6. Can you connect to the server from within the container?

You may find these commands useful along the way. To get to the shell in the Metabase container:

```
docker exec -ti CONTAINER_NAME bash
```

And to get the logs for the Metabase container:

```
docker logs -f CONTAINER_NAME
```

## Metabase container exits without starting the server

**How to detect this:** Run `docker ps` to see if the Metabase container is currently running. If it is, move on to the next step.

If `docker ps` does not show the running container, then list the stopped containers by running:

```
docker ps -a | grep metabase/metabase
```

Look for the container that exited most recently and make a note of the container ID. Look at that container's logs with:

```
Docker logs CONTAINER_ID
```

## Metabase container is running but the server is not

**How to detect this:** Run `docker ps` to make sure the container is running. The server should be logging to the Docker container logs. Check this by running:

```
docker logs CONTAINER_NAME
```

You should see a line like this at the beginning:

```
05-10 18:11:32 INFO metabase.util :: Loading Metabase...
```

Further down, you should eventually see a line like:

```
05-10 18:12:30 INFO metabase.core :: Metabase Initialization COMPLETE
```

If you see the lines below:

```
05-15 19:07:11 INFO metabase.core :: Metabase Shutting Down ...
05-15 19:07:11 INFO metabase.core :: Metabase Shutdown COMPLETE
```

then Metabase has shut itself down.

**How to fix this:** Check the Docker container logs for errors about connecting to the application database. Watch the logs to see if Metabase is still being started; the command:

```
Docker logs -f CONTAINER_ID
```

will let you see the logs as they are printed.

If the container is being terminated before it finished starting, the problem could be a health check timeout in the orchestration service used to start the container, such as Docker Cloud.

If the container is _not_ being terminated from the outside, but is failing to start anyway, this problem is probably not specific to Docker. If you're using a Metabase-supplied image, please [open a GitHub issue](https://github.com/metabase/metabase/issues/new/choose).

## Not connecting to a remote application database

**How to detect this:** If this is a new Metabase instance, then the database you specified via the environment variables will be empty. If this is an existing Metabase instance with incorrect environment parameters, the server will create a new H2 embedded database to use for application data and you’ll see lines similar to these in the log:

```
05-10 18:11:40 INFO metabase.core :: Setting up and migrating Metabase DB. Please sit tight, this may take a minute...
05-10 18:11:40 INFO metabase.db :: Verifying h2 Database Connection ...

05-10 18:11:40 INFO metabase.db :: Verify Database Connection ...  ✅
```

**How to fix this:** Check that you are passing environments to Docker correctly. You can list the environment variables for a container with this command:

```
docker inspect some-postgres -f '{% raw %}{{ .Config.Env }}{% endraw %}'
```

## The Metabase server isn't able to connect to a MySQL or PostgreSQL database

**How to detect this:** The logs for the Docker container return an error message after the "Verifying Database Connection" line.

**How to fix this:** Try to connect using the `mysql` or `psql` command with the connection string parameters you are passing in [via the environment variables][configuring-application-database]. If you can't connect to the database, the problem is due to either the credentials or connectivity. To verify that the credentials are correct, log in with those credentials from another machine and then try to make the same connection from the host running the Docker container.

One easy way to run this is to use Docker to start a container that has the appropriate client for your database. For Postgres this would look like:

```
docker run --name postgres-client --rm -ti --entrypoint /bin/bash postgres
```

From within that container, try connecting to the database host using the client command in the container such as `psql`. If you are able to connect from another container on the same host, then try making that connection from within the Metabase Docker container itself:

```
docker exec -ti container-name bash
```

You can also try to connect to the database host using the `nc` command and check if the connection can be opened:

```
nc -v your-db-host 5432
```

These steps will help you determine whether this the problem is with the network or with authentication.

## The Metabase application database is not being persisted

**How to detect this:** This is occurring if you are getting the Setup screen every time you start the application. The most common cause is not giving the Docker container a persistent filesystem mount to put the application database in.

**How to fix this:** Make sure you are giving the container a [persistent volume][persistent-volume].

## The internal port isn't being remapped correctly

**How to detect this:** Run `docker ps` and look at the port mapping, then run `curl http://localhost:port-number-here/api/health`. This should return a JSON response that looks like:

```
{"status":"ok"}
```

**How to fix this:** Make sure to include `-p 3000:3000` or similar port remapping in the `docker run` command you use to start the Metabase container image.

## Metabase can't write or read to/from a file or directory

**How to detect this:** A message in the logs will clearly indicate an IOError or "Permission denied" from Java, or errors from SQLite containing `org.sqlite.core.NativeDB._open_utf8`.

**How to fix this:** Ensure that the user who is running Metabase has permission to read and write to the file or directory:

- If you are running Metabase as a JAR file in your local machine or server, check the user who is running the Java process.
- If you're running Metabase from the Docker container, make sure you're using the `/metabase.db` directory.

If you're running Metabase from the JAR in any Unix-like operating system, you can see which user is running Metabase by opening a terminal and typing `ps -uA | grep metabase`.

[configuring-application-database]: ../installation-and-operation/configuring-application-database.md
[persistent-volume]: ../installation-and-operation/running-metabase-on-docker.md#mounting-a-mapped-file-storage-volume
