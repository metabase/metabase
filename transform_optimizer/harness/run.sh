#!/usr/bin/env bash
# Validation harness wrapper. Pulls next.jdbc + the Postgres driver inline so
# the script is independent of the Metabase deps.edn / classpath.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"

exec clojure \
  -Sdeps '{:deps {com.github.seancorfield/next.jdbc {:mvn/version "1.3.939"}
                  org.postgresql/postgresql        {:mvn/version "42.7.4"}}}' \
  "$DIR/run.clj" "$@"
