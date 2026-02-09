(ns metabase.testing-api.api
  "Endpoints for testing."
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [java-time.api :as t]
   [java-time.clock]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.test-spec :as lib.schema.test-spec]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.search.core :as search]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.util.date-2 :as u.date]
   [metabase.util.files :as u.files]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource)
   (java.util Queue)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/snapshot/:name"
  "Snapshot the database for testing purposes."
  [{snapshot-name :name} :- [:map
                             [:name ms/NonBlankString]]]
  (save-snapshot! snapshot-name)
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
        ;; and a backend server started with `dev/start!` the snapshots are always missing columns added by DB
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/restore/:name"
  "Restore a database snapshot for testing purposes."
  [{snapshot-name :name} :- [:map
                             [:name ms/NonBlankString]]
   {:keys [reindex]} :- [:map
                         [:reindex {:default false} ms/BooleanValue]]]
  ;; reset the system clock, in case `/set-time` was called without cleanup
  (alter-var-root #'java-time.clock/*clock* (constantly nil))
  (.clear ^Queue @#'search.ingestion/queue)
  (restore-snapshot! snapshot-name)
  (when reindex
    (search/reindex! {:async? false}))
  nil)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/echo"
  "Simple echo handler. Fails when you POST with `?fail=true`."
  [_route-params
   {:keys [fail]} :- [:map
                      [:fail {:default false} ms/BooleanValue]]
   body]
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body body}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/set-time"
  "Make java-time see world at exact time."
  [_route-params
   _query-params
   {:keys [time add-ms]} :- [:map
                             [:time   {:optional true} [:maybe ms/TemporalString]]
                             [:add-ms {:optional true} [:maybe ms/Int]]]]
  (let [clock (when-let [time' (cond
                                 time   (u.date/parse time)
                                 add-ms (t/plus (t/zoned-date-time)
                                                (t/duration add-ms :millis)))]
                (t/mock-clock (t/instant time') (t/zone-id time')))]
    ;; if time' is `nil`, we'll get system clock back
    (alter-var-root #'java-time.clock/*clock* (constantly clock))
    {:result (if clock :set :reset)
     :time   (t/instant)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/echo"
  "Simple echo handler. Fails when you GET with `?fail=true`."
  [_route-params
   {:keys [fail body]} :- [:map
                           [:fail {:default false} ms/BooleanValue]
                           [:body ms/JSONString]]]
  (if fail
    {:status 400
     :body {:error-code "oops"}}
    {:status 200
     :body (json/decode+kw body)}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/mark-stale"
  "Mark the card or dashboard as stale"
  [_route-params
   _query-params
   {:keys [id model date-str]} :- [:map
                                   [:id       ms/PositiveInt]
                                   [:model    :string]
                                   [:date-str {:optional true} [:maybe :string]]]]
  (let [date (if date-str
               (try (t/local-date "yyyy-MM-dd" date-str)
                    (catch Exception _
                      (throw (ex-info (str "invalid date: '"
                                           date-str
                                           "' expected format: 'yyyy-MM-dd'")
                                      {:status 400}))))
               (t/minus (t/local-date) (t/months 7)))]
    (case model
      "card"      (t2/update! :model/Card :id id {:last_used_at date})
      "dashboard" (t2/update! :model/Dashboard :id id {:last_viewed_at date}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/stats"
  "Triggers a send of instance usage stats"
  []
  (analytics/phone-home-stats!)
  {:success true})

(defenterprise refresh-cache-configs!
  "Manually triggers the preemptive caching refresh job on EE. No-op on OSS."
  metabase-enterprise.cache.task.refresh-cache-configs
  [])

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/refresh-caches"
  "Manually triggers the cache refresh task, if Enterprise code is available."
  []
  (refresh-cache-configs!))

(api.macros/defendpoint :post "/query" :- ::lib.schema/query
  "Creates a query from a test query spec."
  [_route-params
   _query-params
   {:keys [database], :as query-spec} :- [:merge
                                          [:map
                                           [:database ::lib.schema.id/database]]
                                          [:ref ::lib.schema.test-spec/test-query-spec]]]
  (-> (lib-be/application-database-metadata-provider database)
      (lib/test-query query-spec)))
