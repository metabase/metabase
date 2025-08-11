(ns ^{:clj-kondo/ignore [:discouraged-var :unused-private-var]}
 metabase-enterprise.semantic-search.db.locking
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
  #{:pg_advisory_xact_lock
    :pg_try_advisory_xact_lock
    :pg_try_advisory_xact_lock_shared})

(defn- lock-not-avail-ex?
  [e]
  (boolean
   (when (instance? SQLException e)
     (= "55P03" (.getSQLState ^SQLException e)))))

(defn lock-or-throw!
  [conn lock-type lock-id]
  (log/debugf "Attempting to acquire %s %d lock." lock-type lock-id)
  (assert (supported-lock-types lock-type))
  (assert (integer? lock-id))
  (semantic.db.util/tx-or-throw! conn)
  (let [sql (sql/format (sql.helpers/select [[lock-type [:raw lock-id]] :acquired]))
        acquired? (:acquired (try (jdbc/execute-one! conn sql)
                                  (catch SQLException e
                                    (if (lock-not-avail-ex? e)
                                      (throw (Exception. "Lock could not be acquired" e))
                                      (throw e)))))]
    (when-not acquired?
      (throw (Exception. "Migration lock could not be acquired")))
    (log/debugf "Lock %s %d acquired." lock-type lock-id)
    nil))

;; TODO: Locks should be defined in consumer namespaces, using tools from this ns.

(def ^:private migration-lock 19991)

(defn acquire-write-lock!
  [conn]
  (lock-or-throw! conn :pg_try_advisory_xact_lock_shared migration-lock))

(defn acquire-migraiton-lock!
  [conn]
  (lock-or-throw! conn :pg_advisory_xact_lock migration-lock))