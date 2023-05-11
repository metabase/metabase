#!/bin/bash

function log() {
 echo -e "\u001b[32m[$(date +'%Y-%m-%dT%H:%M:%S%z')]: $*\u001b[0m"
}

if [ -f /tmp/trino-initialized ]; then
 exec /bin/sh -c "$@"
fi

TRINO_CATALOG_DIR="/etc/trino/catalog"
TEST_CATALOG="test_data"

log "Set up catalog file ${TRINO_CATALOG_DIR}/$TEST_CATALOG"
cat << EOF >> "${TRINO_CATALOG_DIR}/${TEST_CATALOG}.properties"
connector.name=memory
EOF

touch /tmp/trino-initialized

log "Executing cmd: ${*}"
exec /bin/sh -c "${@}"
