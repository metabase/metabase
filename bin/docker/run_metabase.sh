#!/bin/bash
# if nobody manually set a host to listen on then go with all available interfaces and host names
if [ -z "$MB_JETTY_HOST" ]; then
    export MB_JETTY_HOST=0.0.0.0
fi

# Setup Java Options
JAVA_OPTS="${JAVA_OPTS} -XX:+IgnoreUnrecognizedVMOptions"
JAVA_OPTS="${JAVA_OPTS} -Dfile.encoding=UTF-8"
JAVA_OPTS="${JAVA_OPTS} -Dlogfile.path=target/log"
JAVA_OPTS="${JAVA_OPTS} -XX:+CrashOnOutOfMemoryError"
JAVA_OPTS="${JAVA_OPTS} -server"
JAVA_OPTS="${JAVA_OPTS} --add-opens java.base/java.nio=ALL-UNNAMED"

if [ ! -z "$JAVA_TIMEZONE" ]; then
    JAVA_OPTS="${JAVA_OPTS} -Duser.timezone=${JAVA_TIMEZONE}"
fi

# usage: file_env VAR [DEFAULT]
#    ie: file_env 'XYZ_DB_PASSWORD' 'example'
# (will allow for "$XYZ_DB_PASSWORD_FILE" to fill in the value of
#  "$XYZ_DB_PASSWORD" from a file, especially for Docker's secrets feature)
# taken from https://github.com/docker-library/postgres/blob/master/docker-entrypoint.sh
# This is the specific function that takes the env var which has a "_FILE" at the end and transforms that into a normal env var.
file_env() {
    local var="$1"
    local fileVar="${var}_FILE"
    local def="${2:-}"
    if [ "${!var:-}" ] && [ "${!fileVar:-}" ]; then
        echo >&2 "error: both $var and $fileVar are set (but are exclusive)"
        exit 1
    fi
    local val="$def"
    if [ "${!var:-}" ]; then
        val="${!var}"
    elif [ "${!fileVar:-}" ]; then
        val="$(< "${!fileVar}")"
    fi
    export "$var"="$val"
    unset "$fileVar"
}

# Here we define which env vars are the ones that will be supported with a "_FILE" ending. We started with the ones that would contain sensitive data
docker_setup_env() {
    file_env 'MB_DB_USER'
    file_env 'MB_DB_PASS'
    file_env 'MB_DB_CONNECTION_URI'
    file_env 'MB_EMAIL_SMTP_PASSWORD'
    file_env 'MB_EMAIL_SMTP_USERNAME'
    file_env 'MB_LDAP_PASSWORD'
    file_env 'MB_LDAP_BIND_DN'
}

# Launch the application
# exec is here twice on purpose to  ensure that metabase runs as PID 1 (the init process)
# and thus receives signals sent to the container. This allows it to shutdown cleanly on exit
docker_setup_env

exec /bin/sh -c "exec java $JAVA_OPTS -jar /app/metabase.jar $@"
