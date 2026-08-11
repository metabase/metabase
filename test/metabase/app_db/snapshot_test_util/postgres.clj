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
    ;; have to speak a second format to replay
    (dump-util/lines->statements
     (str/split-lines
      (dump-util/sh! "pg_dump" "--no-owner" "--no-privileges" "--no-comments" "--inserts"
                     "--host" (str host) "--port" (str port) "--username" (str user) (str db))))))

(def dumper
  "Dumps a Postgres app DB."
  (->PostgresDumper))
