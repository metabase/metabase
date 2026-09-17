(ns metabase.app-db.sql-errors
  "Classification of SQL errors raised by the supported application databases.
  [[error-kind]] names the class of error an exception represents; [[table-not-found?]] is its common special case."
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def sql-states
  "SQLSTATE codes returned by supported application databases."
  {;; PostgreSQL, missing table.
   :undefined-table                         "42P01"
   ;; MySQL, MariaDB, and H2, missing table.
   :table-or-view-not-found                 "42S02"
   ;; H2, missing table when it can suggest a similar name.
   :table-or-view-not-found-with-candidates "42S03"
   ;; H2, missing table in an empty database.
   :table-or-view-not-found-database-empty  "42S04"
   ;; PostgreSQL and H2, duplicate key.
   :unique-violation                        "23505"
   ;; MySQL and MariaDB, every kind of constraint failure.
   :integrity-constraint-violation          "23000"})

(def error-codes
  "Vendor-specific error codes returned by supported application databases."
  {:mysql/duplicate-entry 1062})

;; Keep this in step with `impl-table-known-to-not-exist?` in the H2, Postgres, and MySQL drivers.
;; This module cannot depend on the driver module, so the states are listed in both places.
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

      ;; MySQL and MariaDB use 23000 for every constraint failure, so a duplicate key shows only in the vendor code.
      ;; Vendor codes mean nothing across vendors, so check the code only once the SQLSTATE has matched.
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
