# Running Metabase on Docker

Metabase provides an official Docker image via Dockerhub that can be used for deployments on any system that is running Docker.

If you're trying to upgrade your Metabase version on Docker, check out these [upgrading instructions](./start.html#upgrading-metabase).

### Launching Metabase on a new container

Here's a quick one-liner to get you off the ground (please note, we recommend further configuration for production deployments below):

    docker run -d -p 3000:3000 --name metabase metabase/metabase

This will launch a Metabase server on port 3000 by default.  You can use `docker logs -f metabase` to follow the rest of the initialization progress.  Once the Metabase startup completes you can access the app at [localhost:3000](http://localhost:3000)

Since Docker containers have their own ports and we just map them to the system ports as needed it's easy to move Metabase onto a different system port if you wish.  For example running Metabase on port 12345:

    docker run -d -p 12345:3000 --name metabase metabase/metabase


### Mounting a mapped file storage volume

In its default configuration Metabase uses the local filesystem to run an H2 embedded database to store its own application data.  The end result is that your Metabase application data will be on disk inside your container and lost if you ever remove the container.

To persist your data outside of the container and make it available for use between container launches we can mount a local file path inside our container.

    docker run -d -p 3000:3000 -v ~/metabase-data:/metabase-data -e "MB_DB_FILE=/metabase-data/metabase.db" --name metabase metabase/metabase

Now when you launch your container we are telling Metabase to use the database file at `~/metabase-data/metabase.db` instead of its default location and we are mounting that folder from our local filesystem into the container.

### Getting your config back if you stopped your container

If you have previously run and configured your Metabase using the local Database and then stopped the container, your data will still be there unless you deleted the container with the `docker rm` command. To recover your previous configuration:

1. Find the stopped container using the `docker ps -a` command.
   It will look something like this:

```
    docker ps -a | grep metabase
    ca072cd44a49        metabase/metabase        "/app/run_metabase.sh"   About an hour ago   Up About an hour          0.0.0.0:3000->3000/tcp   metabase
    02e4dff057d2        262aa3d0f714             "/app/run_metabase.sh"   23 hours ago        Exited (0) 23 hours ago                            pedantic_hypatia
    0d2170d4aa4a        262aa3d0f714             "/app/run_metabase.sh"   23 hours ago        Exited (0) 23 hours ago                            stoic_lumiere
```
   Once you have identified the stopped container with your configuration in it, save the container ID from the left most column for the next step.
2. Use `docker commit` to create a new custom docker image from the stopped container containing your configuration.

```
     docker commit ca072cd44a49 mycompany/metabase-custom
     sha256:9ff56186de4dd0b9bb2a37c977c3a4c9358647cde60a16f11f4c05bded1fe77a
```
3. Run your new image using `docker run` to get up and running again.
```
     docker run -d -p 3000:3000 --name metabase mycompany/metabase-custom
     430bb02a37bb2471176e54ca323d0940c4e0ee210c3ab04262cb6576fe4ded6d
```
Hopefully you have your previously configured Metabase Installation back. If it's not the one you expected try a different stopped container and do these steps again.

### Using Postgres as the Metabase application database

If you are ready to completely move off the H2 embedded database for running Metabase and prefer to use Postgres we've got that covered too.

In this scenario all you need to do is make sure you launch Metabase with the correct environment variables containing your Postgres database connection details and you're all set.  For example:

    docker run -d -p 3000:3000 \
      -e "MB_DB_TYPE=postgres" \
      -e "MB_DB_DBNAME=metabase" \
      -e "MB_DB_PORT=5432" \
      -e "MB_DB_USER=<username>" \
      -e "MB_DB_PASS=<password>" \
      -e "MB_DB_HOST=my-database-host" \
      --name metabase metabase/metabase

Keep in mind that Metabase will be connecting from within your docker container, so make sure that either you're using a fully qualified hostname or that you've set a proper entry in your container's `/etc/hosts file`.

### Migrating from H2 to Postgres as the Metabase application database

For general information, see instructions for [migrating from H2 to MySQL or Postgres](./start.html#migrating-from-using-the-h2-database-to-mysql-or-postgres).

To migrate an existing Metabase container from an H2 application database to another database container (e.g. Postgres, MySQL), there are a few considerations to keep in mind:

* The target database container must be accessible (i.e. on an available network)
* The target database container must be supported (e.g. MySQL, Postgres)
* The existing H2 database should be [mapped outside the running container](#mounting-a-mapped-file-storage-volume)

The migration process involves 2 main steps:

1. Stop the existing Metabase container
2. Run a new, temporary Metabase container to perform the migration

Using a Postgres container as the target, here's an example invocation:

    docker run --name metabase-migration \
        -v /path/metabase/data:/metabase-data \
        -e "MB_DB_FILE=/metabase-data/metabase.db" \
        -e "MB_DB_TYPE=postgres" \
        -e "MB_DB_DBNAME=metabase" \
        -e "MB_DB_PORT=5432" \
        -e "MB_DB_USER=<username>" \
        -e "MB_DB_PASS=<password>" \
        -e "MB_DB_HOST=my-database-host" \
        metabase/metabase load-from-h2

To further explain the example: in addition to specifying the target database connection details, set the `MB_DB_FILE` environment variable for the source H2 database location, and pass the argument `load-from-h2` to begin migrating.

### Setting the Java Timezone

It's best to set your Java timezone to match the timezone you'd like all your reports to come in.  You can do this by simply specifying the `JAVA_TIMEZONE` environment variable which is picked up by the Metabase launch script.  For example:

    docker run -d -p 3000:3000 \
      -e "JAVA_TIMEZONE=US/Pacific" \
      --name metabase metabase/metabase


### Additional custom settings

While running Metabase on docker you can use any of the custom settings from [Customizing the Metabase Jetty Webserver](./start.html#customizing-the-metabase-jetty-webserver) by setting environment variables on your docker run command.

In addition to the standard custom settings there are two docker specific environment variables `MUID` and `MGID` which are used to set the user and group IDs used by metabase when running in a docker container. These settings make it possible to match file permissions when files, such as the application database, are shared between the host and the container.

Here's how to use a database file, owned by your account, that is stored in your home directory:

    docker run -d -v ~/my-metabase-db:/metabase.db --name metabase -e MB_DB_FILE=/metabase.db -e MUID=$UID -e MGID=$GID -p 3000:3000 metabase/metabase

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).


### Copying the application database

If you forgot to configure to the application database, it will be located at `/metabase.db/metabase.db.mv.db` in the container. You can copy this whole directory out of the container using the following command (replacing `CONTAINER_ID` with the actual container ID or name, `metabase` if you named the container):

    docker cp CONTAINER_ID:/metabase.db ./

The DB contents will be left in a directory named metabase.db.
Note that some older versions of metabase stored their db in a different default location.

    docker cp CONTAINER_ID:/metabase.db.mv.db metabase.db.mv.db

### Fixing OutOfMemoryErrors in some hosted environments

On some hosts Metabase can fail to start with an error message like:

    java.lang.OutOfMemoryError: Java heap space

If that happens, you'll need to set a JVM option to manually configure the maximum amount of memory the JVM uses for the heap. Refer
to [these instructions](../troubleshooting-guide/running.md) for details on how to do that.
