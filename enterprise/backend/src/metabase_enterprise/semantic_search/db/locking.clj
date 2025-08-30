(ns metabase-enterprise.semantic-search.db.locking
  (:require
   [honey.sql :as sql]
   [honey.sql.helpers :as sql.helpers]
   [metabase-enterprise.semantic-search.db.util :as semantic.db.util]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

(def ^:private supported-lock-types
  #{;; blocking exclusive transaction lock
    :pg_advisory_xact_lock
    ;; non-blocking exclusive transaction lock
    :pg_try_advisory_xact_lock
    ;; non-blocking shared transaction lock
    :pg_try_advisory_xact_lock_shared})

(defn- lock-not-avail-ex?
  "SQL locking exceptino?"
  [e]
  (boolean
   (when (instance? SQLException e)
     (= "55P03" (.getSQLState ^SQLException e)))))

(defn lock-or-throw!
  "Acquire advisory lock. Throw if not possible. Blocks with blocking locks."
  [conn lock-type lock-id]
  (log/debugf "Attempting to acquire %s %d lock." lock-type lock-id)
  (assert (supported-lock-types lock-type))
  (assert (integer? lock-id))
  (semantic.db.util/tx-or-throw! conn)
  (let [sql (sql/format (sql.helpers/select [[lock-type [:raw lock-id]] :acquired]))
        acquired? (:acquired (try (jdbc/execute-one! conn sql)
                                  (catch SQLException e
                                    (if (lock-not-avail-ex? e)
                                      (throw (ex-info "Lock could not be acquired"
                                                      {:lock-type lock-type
                                                       :lock-id lock-id}
                                                      e))
                                      (throw e)))))]
    ;; For non-blocking write locks. Now not in use as we attempt migrating without shared write locks.
    (when-not acquired?
      (throw (ex-info "Lock could not be acquired"
                      {:lock-type lock-type
                       :lock-id lock-id})))
    (log/debugf "Lock %s %d acquired." lock-type lock-id)
    nil))

(def ^:private migration-lock 19991)

;; Unused atm as yolo-write by other nodes during migration should be safe
#_(defn acquire-write-lock!
    [conn]
    (lock-or-throw! conn :pg_try_advisory_xact_lock_shared migration-lock))

(defn acquire-migration-lock!
  "Acquire migration advisory lock. Blocks until acquired or timeout (if conn lock_timeout is 0 then conn timeout)."
  [conn]
  (lock-or-throw! conn :pg_advisory_xact_lock migration-lock))
