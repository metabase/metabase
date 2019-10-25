While Docker simplifies a lot of aspects of running Metabase, there are a number of potential pitfalls to keep in mind.

If you are having issues with Metabase under Docker, we recommend going through the troubleshooting process below. Then look below for details about the specific issue you've found.

## Troubleshooting Process

1. Check that the container is running
2. Check that the server is running inside the container
3. Check whether Metabase is using the correct application database
4. Check that you can connect to the Docker host on the Metabase port
5. Check that you can connect to the container from the Docker host
6. Check that you can connect to the server from within the container

## Specific Problems

### Metabase container exits without starting the server

Run `docker ps` to see if the Metabase container is currently running. If it is move on to the next step.

If `docker ps` does not show the running container, then list the stopped containers by running:

`docker ps -a | grep metabase/metabase`

And look for the container that exited most recently. Note the container ID.
Look at that container's logs with:

`Docker logs CONTAINER_ID`

### Metabase Container is running but the Server is not

#### How to detect this:

Run `docker ps` to make sure the container is running

The server should be logging to the Docker container logs. Check this by running:

`docker logs CONTAINER_NAME`

You should see a line like this at the beginning:

```
05-10 18:11:32 INFO metabase.util :: Loading Metabase...
```

and eventually:

```
05-10 18:12:30 INFO metabase.core :: Metabase Initialization COMPLETE
```

If you see the below lines:

```
05-15 19:07:11 INFO metabase.core :: Metabase Shutting Down ...
05-15 19:07:11 INFO metabase.core :: Metabase Shutdown COMPLETE
```

#### How to fix this:

Check this for errors about connecting to the application database.
Watch the logs to see if Metabase is still being started:

`Docker logs -f CONTAINER_ID`

will let you see the logs as they are printed.

If the container is being killed before it finished starting it could be a health check timeout in the orchestration service used to start the container, such as Docker Cloud, or Elastic Beanstalk.

If the container is not being killed from the outside, and is failing to start anyway, this problem is probably not specific to Docker. If you are using a Metabase-supplied image, you should [open a GitHub issue](https://github.com/metabase/metabase/issues/new/choose).

### Not connecting to a remote application database

#### How to detect this:

If this is a new Metabase instance, then the database you specified via the environment variables will be empty. If this is an existing Metabase instance with incorrect environment parameters, the server will create a new H2 embedded database to use for application data and you’ll see lines similar to these:

```
05-10 18:11:40 INFO metabase.core :: Setting up and migrating Metabase DB. Please sit tight, this may take a minute...
05-10 18:11:40 INFO metabase.db :: Verifying h2 Database Connection ...

05-10 18:11:40 INFO metabase.db :: Verify Database Connection ...  ✅
```

#### How to fix this:

Double check you are passing environments to Docker in the correct way.
You can list the environment variables for a container with this command:

`docker inspect some-postgres -f '{% raw %}{{ .Config.Env }}{% endraw %}'`

### The Metabase server isn’t able to connect to a MySQL or PostgreSQL database

#### How to detect this:

The logs for the Docker container return an error message after the “Verifying Database Connection” line.

#### How to fix this:

Try to connect with `mysql` or `psql` commands with the connection string parameters you are passing in [via the environment variables](../operations-guide/configuring-application-database.md).

If you can’t connect to the database, the problem is due to either the credentials or connectivity. Verify that the credentials are correct. If you are able to log in with those credentials from another machine then try to make the same connection from the host running the Docker container.

One easy way to run this is to use Docker to start a container that has the appropriate client for your database. For Postgres this would look like:

`docker run --name postgres-client --rm -ti --entrypoint /bin/bash postgres`

Then from within that container try connecting to the database host using the client command in the container such as `psql`. If you are able to connect from another container on the same host, then try making that connection from within the Metabase Docker container itself:

`docker exec -ti container-name bash`

And try to connect to the database host using the `nc` command and check if the connection can be opened:

`nc -v your-db-host 5432`

This will make it clear if this is a network or authentication problem.

### The Metabase application database is not being persisted

#### How to detect this:

This occurs if you get the Setup screen every time you start the application. The most common root cause is not giving the Docker container a persistent filesystem mount to put the application database in.

#### How to fix this:

Make sure you are giving the container a [persistent volume](../operations-guide/running-metabase-on-docker.html#mounting-a-mapped-file-storage-volume)

### The internal port isn’t being remapped correctly

#### How to detect this:

Run `docker ps` and look at the port mapping
Run `curl http://localhost:port-number-here/api/health`. This should return a response with a JSON response like:

```
{"status":"ok"}
```

#### How to fix this:

Make sure to include a `-p 3000:3000` or similar remapping in the `docker run` command you execute to start the Metabase container image.

## Helpful tidbits

### How to get to the shell in the Metabase container

`docker exec -ti CONTAINER_NAME bash`

### How to get the logs for the Metabase container

`docker logs -f CONTAINER_NAME`
