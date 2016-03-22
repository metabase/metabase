#!/bin/bash

# Metabase Web Container
export MB_JETTY_HOST=$HOSTNAME
# NOTE: we set MB_JETTY_PORT in our Dockerfile in order to ensure we bind to the port exposed by Docker

# Metabase Database Info
# TODO: we could make this generic by first checking if the $RDS_* env variables are available and if
#       so then apply the code below and map them to our Metabase env variables
export MB_DB_DBNAME=$RDS_DB_NAME
export MB_DB_USER=$RDS_USERNAME
export MB_DB_PASS=$RDS_PASSWORD
export MB_DB_HOST=$RDS_HOSTNAME
export MB_DB_PORT=$RDS_PORT

# TODO: dynamically determine type, probably using the port number
export MB_DB_TYPE=postgres

exec java -Dlogfile.path=target/log -XX:+CMSClassUnloadingEnabled -XX:+UseConcMarkSweepGC -jar /app/metabase.jar
