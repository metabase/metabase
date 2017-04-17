#!/bin/bash

# if nobody manually set a host to list on then go with $HOSTNAME
if [ -z "$MB_JETTY_HOST" ]; then
    export MB_JETTY_HOST=$HOSTNAME
fi


# Metabase Database Info - this is just about what db the Metabase application uses for internal storage

# AWS Elastic Beanstalk w/ RDS
if [ ! -z "$RDS_HOSTNAME" ]; then
    # EEK: this is a bit fragile.  if user picks a non-standard port for their db we are screwed :(
    if [ "$MB_DB_PORT" == "3306" ]; then
        export MB_DB_TYPE=mysql
    else
        export MB_DB_TYPE=postgres
    fi

    export MB_DB_DBNAME=$RDS_DB_NAME
    export MB_DB_USER=$RDS_USERNAME
    export MB_DB_PASS=$RDS_PASSWORD
    export MB_DB_HOST=$RDS_HOSTNAME
    export MB_DB_PORT=$RDS_PORT
fi


# Avoid running metabase (or any server) as root where possible
# If you want to use specific user and group ids that matches an existing
# account on the host pass them in $MGID and $MUID when starting metabase
MGID=${MGID:-2000}
MUID=${MUID:-2000}

# create the group if it does not exist
getent group metabase > /dev/null 2>&1
group_exists=$?
if [ $group_exists ]; then
    addgroup -g $MGID -S metabase
fi

# create the user if it does not exist
id -u metabase > /dev/null 2>&1
user_exists=$?
if [[ $user_exists -ne 0 ]]; then
    adduser -D -u $MUID -G metabase metabase
fi

# this is to avoid running creating non-root DB files at the root of the filesystem
# while still making them easy to find for DB export when migrating from H2 to other application DBs

db_file=/app/metabase.db
db_alias=/metabase.db
export MB_DB_FILE=$db_file
chown metabase:metabase /app
touch $db_file
chown metabase:metabase $db_file
if [[ ! -f $db_alias ]]; then
    ln -s $db_file $db_alias
fi

# Setup Java Options
JAVA_OPTS="${JAVA_OPTS} -Dlogfile.path=target/log -XX:+CMSClassUnloadingEnabled -XX:+UseConcMarkSweepGC -server"

if [ ! -z "$JAVA_TIMEZONE" ]; then
    JAVA_OPTS="${JAVA_OPTS} -Duser.timezone=${JAVA_TIMEZONE}"
fi

# Launch the application
# exec is here twice on purpose to  ensure that metabase runs as PID 1 (the init process)
# and thus receives signals sent to the container. This allows it to shutdown cleanly on exit
exec su metabase -s /bin/sh -c "exec java $JAVA_OPTS -jar /app/metabase.jar"
