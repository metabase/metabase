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


# Setup Java Options
JAVA_OPTS="-Dlogfile.path=target/log -XX:+CMSClassUnloadingEnabled -XX:+UseConcMarkSweepGC -server"

if [ ! -z "$JAVA_TIMEZONE" ]; then
  JAVA_OPTS="${JAVA_OPTS} -Duser.timezone=${JAVA_TIMEZONE}"
fi

# Launch the application
exec java $JAVA_OPTS -jar /app/metabase.jar
