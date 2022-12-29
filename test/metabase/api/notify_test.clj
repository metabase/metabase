(ns metabase.api.notify-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.api.notify :as api.notify]
   [metabase.http-client :as client]
   [metabase.models.database :as database]
   [metabase.server.middleware.util :as mw.util]
   [metabase.sync]
   [metabase.sync.sync-metadata]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest unauthenticated-test
  (testing "POST /api/notify/db/:id"
    (testing "endpoint should require authentication"
      (is (= (get mw.util/response-forbidden :body)
             (client/client :post 403 "notify/db/100"))))))

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
          (with-redefs [metabase.sync/sync-table!                        (fn [_table] (deliver long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver short-sync-called? true))]
            (post {:scan :full, :table_name table-name})
            (is @long-sync-called?)
            (is (not (realized? short-sync-called?))))))
      (testing "only a quick sync when quick parameter is provided"
        (let [long-sync-called? (promise), short-sync-called? (promise)]
          (with-redefs [metabase.sync/sync-table!                        (fn [_table] (deliver long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (deliver short-sync-called? true))]
            (post {:scan :schema, :table_name table-name})
            (is (not (realized? long-sync-called?)))
            (is @short-sync-called?))))
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
