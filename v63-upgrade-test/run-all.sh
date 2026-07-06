#!/usr/bin/env bash
# One-shot end-to-end check a PR reviewer can run.
#
# Builds an H2-stripped "v63" image from the branch's CI uberjar (using the real ee-extra removal
# script), seeds a Postgres app DB with an H2 sample via v62, upgrades to v63, and verifies the
# sample migrates to SQLite and the instance works -- all with H2 fully removed from the jar.
#
# Prereqs: Docker running; GH_TOKEN exported (to pull the CI uberjar); the metabase-ee-extra branch
# checked out at $EE_EXTRA_DIR. Exits non-zero if any step or check fails.
set -euo pipefail
cd "$(dirname "$0")"
. ./config.sh

echo "########## reset docker state (keeps the downloaded jar in build/) ##########"
./99-teardown.sh >/dev/null 2>&1 || true
docker volume rm "$PG_VOLUME" >/dev/null 2>&1 || true

echo "########## 01  build v63 jar (download branch jar, strip H2) ##########"; ./01-build-jar.sh
echo "########## 02  build v63 image ##########";                               ./02-build-image.sh
echo "########## 03  start Postgres app DB ##########";                         ./03-postgres.sh
echo "########## 04  seed v62 (H2 sample + admin user) ##########";             ./04-run-v62.sh
echo "########## 05  upgrade to v63 + verify ##########";                       ./05-run-v63.sh
