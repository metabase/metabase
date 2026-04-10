#!/bin/bash
set -e

# Start Postgres first
echo "Starting Postgres..."
su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/data -l /var/log/postgresql/startup.log start"

# Wait for Postgres to be ready
for i in {1..30}; do
    if su - postgres -c "pg_isready" >/dev/null 2>&1; then
        echo "Postgres is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Error: Postgres failed to start"
        exit 1
    fi
    sleep 1
done

# Load dump if provided via volume mount
if [ -f /docker-entrypoint-initdb.d/dump.sql ]; then
    echo "Loading SQL dump from /docker-entrypoint-initdb.d/dump.sql..."
    su - postgres -c "psql -U postgres -f /docker-entrypoint-initdb.d/dump.sql"
    echo "Dump loaded successfully!"
fi

# Stop Postgres so supervisord can start it properly
su - postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D /var/lib/postgresql/data stop"

# Start both services with supervisord
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
