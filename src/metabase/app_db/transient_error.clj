(ns metabase.app-db.transient-error
  "Detection of transient application database errors (deadlocks, lock timeouts, serialization failures)
  that may succeed on retry."
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def ^:private transient-error-codes
  "SQL states (strings) and error codes (ints) that indicate transient, retryable database errors.
  Keyed by appdb type. PostgreSQL uses SQL states; MySQL and H2 use numeric error codes."
  {:postgres #{"40P01"  ; deadlock detected
               "40001"  ; serialization failure
               "55P03"} ; lock not available (lock timeout)
   :mysql    #{1213     ; ER_LOCK_DEADLOCK
               1205}    ; ER_LOCK_WAIT_TIMEOUT
   :h2       #{40001    ; DEADLOCK_1
               50200}}) ; LOCK_TIMEOUT_1

(def ^:private table-not-found-sql-states
  ;; `undefined_table` (42P01) is PostgreSQL-specific; the rest are X/Open. H2 uses three missing-table states,
  ;; corresponding to `TABLE_OR_VIEW_NOT_FOUND_1`, `..._WITH_CANDIDATES_2`, and `..._DATABASE_EMPTY_1` in
  ;; `org.h2.api.ErrorCode`.
  #{"42P01" "42S02" "42S03" "42S04"})

(defn table-not-found?
  "Whether exception `e` was caused by querying a table that does not exist.
  SQLSTATE distinguishes a missing table from other errors raised by the same driver.
  Walks the full exception cause chain."
  [e]
  (boolean (some #(and (instance? SQLException %)
                       (contains? table-not-found-sql-states (.getSQLState ^SQLException %)))
                 (take-while some? (iterate ex-cause e)))))

(defn- transient-sql-exception?
  [codes ^SQLException e]
  (or (contains? codes (.getSQLState e))
      (contains? codes (.getErrorCode e))))

(defn transient-error?
  "Whether exception `e` represents a transient database error (deadlock, lock timeout, serialization failure)
  that may succeed on retry. Walks the full exception cause chain."
  [db-type ^Throwable e]
  (let [codes (get transient-error-codes (keyword db-type))]
    (boolean
     (some #(and (instance? SQLException %)
                 (transient-sql-exception? codes %))
           (take-while some? (iterate ex-cause e))))))
