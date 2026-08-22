(ns metabase.app-db.snapshot-test-util.postgres
  "Dumps a Postgres app DB with the `pg_dump` shipped in the server's own container."
  (:require
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(defrecord PostgresDumper []
  dump/Dumper
  (dump-statements [_dumper {:keys [exec!] {:keys [db user]} :details} _conn]
    ;; `--inserts` so the data comes back as ordinary statements rather than a COPY stream, which the loader would
    ;; have to speak a second format to replay. Comments are kept: migrations set them on tables and columns, so
    ;; `--no-comments` would leave a loaded snapshot short the ones every changeset up to the boundary added.
    ;;
    ;; The host and port are the ones the server listens on inside its container, not the ones this JVM reaches it
    ;; by, because `exec!` runs there.
    (dump-util/lines->statements
     (str/split-lines
      (exec! "pg_dump" "--no-owner" "--no-privileges" "--inserts"
             "--host" "127.0.0.1" "--port" "5432" "--username" (str user) (str db))))))

(def dumper
  "Dumps a Postgres app DB."
  (->PostgresDumper))
