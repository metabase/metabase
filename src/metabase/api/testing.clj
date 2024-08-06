(ns metabase.api.testing
  "Endpoints for testing."
  (:require
   [cheshire.core :as json]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [compojure.core :refer [POST]]
   [java-time.api :as t]
   [java-time.clock]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.util.date-2 :as u.date]
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
  (assert-h2 (mdb/app-db))
  (let [path (snapshot-path-for-name snapshot-name)]
    (log/infof "Saving snapshot to %s" path)
    (jdbc/query {:datasource (mdb/app-db)} ["SCRIPT TO ?" path]))
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
  (let [data-source (mdb/data-source)]
     (when (instance? PoolBackedDataSource data-source)
       (log/info "Destroying application database connection pool")
       (.hardReset ^PoolBackedDataSource data-source))))

(defn- restore-app-db-from-snapshot!
  "Drop all objects in the application DB, then reload everything from the SQL dump at `snapshot-path`."
  [^String snapshot-path]
  (log/infof "Restoring snapshot from %s" snapshot-path)
  (api/check-404 (.exists (java.io.File. snapshot-path)))
  (with-open [conn (.getConnection (mdb/app-db))]
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
      (jdbc/execute! {:connection conn} (format "ALTER VIEW %s RECOMPILE" table-name)))))

(defn- restore-snapshot! [snapshot-name]
  (assert-h2 (mdb/app-db))
  (let [path                         (snapshot-path-for-name snapshot-name)
        ^ReentrantReadWriteLock lock (:lock (mdb/app-db))]
    ;; acquire the application DB WRITE LOCK which will prevent any other threads from getting any new connections until
    ;; we release it.
    (try
      (.. lock writeLock lock)
      (reset-app-db-connection-pool!)
      (restore-app-db-from-snapshot! path)
      (mdb/increment-app-db-unique-indentifier!)
      (finally
        (.. lock writeLock unlock)
        ;; don't know why this happens but when I try to test things locally with `yarn-test-cypress-open-no-backend`
        ;; and a backend server started with `dev/start!` the snapshots are always missing columms added by DB
        ;; migrations. So let's just check and make sure it's fully up to date in this scenario. Not doing this outside
        ;; of dev because it seems to work fine for whatever reason normally and we don't want tests taking 5 million
        ;; years to run because we're wasting a bunch of time initializing Liquibase and checking for unrun migrations
        ;; for every test when we don't need to. -- Cam
        ;;
        ;; Important! This needs to happen AFTER we unlock the app DB, otherwise migrations will hang for the evil ones
        ;; that are initializing Quartz and opening new connections to do stuff on different threads.
        (when config/is-dev?
          (mdb/migrate! (mdb/app-db) :up)))))
  :ok)

(api/defendpoint POST "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [name]
  {name ms/NonBlankString}
  (restore-snapshot! name)
  nil)

(api/defendpoint POST "/echo"
  "Simple echo hander. Fails when you POST {\"fail\": true}."
  [fail :as {:keys [body]}]
  {fail ms/BooleanValue}
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body body}))

(api/defendpoint POST "/set-time"
  "Make java-time see world at exact time."
  [:as {{:keys [time add-ms]} :body}]
  {time   [:maybe ms/TemporalString]
   add-ms [:maybe ms/Int]}
  (let [clock (when-let [time' (cond
                                 time   (u.date/parse time)
                                 add-ms (t/plus (t/zoned-date-time)
                                                (t/duration add-ms :millis)))]
                (t/mock-clock (t/instant time') (t/zone-id time')))]
    ;; if time' is `nil`, we'll get system clock back
    (alter-var-root #'java-time.clock/*clock* (constantly clock))
    {:result (if clock :set :reset)
     :time   (t/instant)}))

(api/defendpoint GET "/echo"
  "Simple echo hander. Fails when you GET {\"fail\": true}."
  [fail body]
  {fail ms/BooleanValue
   body ms/JSONString}
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body (json/decode body true)}))

(api/define-routes)
