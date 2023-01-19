(ns metabase.api.notify-test
  (:require
   [clj-http.client :as http]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.http-client :as client]
   [metabase.models :refer [Database]]
   [metabase.models.database :as database]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.middleware.util :as mw.util]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest authentication-test
  (testing "POST /api/notify/db/:id"
    (testing "endpoint requires MB_API_KEY set"
      (mt/with-temporary-setting-values [api-key nil]
        (is (= (-> mw.auth/key-not-set-response :body str)
               (client/client :post 403 "notify/db/100")))))
    (testing "endpoint requires authentication"
      (mt/with-temporary-setting-values [api-key "test-api-key"] ;; set in :test but not in :dev
        (is (= (get mw.util/response-forbidden :body)
               (client/client :post 403 "notify/db/100")))))))

(def api-headers {:headers {"X-METABASE-APIKEY" "test-api-key"
                            "Content-Type"      "application/json"}})

(deftest not-found-test
  (mt/with-temporary-setting-values [api-key "test-api-key"]
    (testing "POST /api/notify/db/:id"
      (testing "database must exist or we get a 404"
        (is (= {:status 404
                :body   "Not found."}
               (try (http/post (client/build-url (format "notify/db/%d" Integer/MAX_VALUE) {})
                               (merge {:accept :json} api-headers))
                    (catch clojure.lang.ExceptionInfo e
                      (select-keys (ex-data e) [:status :body]))))))
      (testing "table ID must exist or we get a 404"
        (is (= {:status 404
                :body   "Not found."}
               (try (http/post (client/build-url (format "notify/db/%d" (:id (mt/db))) {})
                               (merge {:accept       :json
                                       :content-type :json
                                       :form-params  {:table_id Integer/MAX_VALUE}}
                                      api-headers))
                    (catch clojure.lang.ExceptionInfo e
                      (select-keys (ex-data e) [:status :body]))))))
      (testing "table name must exist or we get a 404"
        (is (= {:status 404}
               (try (http/post (client/build-url (format "notify/db/%d" (:id (mt/db))) {})
                               (merge {:accept       :json
                                       :content-type :json
                                       :form-params  {:table_name "IncorrectToucanFact"}}
                                      api-headers))
                    (catch clojure.lang.ExceptionInfo e
                      (select-keys (ex-data e) [:status])))))))))

(deftest post-db-id-test
  (mt/test-drivers (mt/normal-drivers)
    (let [[{table-name :name schema-name :schema}] (->> (mt/db) database/tables)
          post (fn post-api
                 ([payload] (post-api payload 200))
                 ([payload expected-code]
                  (mt/with-temporary-setting-values [api-key "test-api-key"]
                    (mt/client :post expected-code (format "notify/db/%d" (u/the-id (mt/db)))
                               {:request-options api-headers}
                               (merge {:synchronous? true}
                                      payload)))))]
      (testing "sync just table when table is provided"
        (let [sync-table-metadata-called? (promise)
              sync-table-called?          (promise)
              sync-db-metadata-called?    (promise)
              sync-db-called?             (promise)]
          (with-redefs [metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver sync-table-metadata-called? true))
                        metabase.sync/sync-table!                        (fn [_table] (deliver sync-table-called? true))
                        metabase.sync.sync-metadata/sync-db-metadata!    (fn [_table] (deliver sync-db-metadata-called? true))
                        metabase.sync/sync-database!                     (fn [_table] (deliver sync-db-called? true))]
            (post {:scan :full, :table_name table-name})
            (is (not (realized? sync-table-metadata-called?)))
            (is @sync-table-called?)
            (is (not (realized? sync-db-metadata-called?)))
            (is (not (realized? sync-db-called?))))))
      (testing "sync just table when table name and schema are provided"
        (let [sync-table-metadata-called? (promise)
              sync-table-called?          (promise)
              sync-db-metadata-called?    (promise)
              sync-db-called?             (promise)]
          (with-redefs [metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver sync-table-metadata-called? true))
                        metabase.sync/sync-table!                        (fn [_table] (deliver sync-table-called? true))
                        metabase.sync.sync-metadata/sync-db-metadata!    (fn [_table] (deliver sync-db-metadata-called? true))
                        metabase.sync/sync-database!                     (fn [_table] (deliver sync-db-called? true))]
            (post {:scan :full, :table_name table-name :schema_name schema-name})
            (is (not (realized? sync-table-metadata-called?)))
            (is @sync-table-called?)
            (is (not (realized? sync-db-metadata-called?)))
            (is (not (realized? sync-db-called?))))))
      (testing "only a quick sync when quick parameter is provided"
        (let [sync-table-metadata-called? (promise)
              sync-table-called?          (promise)
              sync-db-metadata-called?    (promise)
              sync-db-called?             (promise)]
          (with-redefs [metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver sync-table-metadata-called? true))
                        metabase.sync/sync-table!                        (fn [_table] (deliver sync-table-called? true))
                        metabase.sync.sync-metadata/sync-db-metadata!    (fn [_table] (deliver sync-db-metadata-called? true))
                        metabase.sync/sync-database!                     (fn [_table] (deliver sync-db-called? true))]
            (post {:scan :schema, :table_name table-name})
            (is @sync-table-metadata-called?)
            (is (not (realized? sync-table-called?)))
            (is (not (realized? sync-db-metadata-called?)))
            (is (not (realized? sync-db-called?))))))
      (testing "full db sync by default"
        (let [full-sync? (promise)]
          (with-redefs [metabase.sync/sync-database! (fn [_db] (deliver full-sync? true))]
            (post {})
            (is @full-sync?))))
      (testing "simple sync with params"
        (let [full-sync?   (promise)
              smaller-sync (promise)]
          (with-redefs [metabase.sync/sync-database!                  (fn [_db] (deliver full-sync? true))
                        metabase.sync.sync-metadata/sync-db-metadata! (fn [_db] (deliver smaller-sync true))]
            (post {:scan :schema})
            (is (not (realized? full-sync?)))
            (is @smaller-sync))))
      (testing "errors on unrecognized scan options"
        (is (= {:errors
                {:scan "value may be nil, or if non-nil, value must be one of: `full`, `schema`."}}
               (post {:scan :unrecognized} 400)))))))

(defn- drop-if-exists-and-create-db!
  "Drop a Postgres database named `db-name` if it already exists; then create a new empty one with that name."
  [db-name]
  (let [spec (sql-jdbc.conn/connection-details->spec :postgres (mt/dbdef->connection-details :postgres :server nil))]
    ;; kill any open connections
    (jdbc/query spec ["SELECT pg_terminate_backend(pg_stat_activity.pid)
                       FROM pg_stat_activity
                       WHERE pg_stat_activity.datname = ?;" db-name])
    ;; create the DB
    (jdbc/execute! spec [(format "DROP DATABASE IF EXISTS \"%s\";
                                  CREATE DATABASE \"%s\";"
                                 db-name db-name)]
                   {:transaction? false})))

(deftest add-new-table-sync-test
  (mt/test-driver :postgres
    (testing "Ensure we have the ability to add a single new table"
      (let [db-name "add_new_table_sync_test_table"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})]
        (drop-if-exists-and-create-db! db-name)
        (mt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname db-name)}]
          (let [spec     (sql-jdbc.conn/connection-details->spec :postgres details)
                exec!    (fn [spec statements] (doseq [statement statements] (jdbc/execute! spec [statement])))
                tableset #(set (map (fn [{:keys [schema name]}] (format "%s.%s" schema name)) (db/select 'Table :db_id (:id %))))
                post     (fn post-api
                           ([payload] (post-api payload 200))
                           ([payload expected-code]
                            (mt/with-temporary-setting-values [api-key "test-api-key"]
                              (mt/client-full-response
                               :post expected-code (format "notify/db/%d" (:id database))
                               {:request-options api-headers}
                               (merge {:synchronous? true}
                                      payload)))))
                sync!    #(sync/sync-database! database)]
            (exec! spec ["CREATE TABLE public.FOO (val bigint NOT NULL);"
                         "CREATE TABLE public.BAR (val bigint NOT NULL);"])
            (sync!)
            ;; Create two more tables
            (exec! spec ["CREATE TABLE public.FERN (val bigint NOT NULL);"
                         "CREATE TABLE public.DOC (val bigint NOT NULL);"])
            ;; Assert that only the synced tables are present.
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar"} tables)))
            ;; While fern exists in the warehouse, it doesn't yet exist in metabase.
            ;; You can only add it by providing both table name and schema. This is inadequate.
            (is (= 404 (:status (post {:scan :full :table_name "fern"} 404))))
            ;; Still no fern
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar"} tables)))
            ;; Posting both table name and schema will succeed
            (is (= 200 (:status (post {:scan :full :schema_name "public" :table_name "fern"}))))
            ;; And assert that only the new table is added (doc is not).
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar" "public.fern"} tables)))
            (let [sync-table-metadata-called? (promise)
                  sync-table-called?          (promise)
                  sync-db-metadata-called?    (promise)
                  sync-db-called?             (promise)]
              (with-redefs [metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver sync-table-metadata-called? true))
                            metabase.sync/sync-table!                        (fn [_table] (deliver sync-table-called? true))
                            metabase.sync.sync-metadata/sync-db-metadata!    (fn [_table] (deliver sync-db-metadata-called? true))
                            metabase.sync/sync-database!                     (fn [_table] (deliver sync-db-called? true))]
                ;;Finally, call sync for public.doc and ensure that sync-table! is what is called.
                (is (= 200 (:status (post {:scan :full :schema_name "public" :table_name "doc"}))))
                (is (not (realized? sync-table-metadata-called?)))
                (is @sync-table-called?)
                (is (not (realized? sync-db-metadata-called?)))
                (is (not (realized? sync-db-called?)))))))))))

(deftest nonexistent-warehouse-table-sync-test
  (mt/test-driver :postgres
    (testing "When the warehouse table doesn't exist and you are trying to update or add it, return a 404"
      (let [db-name "nonexistent_warehouse_table_sync_test_table"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})]
        (drop-if-exists-and-create-db! db-name)
        (mt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname db-name)}]
          (let [spec     (sql-jdbc.conn/connection-details->spec :postgres details)
                exec!    (fn [spec statements] (doseq [statement statements] (jdbc/execute! spec [statement])))
                tableset #(set (map (fn [{:keys [schema name]}] (format "%s.%s" schema name)) (db/select 'Table :db_id (:id %))))
                post     (fn post-api
                           ([payload] (post-api payload 200))
                           ([payload expected-code]
                            (mt/with-temporary-setting-values [api-key "test-api-key"]
                              (mt/client-full-response
                               :post expected-code (format "notify/db/%d" (:id database))
                               {:request-options api-headers}
                               (merge {:synchronous? true}
                                      payload)))))
                sync!    #(sync/sync-database! database)]
            (exec! spec ["CREATE TABLE public.FOO (val bigint NOT NULL);"])
            (sync!)
            ;; After initial sync, there is only one table.
            (let [tables (tableset database)]
              (is (= #{"public.foo"} tables)))
            ;; We can invoke a scan on these because they exist
            (is (= 200 (:status (post {:scan :full :table_name "foo"}))))
            ;; We can't invoke a scan on something that doesn't exist at all
            (is (= 404 (:status (post {:scan :full :table_name "fern"} 404))))
            ;; We can't invoke a scan on something that doesn't exist at all
            (is (= 404 (:status (post {:scan :full :table_name "fern" :schema_name "public"} 404))))))))))

(deftest ambiguous-notifications-table-sync-test
  (mt/test-driver :postgres
    (testing "When two tables exist in metabase and you query by table name only, it will return a 400"
      (let [db-name "ambiguous_notifications_table_sync_test_table"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})]
        (drop-if-exists-and-create-db! db-name)
        (mt/with-temp Database [database {:engine :postgres, :details (assoc details :dbname db-name)}]
          (let [spec     (sql-jdbc.conn/connection-details->spec :postgres details)
                exec!    (fn [spec statements] (doseq [statement statements] (jdbc/execute! spec [statement])))
                tableset #(set (map (fn [{:keys [schema name]}] (format "%s.%s" schema name)) (db/select 'Table :db_id (:id %))))
                post     (fn post-api
                           ([payload] (post-api payload 200))
                           ([payload expected-code]
                            (mt/with-temporary-setting-values [api-key "test-api-key"]
                              (mt/client-full-response
                               :post expected-code (format "notify/db/%d" (:id database))
                               {:request-options api-headers}
                               (merge {:synchronous? true}
                                      payload)))))
                sync!    #(sync/sync-database! database)]
            (exec! spec ["CREATE TABLE public.FOO (val bigint NOT NULL);"
                         "CREATE TABLE public.BAR (val bigint NOT NULL);"])
            (sync!)
            ;; After initial sync, there are only two tables.
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar"} tables)))
            ;; We can invoke a scan on these because they exist
            (is (= 200 (:status (post {:scan :full :table_name "foo"}))))
            (exec! spec ["CREATE SCHEMA IF NOT EXISTS private;"
                         "CREATE TABLE private.FOO (val bigint NOT NULL);"
                         "CREATE TABLE private.BAR (val bigint NOT NULL);"])
            ;; This is still ok because we haven't added the private tables to mb yet.
            (is (= 200 (:status (post {:scan :full :table_name "foo"}))))
            ;; We now add the private.foo table
            (is (= 200 (:status (post {:scan :full :table_name "foo" :schema_name "private"}))))
            ;; Note that private.bar is still absent as we haven't synced it yet
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar" "private.foo"} tables)))
            ;; This is now ambiguous - you must specify the schema if multiple tables of the same name are in the db
            (is (= 400 (:status (post {:scan :full :table_name "foo"} 400))))
            ;; Now that two foos are present, we must specify a namespace for api calls.
            (is (= 200 (:status (post {:scan :full :table_name "foo" :schema_name "public"}))))))))))
