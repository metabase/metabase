#! /usr/bin/env bash

set -eou pipefail xtrace

SOURCE_DB="$(pwd)/frontend/test/__runner__/test_db_fixture.db"
DEST_DB="$(pwd)/dump.db"

echo -e "\n********************************************************************************"
echo "Migrating $SOURCE_DB..."
echo -e "********************************************************************************\n"

MB_DB_TYPE=h2 MB_DB_FILE="$SOURCE_DB" lein run migrate up

echo -e "\n********************************************************************************"
echo "Loading data from H2 $SOURCE_DB into Postgres/MySQL..."
echo -e "********************************************************************************\n"

lein run load-from-h2 "$SOURCE_DB"

echo -e "\n********************************************************************************"
echo "Dumping data from Postgres/MySQL into H2 $DEST_DB..."
echo -e "********************************************************************************\n"

lein run dump-to-h2 "$DEST_DB"

echo -e "\n********************************************************************************"
echo "Comparing contents of $SOURCE_DB and $DEST_DB..."
echo -e "********************************************************************************\n"

lein compare-h2-dbs "$SOURCE_DB" "$DEST_DB"
