# Running Metabase on Debian as a systemd service with nginx

For those people who don't (or can't) use Docker in their infrastructure, there's still a need to easily setup and deploy Metabase in production. On Debian-based systems, this means registering Metabase as a systemd service that can be started/stopped/uninstalled.


**Note:** This is just a *bare-bones configuration* to get you started. Anyone can take it from here to do what they need to do on their systems, and should follow best practices for setting up and securing the rest of their server.

#### Assumptions

The core assumption in this guide:

* You will run Metabase using the `metabase.jar` file
* You already have `nginx` and `postgres` (or another supported database) running on your server
* You will use environment variables to configure your Metabase instance
* You have `sudo` access on your server

### Create a Metabase Service

Every service needs a script that tells `systemd` how to manage it, and what capabilities it supports. Services are typically registered at `etc/systemd/system/<service-name>` with a `.service` extension. So, a Metabase service should live at `/etc/systemd/system/metabase.service`.

#### The Metabase service file

Create the `/etc/systemd/system/metabase.service` service file and open it in your editor:

    $ sudo touch /etc/systemd/system/metabase.service
    $ sudo <your-editor> /etc/systemd/system/metabase.service

In `/etc/systemd/system/metabase.service`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. The Metabase script below has extra comments to help you know what everything is for.

```
    [Unit]
    Description=Metabase server
    After=syslog.target
    After=network.target

    [Service]
    WorkingDirectory=<location-of-folder-containing-metabase-jar>
    ExecStart=/usr/bin/java -jar <location-of-metabase.jar>
    EnvironmentFile=<location-of-configuration-file>
    User=<run-as-user>
    Type=simple
    StandardOutput=syslog
    StandardError=syslog
    SyslogIdentifier=metabase
    SuccessExitStatus=143
    TimeoutStopSec=120
    Restart=always

    [Install]
    WantedBy=multi-user.target
```

### Environment Variables for Metabase

Notice above the `systemd` configuration file references an `EnvironmentFile` variable. This is used to set metabase environment variables.

Environment variables provide a good way to customize and configure your Metabase instance on your server. On Debian systems, services typically expect to have accompanying configs inside `etc/default/<service-name>`.

#### The Metabase config file

Create your `/etc/default/metabase` environment config file and open it in your editor:

    $ sudo touch /etc/default/metabase
    $ sudo <your-editor> /etc/default/metabase

In `/etc/default/metabase`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. Some Metabase configs have available options, some of which are shown below, separated by `|` symbols:

    # /etc/default/metabase
    MB_PASSWORD_COMPLEXITY=<weak|normal|strong>
    MB_PASSWORD_LENGTH=<10>
    MB_JETTY_HOST=<0.0.0.0>
    MB_JETTY_PORT=<12345>
    MB_DB_TYPE=<postgres|mysql|h2>
    MB_DB_DBNAME=<your_metabase_db_name>
    MB_DB_PORT=<5432>
    MB_DB_USER=<your_metabase_db_user>
    MB_DB_PASS=<ssshhhh>
    MB_DB_HOST=<localhost>
    MB_EMOJI_IN_LOGS=<true|false>
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

Now, it's time to register our Metabase service with `systemd` so it will start up at system boot. Note that logging is automatically managed for you through the systemd journal.

    # reload systemd daemon to ensure it is aware of our new service
    $ sudo systemctl daemon-reload

    # tell systemd to start metabase on boot
    $ sudo systemctl enable metabase.service
    
    # start metabase right now
    $ sudo systemctl start metabase.service

#### That's it!

Now, whenever you need to start, stop, or restart Metabase, all you need to do is:

    $ sudo systemctl start metabase.service
    $ sudo systemctl stop metabase.service
    $ sudo systemctl restart metabase.service

To view metabase logs, use the journalctl command:
    
    # view the most recent 1000 log entries for the metabase service
    $ journalctl -u metabase.service -n 1000
