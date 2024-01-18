(ns metabase.api.testing
  "Endpoints for testing."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.setup :as mdb.setup]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms])
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

(api/defendpoint POST "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [name]
  {name ms/NonBlankString}
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
      (jdbc/execute! {:connection conn} sql-args))

    ;; We've found a delightful bug in H2 where if you:
    ;; - create a table, then
    ;; - create a view based on the table, then
    ;; - modify the original table, then
    ;; - generate a snapshot

    ;; the generated snapshot has the `CREATE VIEW` *before* the `CREATE TABLE`. This results in a view that can't be
    ;; queried successfully until it is recompiled. Our workaround is to recompile ALL views immediately after we
    ;; restore the app DB from a snapshot. Bug report is here: https://github.com/h2database/h2database/issues/3942
    (doseq [table-name
            (->> (jdbc/query {:connection conn} ["SELECT table_name FROM information_schema.views WHERE table_schema=?" "PUBLIC"])
                 (map :table_name))]
      ;; parameterization doesn't work with view names. If someone maliciously named a table, this is bad. On the
      ;; other hand, this is not running in prod and you already had to have enough access to maliciously name the
      ;; table, so this is probably safe enough.
      (jdbc/execute! {:connection conn} (format "ALTER VIEW %s RECOMPILE" table-name))))
  ;; don't know why this happens but when I try to test things locally with `yarn-test-cypress-open-no-backend` and a
  ;; backend server started with `dev/start!` the snapshots are always missing columms added by DB migrations. So let's
  ;; just check and make sure it's fully up to date in this scenario. Not doing this outside of dev because it seems to
  ;; work fine for whatever reason normally and we don't want tests taking 5 million years to run because we're wasting
  ;; a bunch of time initializing Liquibase and checking for unrun migrations for every test when we don't need to. --
  ;; Cam
  (when config/is-dev?
    (mdb.setup/migrate! (mdb.connection/db-type) mdb.connection/*application-db* :up)))

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

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  {name ms/NonBlankString}
  (restore-snapshot! name)
  nil)

(api/defendpoint POST "/echo"
  [fail :as {:keys [body]}]
  {fail ms/BooleanValue}
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body body}))

(api/define-routes)
