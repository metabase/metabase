(ns metabase.api.notify-test
  (:require [cheshire.core :as json]
            [clj-http.client :as client]
            [clojure.test :refer :all]
            [metabase.http-client :as http]
            [metabase.models.database :as database]
            [metabase.server.middleware.auth :as auth]
            [metabase.server.middleware.util :as middleware.u]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(deftest unauthenticated-test
  (testing "POST /api/notify/db/:id"
    (testing "endpoint should require authentication"
      (is (= (get middleware.u/response-forbidden :body)
             (http/client :post 403 "notify/db/100"))))))

(deftest not-found-test
  (testing "POST /api/notify/db/:id"
    (testing "database must exist or we get a 404"
      (is (= {:status 404
              :body   "Not found."}
             (try (client/post (http/build-url (format "notify/db/%d" Integer/MAX_VALUE) {})
                               {:accept  :json
                                :headers {"X-METABASE-APIKEY" (auth/api-key)
                                          "Content-Type"      "application/json"}})
                  (catch clojure.lang.ExceptionInfo e
                    (select-keys (:object (ex-data e)) [:status :body]))))))))

(deftest post-db-id-test
  (mt/test-drivers (mt/normal-drivers)
    (let [table-name (->> (mt/db) database/tables first :name)
          post       (fn [quick]
                       (mt/user-http-request :crowberto
                                             :post
                                             (format "notify/db/%d" (u/the-id (mt/db)))
                                             {:request-options
                                              {:headers {"X-METABASE-APIKEY" (auth/api-key)
                                                         "Content-Type"      "application/json"}}}
                                             {:quick quick, :table_name table-name}))]
      (testing "sync just table when table is provided"
        (let [long-sync-called? (atom false), short-sync-called? (atom false)]
          (with-redefs [metabase.sync/sync-table!                        (fn [_table] (reset! long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (reset! short-sync-called? true))]
            (is (= {:success true} (post false)))
            (is @long-sync-called?)
            (is (not @short-sync-called?)))))
      (testing "only a quick sync when quick parameter is provided"
        (let [long-sync-called? (atom false), short-sync-called? (atom false)]
          (with-redefs [metabase.sync/sync-table!                        (fn [_table] (reset! long-sync-called? true))
                        metabase.sync.sync-metadata/sync-table-metadata! (fn [_table] (reset! short-sync-called? true))]
            (is (= {:success true} (post true)))
            (is (not @long-sync-called?))
            (is @short-sync-called?)))))))

;; TODO - how can we validate the normal scenario given that it just kicks off a background job?
