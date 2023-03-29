(ns metabase.api.testing
  "Endpoints for testing."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.db.connection :as mdb.connection]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource)
   (java.util.concurrent.locks ReentrantReadWriteLock)))

(set! *warn-on-reflection* true)

;; EVERYTHING BELOW IS FOR H2 ONLY.

(defn- assert-h2 [app-db]
  (assert (= (:db-type app-db) :h2)
          "Snapshot/restore only works for :h2 application databases."))

(defn- snapshot-path-for-name
  ^String [snapshot-name]
  (let [path (u.files/get-path "e2e" "snapshots"
                               (str (str/replace (name snapshot-name) #"\W" "_") ".sql"))]
    (str (.toAbsolutePath path))))

;;;; SAVE

(defn- save-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query {:datasource mdb.connection/*application-db*} ["SCRIPT TO ?" path]))
  :ok)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  (save-snapshot! name)
  nil)

;;;; RESTORE

(defn- reset-app-db-connection-pool!
  "Immediately destroy all open connections in the app DB connection pool."
  []
  (let [{:keys [data-source]} mdb.connection/*application-db*]
     (when (instance? PoolBackedDataSource data-source)
       (log/info "Destroying application database connection pool")
       (.hardReset ^PoolBackedDataSource data-source))))

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
  (alter-var-root #'mdb.connection/*application-db* assoc :id (swap! mdb.connection/application-db-counter inc)))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2 mdb.connection/*application-db*)
  (let [path                         (snapshot-path-for-name snapshot-name)
        ^ReentrantReadWriteLock lock (:lock mdb.connection/*application-db*)]
    ;; acquire the application DB WRITE LOCK which will prevent any other threads from getting any new connections until
    ;; we release it.
    (try
      (.. lock writeLock lock)
      (reset-app-db-connection-pool!)
      (restore-app-db-from-snapshot! path)
      (increment-app-db-unique-indentifier!)
      (finally
        (.. lock writeLock unlock))))
  :ok)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  (restore-snapshot! name)
  nil)

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint-schema POST "/echo"
  [fail :as {:keys [body]}]
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body body}))

(api/define-routes)
