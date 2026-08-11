(ns metabase.app-db.snapshot-test-util.h2
  "Dumps an H2 app DB with its own `SCRIPT` command, so no dump tool has to be installed."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]))

(set! *warn-on-reflection* true)

(defn- view-statement? [sql]
  (some? (re-find #"(?i)^CREATE\s+VIEW\s" sql)))

(defrecord H2Dumper []
  dump/Dumper
  (dump-statements [_dumper _details conn]
    ;; `SCRIPT` already returns one statement per row, so no parsing is needed. `MEMORY`/`CACHED` is dropped so the
    ;; loading DB picks its own default (in-memory DBs get MEMORY, file-backed ones CACHED); `SET`, `CREATE USER` and
    ;; the version banner describe the DB the dump came from, not the schema.
    ;;
    ;; `FORCE` is dropped and the views are moved to the end, in that order for a reason. SCRIPT does not
    ;; dependency-sort what it emits, and a view that a later migration redefined keeps the slot it got when it was
    ;; first created -- so a view can come out ahead of a table it now reads from. Replaying the changelog never hits
    ;; this, because there each definition runs after the tables it names. `CREATE FORCE VIEW` against a table that
    ;; does not exist yet succeeds, leaving behind a view with no columns that H2 never recompiles. Loading views
    ;; last makes the reference resolvable; loading them without `FORCE` makes anything still unresolvable fail
    ;; loudly instead of silently producing an empty view.
    (let [stmts (into []
                      (comp (map :script)
                            (map str/trim)
                            (remove str/blank?)
                            (remove #(re-matches #"(?is)^(CREATE USER|SET|--).*" %))
                            (map #(str/replace % #"(?i)^CREATE (MEMORY|CACHED) TABLE " "CREATE TABLE "))
                            (map #(str/replace % #"(?i)^CREATE FORCE VIEW " "CREATE VIEW "))
                            (map #(str/replace % #";\s*$" "")))
                      (jdbc/query {:connection conn} ["SCRIPT"]))]
      ;; relative order is kept inside each group: a view may read from an earlier view
      (into (vec (remove view-statement? stmts))
            (filter view-statement? stmts)))))

(def dumper
  "Dumps an H2 app DB. Reads everything through the connection, so it ignores the connection details."
  (->H2Dumper))
