# Running Metabase on Debian as a service with nginx

For those people who don't (or can't) use Docker in their infrastructure, there's still a need to easily setup and deploy Metabase in production. On Debian-based systems, this means registering Metabase as a service that can be started/stopped/uninstalled.

**Note:** This is just a *bare-bones recipe* to get you started. Anyone can take it from here to do what they need to do on their systems, and should follow best practices for setting up and securing the rest of their server.

#### Assumptions

The core assumption in this guide:

* You will run Metabase using the `metabase.jar` file
* You already have `nginx` and `postgres` (or another supported database) running on your server
* You will use environment variables to configure your Metabase instance
* You have `sudo` access on your server

### Create an unprivileged user to run Metabase and give him acces to app and logs

For security reasons we want to have Metabase run as an unprivileged user. We will call the user simply `metabase`. Further we will create the files we will need later for logging and configuration of Metabase, and apply the correct security settings for our unprivileged user.

    $ sudo groupadd -r metabase
    $ sudo useradd -r -s /bin/false -g metabase metabase
    $ sudo chown -R metabase:metabase </your/path/to/metabase/directory>
    $ sudo touch /var/log/metabase.log
    $ sudo chown metabase:metabase /var/log/metabase.log
    $ sudo touch /etc/default/metabase
    $ sudo chmod 640 /etc/default/metabase

### Create a Metabase Service

Every service needs a script that tells `systemd` how to manage it, and what capabilities it supports. Services are typically registered at `/etc/systemd/system/<servicename>`. So, a Metabase service should live at `/etc/systemd/system/metabase.service`.

#### The Metabase service file

Create the `/etc/systemd/system/metabase.service` service file and open it in your editor:

    $ sudo touch /etc/systemd/system/metabase.service
    $ sudo <your-editor> /etc/systemd/system/metabase.service

In `/etc/systemd/system/metabase.service`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. The Metabase script below has extra comments to help you know what everything is for.

    [Unit]
    Description=Metabase server
    After=syslog.target
    After=network.target
   
    [Service]
    WorkingDirectory=</your/path/to/metabase/directory/>
    ExecStart=/usr/bin/java -jar </your/path/to/metabase/directory/>metabase.jar
    EnvironmentFile=/etc/default/metabase
    User=metabase
    Type=simple
    StandardOutput=syslog
    StandardError=syslog
    SyslogIdentifier=metabase
    SuccessExitStatus=143
    TimeoutStopSec=120
    Restart=always
   
    [Install]
    WantedBy=multi-user.target
    
### Create syslog conf

Next we need to create a syslog conf to make sure systemd is able to handle the logs properly.

    $ sudo touch /etc/rsyslog.d/metabase.conf
    $ sudo <your-editor> /etc/rsyslog.d/metabase.conf
    
    if $programname == 'metabase' then /var/log/metabase.log
    & stop
    
Restart the syslog service to load the new config.

    $ sudo systemctl restart rsyslog.service

### Environment Variables for Metabase

Environment variables provide a good way to customize and configure your Metabase instance on your server. On Debian systems, services typically expect to have accompanying configs inside `etc/default/<service-name>`.

#### The Metabase config file

Open your `/etc/default/metabase` environment config file in your editor:

    $ sudo <your-editor> /etc/default/metabase

In `/etc/default/metabase`, replace configurable items (they look like `<some-var-name>`) with values sensible for your system. Some Metabase configs have available options, some of which are shown below, separated by `|` symbols:


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

Now, it's time to register our Metabase service with `systemd` so it will start up at system boot. We'll also ensure our log file is created and owned by the unprivileged user our service runs the `metabase.jar` as.

    $ sudo systemctl daemon-reload
    $ sudo systemctl start metabase.service
    $ sudo systemctl status metabase.service

Once we are ok here, enable the service to startup during boot.

    $ sudo systemctl enable metabase.service


#### That's it!

Now, whenever you need to start, stop, or restart Metabase, all you need to do is:

    $ sudo systemctl start metabase.service
    $ sudo systemctl stop metabase.service
    $ sudo systemctl restart metabase.service

