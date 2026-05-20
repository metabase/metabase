(ns metabase.app-db.transient-error
  "Detection of transient application database errors (deadlocks, lock timeouts, serialization failures)
  that may succeed on retry. Dispatches on appdb type so each database uses the correct error codes."
  (:require
   [metabase.app-db.query-cancelation :as query-cancelation])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(defmulti ^:private transient-error?*
  {:arglists '([db-type ^SQLException e])}
  (fn [db-type _e]
    (keyword db-type)))

;; PostgreSQL: deadlock (40P01), serialization failure (40001), lock timeout (55P03)
(defmethod transient-error?* :postgres
  [_db-type e]
  (contains? #{"40P01" "40001" "55P03"} (query-cancelation/sql-state e)))

;; MySQL/MariaDB: deadlock (error 1213), lock wait timeout (error 1205)
(defmethod transient-error?* :mysql
  [_db-type ^SQLException e]
  (contains? #{1213 1205} (.getErrorCode e)))

;; H2: deadlock (error 40001), lock timeout (error 50200)
(defmethod transient-error?* :h2
  [_db-type ^SQLException e]
  (contains? #{40001 50200} (.getErrorCode e)))

(defn transient-error?
  "Whether exception `e` represents a transient database error (deadlock, lock timeout, serialization failure)
  that may succeed on retry. Walks the full exception cause chain."
  [db-type ^Throwable e]
  (boolean
   (some #(and (instance? SQLException %)
               (transient-error?* db-type %))
         (take-while some? (iterate ex-cause e)))))
