# Running Metabase on Docker

Metabase provides an official Docker image via Dockerhub that can be used for deployments on any system that is running Docker.

### Launching Metabase on a new container

Here's a quick one-liner to get you off the ground:

    docker run -d -p 3000:3000 --name metabase metabase/metabase

This will launch a Metabase server on port 3000 by default.  You can use `docker logs -f metabase` to follow the rest of the initialization progress.  Once the Metabase startup completes you can access the app at [localhost:3000](http://localhost:3000)

Since Docker containers have their own ports and we just map them to the system ports as needed it's easy to move Metabase onto a different system port if you wish.  For example running Metabase on port 12345:

    docker run -d -p 12345:3000 --name metabase metabase/metabase


### Mounting a mapped file storage volume

In its default configuration Metabase uses the local filesystem to run an H2 embedded database to store its own application data.  The end result is that your Metabase application data will be on disk inside your container and lost if you ever remove the container.

To persist your data outside of the container and make it available for use between container launches we can mount a local file path inside our container.

    docker run -d -p 3000:3000 -v /tmp:/tmp -e "MB_DB_FILE=/tmp/metabase.db" --name metabase metabase/metabase

Now when you launch your container we are telling Metabase to use the database file at `/tmp/metabase.db` instead of its default location and we are mounting that folder from our local filesystem into the container.


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


### Additional custom settings

While running Metabase on docker you can use any of the custom settings from [Customizing the Metabase Jetty Webserver](./start.md#customizing-the-metabase-jetty-webserver) by setting environment variables on your docker run command.

Now that you’ve installed Metabase, it’s time to [set it up and connect it to your database](../setting-up-metabase.md).
