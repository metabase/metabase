(ns metabase.app-db.snapshot-test-util.postgres
  "Dumps a Postgres app DB with `pg_dump`, run out of a pinned client image."
  (:require
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(def ^:private client-image
  "Image `pg_dump` is taken from. `pg_dump` refuses a server newer than itself, so this tracks the newest Postgres the
  snapshot is tested against rather than pinning a release: one file is written from both ends of that range."
  "postgres:latest")

(defrecord PostgresDumper []
  dump/Dumper
  (dump-statements [_dumper {:keys [host port db user]} _conn]
    ;; `--inserts` so the data comes back as ordinary statements rather than a COPY stream, which the loader would
    ;; have to speak a second format to replay. Comments are kept: migrations set them on tables and columns, so
    ;; `--no-comments` would leave a loaded snapshot short the ones every changeset up to the boundary added.
    (dump-util/lines->statements
     (str/split-lines
      (apply dump-util/sh!
             (concat (dump-util/client-command client-image "pg_dump")
                     ["--no-owner" "--no-privileges" "--inserts"
                      "--host" (dump-util/client-host host) "--port" (str port)
                      "--username" (str user) (str db)]))))))

(def dumper
  "Dumps a Postgres app DB."
  (->PostgresDumper))
