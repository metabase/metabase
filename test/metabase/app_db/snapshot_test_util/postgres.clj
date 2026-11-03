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
    ;; Dumped as INSERTs rather than a COPY stream, which the loader would have to speak a second format to replay, with
    ;; up to 1000 rows to a statement rather than one. Comments are kept: migrations set them on tables and columns, so
    ;; `--no-comments` would leave a loaded snapshot short the ones every changeset up to the boundary added.
    ;;
    ;; The host and port are the ones the server listens on inside its container, not the ones this JVM reaches it
    ;; by, because `exec!` runs there.
    ;;
    ;; Extension comments are dump metadata rather than app schema, and only the extension's owner may set one, so a
    ;; snapshot carrying them fails to load wherever another role owns `citext`.
    (remove #(re-find #"(?i)^COMMENT ON EXTENSION " %)
            (dump-util/lines->statements
             (str/split-lines
              (exec! "pg_dump" "--no-owner" "--no-privileges" "--rows-per-insert=1000"
                     "--host" "127.0.0.1" "--port" "5432" "--username" (str user) (str db)))))))

(def dumper
  "Dumps a Postgres app DB."
  (->PostgresDumper))
