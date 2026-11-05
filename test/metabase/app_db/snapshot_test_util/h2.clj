(ns metabase.app-db.snapshot-test-util.h2
  "Dumps an H2 app DB with its own `SCRIPT` command, so no dump tool has to be installed."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.app-db.snapshot-test-util.dump :as dump]
   [metabase.app-db.snapshot-test-util.dump-util :as dump-util]))

(set! *warn-on-reflection* true)

(defrecord H2Dumper []
  dump/Dumper
  (dump-statements [_dumper _details conn]
    ;; H2's `SCRIPT` already returns one statement per row, so no parsing is needed. The MEMORY or CACHED keyword is
    ;; dropped so the loading DB picks its own default (in-memory DBs get MEMORY, file-backed ones CACHED). The SET and
    ;; CREATE USER statements and the version banner describe the DB the dump came from, not the schema.
    ;;
    ;; The FORCE keyword is dropped and the views are moved to the end, in that order for a reason. SCRIPT does not
    ;; dependency-sort what it emits, and a view that a later migration redefined keeps the slot it got when it was
    ;; first created, so a view can come out ahead of a table it now reads from. Replaying the changelog never hits
    ;; this, because there each definition runs after the tables it names. A CREATE FORCE VIEW against a table
    ;; that does not exist yet succeeds, leaving behind a view with no columns that H2 never recompiles. Loading views
    ;; last makes the reference resolvable; loading them without `FORCE` makes anything still unresolvable fail
    ;; loudly instead of silently producing an empty view.
    (let [stmts          (into []
                               (comp (map :script)
                                     (map str/trim)
                                     (remove str/blank?)
                                     (remove #(re-matches #"(?is)^(CREATE USER|SET|--).*" %))
                                     (map #(str/replace % #"(?i)^CREATE (MEMORY|CACHED) TABLE " "CREATE TABLE "))
                                     (map #(str/replace % #"(?i)^CREATE FORCE VIEW " "CREATE VIEW "))
                                     (map #(str/replace % #";\s*$" "")))
                               (jdbc/query {:connection conn} ["SCRIPT"]))
          [others views] (dump-util/split-views stmts)]
      (into (vec others) views))))

(def dumper
  "Dumps an H2 app DB. Reads everything through the connection, so it ignores the connection details."
  (->H2Dumper))
