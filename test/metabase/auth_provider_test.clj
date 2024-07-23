(ns metabase.auth-provider-test
  (:require
    [cheshire.core :as json]
    [clojure.test :refer [deftest is testing]]
    [metabase.api.database :as api.database]
    [metabase.auth-provider :as auth-provider]
    [metabase.http-client :as client]
    [metabase.sync :as sync]
    [metabase.test :as mt]
    [metabase.test.data.interface :as tx]))

(defmethod auth-provider/fetch-auth ::test-me
  [_provider _db-id details]
  (is (= "testing" (:key details)))
  {:password "qux"})

(deftest ^:parallel simple-test
  (let [details {:username "test"
                 :password "ignored"
                 :auth-provider ::test-me
                 :key "testing"}]
    (mt/with-temp [:model/Database db {:details details}]
      (is (=? (assoc details :password "qux")
              (auth-provider/fetch-and-incorporate-auth-provider-details
               (:engine db)
               (:id db)
               (:details db)))))))

(deftest http-provider-tests
  (let [original-details (:details (mt/db))
        http-provider-details {:auth-provider "http"
                               :http-auth-url (client/build-url "/testing/echo"
                                                                {:body (json/encode original-details)})}]
    (is (= original-details (auth-provider/fetch-auth :http nil http-provider-details)))
    (is (= (merge http-provider-details original-details)
           (auth-provider/fetch-and-incorporate-auth-provider-details
            (tx/driver)
            http-provider-details)))))

(deftest oauth-provider-tests
  (let [oauth-provider-details {:auth-provider :oauth
                                :oauth-token-url (client/build-url "/testing/echo"
                                                                   {:body (json/encode {:access_token "foobar"})})}]
    (is (= {:access_token "foobar"} (auth-provider/fetch-auth :oauth nil oauth-provider-details)))
    (is (= (merge oauth-provider-details {:password "foobar"})
           (auth-provider/fetch-and-incorporate-auth-provider-details
            (tx/driver)
            oauth-provider-details)))))

(deftest auth-integration-test
  (mt/test-drivers #{:postgres :mysql}
    (let [original-details (:details (mt/db))
          auth-details {:auth-provider :http
                        :http-auth-url (client/build-url "/testing/echo"
                                                         {:body (json/encode original-details)})}]
      (mt/with-temp [:model/Database db
                     {:engine (tx/driver),
                      :details auth-details}]
        (mt/with-db
          db
          (is (= auth-details (:details (mt/db))))
          (testing "Connection tests"
            (is (nil? (api.database/test-database-connection (:engine db) (:details db)))))
          (testing "Syncing does not blow up"
            (sync/sync-database! (mt/db)))
          (testing "Querying"
            (is (= [["Polo Lounge"]]
                   (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]}))))))))))
