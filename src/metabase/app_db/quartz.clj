(ns metabase.app-db.quartz
  "Quartz's `ConnectionProvider` for the application DB."
  (:require
   [metabase.app-db.connection :as mdb.connection]
   [metabase.task.bootstrap :as task.bootstrap]))

(set! *warn-on-reflection* true)

;; Custom `ConnectionProvider` implementation that uses a dedicated connection pool for the application DB to provide
;; connections.
(defrecord ^:private ConnectionProvider []
  org.quartz.utils.ConnectionProvider
  (initialize [_])
  (getConnection [_]
    ;; get a connection from the dedicated Quartz connection pool. Quartz will close it (i.e., return it to the pool)
    ;; when it's done.
    ;;
    ;; very important! Fetch a new connection from the connection pool rather than reusing a Connection already bound
    ;; to the calling thread (e.g. toucan2's *current-connectable*) -- Quartz manages the connection's whole
    ;; lifecycle (setAutoCommit/commit/rollback/close), and its cluster locking relies on commit/rollback to release
    ;; row locks on the QRTZ_LOCKS table, so it must never share a connection with an outer transaction.
    ;;
    ;; the pool is separate from the main application DB pool so that a Quartz operation triggered by a thread inside
    ;; a `with-transaction` block can't deadlock when application code has saturated the main pool.
    (task.bootstrap/intercept-connection (.getConnection (mdb.connection/quartz-data-source))))
  (shutdown [_]))

(when-not *compile-files*
  (System/setProperty "org.quartz.dataSource.db.connectionProvider.class" (.getName ConnectionProvider)))
