#!/bin/bash
export MB_UPGRADE_SLOW=y
export MB_UPGRADE_JAR_URL=http://localhost:3000/metabase.jar
export MB_JETTY_PORT=8088
java -jar target/uberjar/metabase-current.jar
sleep 2 # give the user a chance to ctrl-c out of it
exec $0
