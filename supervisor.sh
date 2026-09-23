#!/bin/bash
export MB_UPGRADE_SLOW=4 # milliseconds to delay in between megabytes
cd -- "$(dirname -- "${BASH_SOURCE[0]}")" || exit 1

# Env-backed settings are hidden by the settings API; use DB-backed version-info.
unset MB_VERSION_INFO

export MB_UPGRADE_JAR_URL=http://localhost:3000/metabase.jar
export MB_JETTY_PORT=8088
java -jar target/uberjar/metabase-current.jar
sleep 2 # give the user a chance to ctrl-c out of it
exec ./supervisor.sh
