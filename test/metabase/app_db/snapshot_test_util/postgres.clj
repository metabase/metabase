(ns metabase.app-db.snapshot-test-util.postgres
  "Dumps a Postgres app DB with `pg_dump`, which must be on PATH."
  (:require
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(defrecord PostgresDumper []
  dump/Dumper
  (dump-statements [_dumper {:keys [host port db user]} _conn]
    ;; `--inserts` so the data comes back as ordinary statements rather than a COPY stream, which the loader would
    ;; have to speak a second format to replay. Comments are kept: migrations set them on tables and columns, so
    ;; `--no-comments` would leave a loaded snapshot short the ones every changeset up to the boundary added.
    (dump-util/lines->statements
     (str/split-lines
      (dump-util/sh! "pg_dump" "--no-owner" "--no-privileges" "--inserts"
                     "--host" (str host) "--port" (str port) "--username" (str user) (str db))))))

(def dumper
  "Dumps a Postgres app DB."
  (->PostgresDumper))
