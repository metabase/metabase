#! /usr/bin/env bash

set -euxo pipefail

clojure -M:cljfmt \
--indents ./.cljfmt/indents.clj \
src/metabase/api/collection.clj
