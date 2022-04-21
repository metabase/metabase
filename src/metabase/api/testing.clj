(ns metabase.api.testing
  "Endpoints for testing."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.db.connection :as mdb.connection]
            [metabase.util.files :as u.files]
            [potemkin :as p])
  (:import com.mchange.v2.c3p0.PoolBackedDataSource
           javax.sql.DataSource))

;; EVERYTHING BELOW IS FOR H2 ONLY.

(defn- assert-h2 [app-db]
  (assert (= (:db-type app-db) :h2)
          "Snapshot/restore only works for :h2 application databases."))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (let [path (u.files/get-path "frontend" "test" "snapshots"
                               (str (str/replace (name snapshot-name) #"\W" "_") ".sql"))]
    (str (.toAbsolutePath path))))

;;;; SAVE

(defn- save-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query {:datasource mdb.connection/*application-db*} ["SCRIPT TO ?" path]))
  :ok)

(api/defendpoint POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  (save-snapshot! name)
  nil)

;;;; RESTORE

;; A DataSource wrapping another DataSource with a `lock` that we can lock to prevent anyone from getting a Connection.
;; We'll use this to shut down access to the application DB during the restore process.
(p/defrecord+ LockableDataSource [^DataSource data-source ^Object lock]
  DataSource
  (getConnection [_]
    (locking lock
      (.getConnection data-source)))

  (getConnection [_ user password]
    (locking lock
      (.getConnection data-source user password))))

(defn- lockable-data-source? [data-source]
  (instance? LockableDataSource data-source))

(defn- lockable-data-source ^DataSource [data-source]
    (if (lockable-data-source? data-source)
      data-source
      (->LockableDataSource data-source (Object.))))

(defn- reset-app-db-connection-pool!
  "Immediately destroy all open connections in the app DB connection pool."
  ([]
   (reset-app-db-connection-pool! (:data-source mdb.connection/*application-db*)))
  ([data-source]
   (cond
     (lockable-data-source? data-source)
     (recur (:data-source data-source))

     (instance? PoolBackedDataSource data-source)
     (do
       (log/info "Destroying application database connection pool")
       (.hardReset ^PoolBackedDataSource data-source)))))

(defn- restore-app-db-from-snapshot!
  "Drop all objects in the application DB, then reload everything from the SQL dump at `snapshot-path`."
  [^String snapshot-path]
  (log/infof "Restoring snapshot from %s" snapshot-path)
  (api/check-404 (.exists (java.io.File. snapshot-path)))
  (with-open [conn (.getConnection mdb.connection/*application-db*)]
    (doseq [sql-args [["SET LOCK_TIMEOUT 180000"]
                      ["DROP ALL OBJECTS"]
                      ["RUNSCRIPT FROM ?" snapshot-path]]]
      (jdbc/execute! {:connection conn} sql-args))))

(defn- increment-app-db-unique-indentifier!
  "Increment the [[mdb.connection/unique-identifier]] for the Metabase application DB. This effectively flushes all
  caches using it as a key (including things using [[mdb.connection/memoize-for-application-db]]) such as the Settings
  cache."
  []
  (alter-var-root #'mdb.connection/*application-db* assoc :id (swap! (var-get #'mdb.connection/application-db-counter) inc)))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  ;; make sure the app DB has a lockable data source
  (when-not (lockable-data-source? (:data-source mdb.connection/*application-db*))
    (alter-var-root #'mdb.connection/*application-db* update :data-source lockable-data-source))
  (let [path (snapshot-path-for-name snapshot-name)
        ;; now get the lock for the app DB to prevent anyone else from opening connections until we finish the process
        lock (get-in mdb.connection/*application-db* [:data-source :lock])]
    (assert lock)
    (locking lock
      (reset-app-db-connection-pool!)
      (restore-app-db-from-snapshot! path)
      (increment-app-db-unique-indentifier!)))
  :ok)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (restore-snapshot! name)
  nil)

(api/define-routes)
