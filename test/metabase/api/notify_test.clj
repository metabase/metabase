(ns metabase.api.notify-test
  (:require
   [clj-http.client :as http]
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [metabase.driver.postgres-test :as postgres-test]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.http-client :as client]
   [metabase.models.database :as database :refer [Database]]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.server.request.util :as req.util]
   [metabase.sync :as sync]
   [metabase.sync.sync-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest authentication-test
  (testing "POST /api/notify/db/:id"
    (testing "endpoint requires MB_API_KEY set"
      (mt/with-temporary-setting-values [api-key nil]
        (is (= (-> mw.auth/key-not-set-response :body str)
               (client/client :post 403 "notify/db/100")))))
    (testing "endpoint requires authentication"
      (mt/with-temporary-setting-values [api-key "test-api-key"] ;; set in :test but not in :dev
        (is (= (get req.util/response-forbidden :body)
               (client/client :post 403 "notify/db/100")))))))

(def ^:private api-headers {:headers {"x-metabase-apikey" "test-api-key"
                                      "content-type"      "application/json"}})

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
        (is (= {:status 404
                :body   "Not found."}
               (try (http/post (client/build-url (format "notify/db/%d" (:id (mt/db))) {})
                               (merge {:accept       :json
                                       :content-type :json
                                       :form-params  {:table_name "IncorrectToucanFact"}}
                                      api-headers))
                    (catch clojure.lang.ExceptionInfo e
                      (select-keys (ex-data e) [:status :body])))))))))

(deftest post-db-id-test
  (mt/test-drivers (mt/normal-drivers)
    (let [table-name (->> (mt/db) database/tables first :name)
          post       (fn post-api
                       ([payload] (post-api payload 200))
                       ([payload expected-code]
                        (mt/with-temporary-setting-values [api-key "test-api-key"]
                          (mt/client :post expected-code (format "notify/db/%d" (u/the-id (mt/db)))
                                          {:request-options api-headers}
                                          (merge {:synchronous? true}
                                                 payload)))))]
      (testing "sync just table when table is provided"
        (let [long-sync-called? (promise), short-sync-called? (promise)]
          (with-redefs [sync/sync-table!                                 (fn [_table] (deliver long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver short-sync-called? true))]
            (post {:scan :full, :table_name table-name})
            (is @long-sync-called?)
            (is (not (realized? short-sync-called?))))))
      (testing "only a quick sync when quick parameter is provided"
        (let [long-sync-called? (promise), short-sync-called? (promise)]
          (with-redefs [sync/sync-table!                                 (fn [_table] (deliver long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver short-sync-called? true))]
            (post {:scan :schema, :table_name table-name})
            (is (not (realized? long-sync-called?)))
            (is @short-sync-called?))))
      (testing "full db sync by default"
        (let [full-sync? (promise)]
          (with-redefs [sync/sync-database! (fn [_db] (deliver full-sync? true))]
            (post {})
            (is @full-sync?))))
      (testing "simple sync with params"
        (let [full-sync?   (promise)
              smaller-sync (promise)]
          (with-redefs [sync/sync-database!                           (fn [_db] (deliver full-sync? true))
                        metabase.sync.sync-metadata/sync-db-metadata! (fn [_db] (deliver smaller-sync true))]
            (post {:scan :schema})
            (is (not (realized? full-sync?)))
            (is @smaller-sync))))
      (testing "errors on unrecognized scan options"
        (is (= {:scan "nullable enum of full, schema"}
               (:errors (post {:scan :unrecognized} 400))))))))

(deftest add-new-table-sync-test
  (mt/test-driver :postgres
    (testing "Ensure we have the ability to add a single new table"
      (let [db-name "add_new_table_sync_test_table"
            details (mt/dbdef->connection-details :postgres :db {:database-name db-name})]
        (postgres-test/drop-if-exists-and-create-db! db-name)
        (mt/with-temp [Database database {:engine :postgres :details (assoc details :dbname db-name)}]
          (let [spec     (sql-jdbc.conn/connection-details->spec :postgres details)
                exec!    (fn [spec statements] (doseq [statement statements] (jdbc/execute! spec [statement])))
                tableset #(set (map (fn [{:keys [schema name]}] (format "%s.%s" schema name)) (t2/select 'Table :db_id (:id %))))
                post     (fn post-api
                           ([payload] (post-api payload 200))
                           ([payload expected-code]
                            (mt/with-temporary-setting-values [api-key "test-api-key"]
                              (mt/client-full-response
                               :post expected-code (format "notify/db/%d/new-table" (:id database))
                               {:request-options api-headers}
                               (merge {:synchronous? true}
                                      payload)))))
                sync!    #(sync/sync-database! database)]
            ;; Create the initial table and sync it.
            (exec! spec ["CREATE TABLE public.FOO (val bigint NOT NULL);"])
            (sync!)
            (let [tables (tableset database)]
              (is (= #{"public.foo"} tables)))
            ;; We can't add an existing table
            (is (= 400 (:status (post {:schema_name "public" :table_name "foo"} 400))))
            ;; We can't add a nonexistent table
            (is (= 404 (:status (post {:schema_name "public" :table_name "bar"} 404))))
            ;; Create two more tables that are not yet synced
            (exec! spec ["CREATE TABLE public.BAR (val bigint NOT NULL);"
                         "CREATE TABLE public.FERN (val bigint NOT NULL);"])
            ;; This will add bar to metabase (but not fern).
            (is (= 200 (:status (post {:schema_name "public" :table_name "bar"}))))
            ;; Assert that only the synced tables are present.
            (let [tables (tableset database)]
              (is (= #{"public.foo" "public.bar"} tables))
              (is (false? (contains? tables "public.fern"))))))))))
