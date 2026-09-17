(ns metabase.app-db.sql-errors
  "Classification of SQL errors raised by the supported application databases.
  [[error-kind]] names the class of error an exception represents; [[table-not-found?]] is its common special case."
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

;; The registries name every code we recognize so the classifier reads by intent rather than by bare string.
;; Keep them cumulative: append newly recognized codes rather than removing entries that temporarily have no caller.
;; They are the shared app-db SQL vocabulary, not an inventory of what the current change happens to use.
;; Keep the missing-table states aligned with `impl-table-known-to-not-exist?` in the H2, Postgres, and MySQL
;; drivers: this module cannot depend on the driver module, so the lists are maintained in both places.
(def sql-states
  "SQLSTATE codes returned by supported application databases."
  ;; `undefined_table` (42P01) is PostgreSQL-specific. 42S02 is the ODBC/X-Open state for a missing table; H2 adds
  ;; two of its own, mapping `TABLE_OR_VIEW_NOT_FOUND_1`, `..._WITH_CANDIDATES_2`, and `..._DATABASE_EMPTY_1` in
  ;; `org.h2.api.ErrorCode` to 42S02, 42S03, and 42S04. 23000 is the standard integrity-constraint state; 23505 is
  ;; the PostgreSQL and H2 unique-violation state.
  {:undefined-table                         "42P01"
   :table-or-view-not-found                 "42S02"
   :table-or-view-not-found-with-candidates "42S03"
   :table-or-view-not-found-database-empty  "42S04"
   :unique-violation                        "23505"
   :integrity-constraint-violation          "23000"})

(def error-codes
  "Vendor-specific error codes returned by supported application databases."
  ;; MySQL and MariaDB use one SQLSTATE for every integrity-constraint failure, so `ER_DUP_ENTRY` identifies
  ;; duplicate keys. Consult a vendor code only after its SQLSTATE matched: H2 and MySQL both use small integers,
  ;; so a bare code lookup would classify the other vendor's error.
  {:mysql/duplicate-entry 1062})

(def ^:private table-not-found-states
  (into #{} (map sql-states) [:undefined-table
                              :table-or-view-not-found
                              :table-or-view-not-found-with-candidates
                              :table-or-view-not-found-database-empty]))

(defn- sql-error-kind [^SQLException e]
  (let [state (.getSQLState e)]
    (cond
      (contains? table-not-found-states state)
      :table-not-found

      (= (sql-states :unique-violation) state)
      :duplicate-key

      (and (= (sql-states :integrity-constraint-violation) state)
           (= (error-codes :mysql/duplicate-entry) (.getErrorCode e)))
      :duplicate-key)))

(defn- exception-chain
  "Every exception reachable from `e`, following causes and JDBC's next-exception links without revisiting cycles."
  [e]
  (loop [pending [e]
         seen    #{}
         found   []]
    (if-let [^Throwable x (first pending)]
      (if (seen x)
        (recur (rest pending) seen found)
        (recur (into (vec (rest pending))
                     (remove nil?)
                     [(.getCause x)
                      (when (instance? SQLException x)
                        (.getNextException ^SQLException x))])
               (conj seen x)
               (conj found x)))
      found)))

(defn error-kind
  "The class of database error `e` represents: `:table-not-found`, `:duplicate-key`, or nil when unrecognized.
  Walks the full cause and JDBC next-exception chains; the first recognized class wins."
  [e]
  (some #(when (instance? SQLException %)
           (sql-error-kind %))
        (exception-chain e)))

(defn table-not-found?
  "Whether `e` was caused by querying a table that does not exist."
  [e]
  (= :table-not-found (error-kind e)))
