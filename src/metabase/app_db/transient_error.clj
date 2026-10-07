(ns metabase.app-db.transient-error
  "Detection of transient application database errors (deadlocks, lock timeouts, serialization failures)
  that may succeed on retry."
  (:require
   [metabase.util :as u])
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

(defn- transient-sql-exception?
  [codes ^SQLException e]
  (or (contains? codes (.getSQLState e))
      (contains? codes (.getErrorCode e))))

(def ^:private lock-not-available-codes
  "SQL states (strings) and error codes (ints) of a row lock that a statement did not get: a lock with NOWAIT that
  another transaction holds, or a lock wait that reached the lock timeout. Keyed by appdb type."
  {:postgres #{"55P03"} ; lock not available
   :mysql    #{3572     ; ER_LOCK_NOWAIT (MySQL)
               1205}    ; ER_LOCK_WAIT_TIMEOUT (MySQL; MariaDB also gives it for NOWAIT)
   :h2       #{50200}}) ; LOCK_TIMEOUT_1

(defn lock-not-available?
  "Whether exception `e` is the error of a row lock that the app DB of type `db-type` did not give at once: a lock
  with NOWAIT that another transaction holds, or a lock wait that reached the lock timeout. Walks the full exception
  cause chain."
  [db-type ^Throwable e]
  (let [codes (get lock-not-available-codes (keyword db-type))]
    (boolean
     (some #(and (instance? SQLException %)
                 (transient-sql-exception? codes %))
           (u/full-exception-chain e)))))

(defn transient-error?
  "Whether exception `e` represents a transient database error (deadlock, lock timeout, serialization failure)
  that may succeed on retry. Walks the full exception cause chain."
  [db-type ^Throwable e]
  (let [codes (get transient-error-codes (keyword db-type))]
    (boolean
     (some #(and (instance? SQLException %)
                 (transient-sql-exception? codes %))
           (u/full-exception-chain e)))))
