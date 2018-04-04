# Running Metabase on Debian as a service with nginx

For those people who don't (or can't) use Docker in their infrastructure, there's still a need to easily setup and deploy Metabase in production. On Debian-based systems, this means registering Metabase as a service that can be started/stopped/uninstalled.

**Note:** This is just a *bare-bones recipe* to get you started. Anyone can take it from here to do what they need to do on their systems, and should follow best practices for setting up and securing the rest of their server.

#### Assumptions

The core assumption in this guide:

* You will run Metabase using the `metabase.jar` file
* You already have `nginx` and `postgres` (or another supported database) running on your server
* You will use environment variables to configure your Metabase instance
* You have `sudo` access on your server

### Create a Metabase Service

Every service needs a script that tells `systemd` how to manage it, and what capabilities it supports. Services are typically registered at `etc/init.d/<service-name>`. So, a Metabase service should live at `/etc/init.d/metabase`.

#### The Metabase service file

Create the `/etc/init.d/metabase` service file and open it in your editor:

    $ sudo touch /etc/init.d/metabase
    $ sudo <your-editor> /etc/init.d/metabase

In `/etc/init.d/metabase`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. The Metabase script below has extra comments to help you know what everything is for.


    #!/bin/sh
    # /etc/init.d/metabase
    ### BEGIN INIT INFO
    # Provides:          Metabase
    # Required-Start:    $local_fs $network $named $time $syslog
    # Required-Stop:     $local_fs $network $named $time $syslog
    # Default-Start:     2 3 4 5
    # Default-Stop:      0 1 6
    # Description:       Metabase analytics and intelligence platform
    ### END INIT INFO

    # where is the Metabase jar located?
    METABASE=</your/path/to/>metabase.jar

    # where will our environment variables be stored?
    METABASE_CONFIG=/etc/default/metabase

    # which (unprivileged) user should we run Metabase as?
    RUNAS=<your_deploy_user>

    # where should we store the pid/log files?
    PIDFILE=/var/run/metabase.pid
    LOGFILE=/var/log/metabase.log

    start() {
      # ensure we only run 1 Metabase instance
      if [ -f "$PIDFILE" ] && kill -0 $(cat "$PIDFILE"); then
        echo 'Metabase already running' >&2
        return 1
      fi
      echo 'Starting Metabase...' >&2
      # execute the Metabase jar and send output to our log
      local CMD="nohup java -jar \"$METABASE\" &> \"$LOGFILE\" & echo \$!"
      # load Metabase config before we start so our env vars are available
      . "$METABASE_CONFIG"
      # run our Metabase cmd as unprivileged user
      su -c "$CMD" $RUNAS > "$PIDFILE"
      echo 'Metabase started.' >&2
    }

    stop() {
      # ensure Metabase is running
      if [ ! -f "$PIDFILE" ] || ! kill -0 $(cat "$PIDFILE"); then
        echo 'Metabase not running' >&2
        return 1
      fi
      echo 'Stopping Metabase ...' >&2
      # send Metabase TERM signal
      kill -15 $(cat "$PIDFILE") && rm -f "$PIDFILE"
      echo 'Metabase stopped.' >&2
    }

    uninstall() {
      echo -n "Are you really sure you want to uninstall Metabase? That cannot be undone. [yes|No] "
      local SURE
      read SURE
      if [ "$SURE" = "yes" ]; then
        stop
        rm -f "$PIDFILE"
        rm -f "$METABASE_CONFIG"
        # keep logfile around
        echo "Notice: log file is not be removed: '$LOGFILE'" >&2
        update-rc.d -f metabase remove
        rm -fv "$0"
      fi
    }

    case "$1" in
      start)
        start
        ;;
      stop)
        stop
        ;;
      uninstall)
        uninstall
        ;;
      restart)
        stop
        start
        ;;
      *)
        echo "Usage: $0 {start|stop|restart|uninstall}"
    esac


### Environment Variables for Metabase

Environment variables provide a good way to customize and configure your Metabase instance on your server. On Debian systems, services typically expect to have accompanying configs inside `etc/default/<service-name>`.

#### The Metabase config file

Create your `/etc/default/metabase` environment config file and open it in your editor:

    $ sudo touch /etc/default/metabase
    $ sudo <your-editor> /etc/default/metabase

In `/etc/default/metabase`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. Some Metabase configs have available options, some of which are shown below, separated by `|` symbols:


    #!/bin/sh
    # /etc/default/metabase
    export MB_PASSWORD_COMPLEXITY=<weak|normal|strong>
    export MB_PASSWORD_LENGTH=<10>
    export MB_JETTY_HOST=<0.0.0.0>
    export MB_JETTY_PORT=<12345>
    export MB_DB_TYPE=<postgres|mysql|h2>
    export MB_DB_DBNAME=<your_metabase_db_name>
    export MB_DB_PORT=<5432>
    export MB_DB_USER=<your_metabase_db_user>
    export MB_DB_PASS=<ssshhhh>
    export MB_DB_HOST=<localhost>
    export MB_EMOJI_IN_LOGS=<true|false>
    # any other env vars you want available to Metabase

### Final Steps

The best part of setting up Metabase as a service on a Debian-based system is to be confident it will start up at every system boot. We only have a few more quick steps to finish registering our service and having Metabase up and running.

#### Ensure your database is ready

If you're running `postgres` or some other database, you need to ensure you've already followed the instructions for your database system to create a database for Metabase, as well as a user that can access that database. These values should match what you've set in your Metabase config for the `MB_DB_TYPE`, `MB_DB_DBNAME`, `MB_DB_USER`, and `MB_DB_PASS` environment variables. If you don't have your database properly configured, Metabase won't be able to start.

#### Ensure `nginx` is setup to proxy requests to Metabase

Getting into too much detail about configuring `nginx` is well outside the scope of this guide, but here's a quick `nginx.conf` file that will get you up and running.

**Note:** The `nginx.conf` below assumes you are accepting incoming traffic on port 80 and want to proxy requests to Metabase, and that your Metabase instance is configured to run on `localhost` at port `3000`. There are several proxy directives you may care about, so you should check those out further in the [Official `nginx` docs](https://nginx.org/en/docs/).

    # sample nginx.conf
    # proxy requests to Metabase instance
    server {
      listen 80;
      listen [::]:80;
      server_name your.domain.com;
      location / {
        proxy_pass http://127.0.0.1:3000;
      }
    }

#### Register your Metabase service

Now, it's time to register our Metabase service with `systemd` so it will start up at system boot. We'll also ensure our log file is created and owned by the unprivileged user our service runs the `metabase.jar` as.

    # ensure our metabase script is executable
    $ sudo chmod +x /etc/init.d/metabase

    # create the log file we declared in /etc/init.d/metabase
    $ sudo touch /var/log/metabase.log

    # ensure unprivileged deploy user owns log (or it won't be able to write)
    $ sudo chown <your_deploy_user>:<your_deploy_user> /var/log/metabase.log

    # add to default services
    $ sudo update-rc.d metabase defaults

#### That's it!

Now, whenever you need to start, stop, or restart Metabase, all you need to do is:

    $ sudo service metabase start
    $ sudo service metabase stop
    $ sudo service metabase restart

