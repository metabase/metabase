(ns metabase.auth-provider-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.api.database :as api.database]
   [metabase.auth-provider :as auth-provider]
   [metabase.http-client :as client]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.util.json :as json]))

(deftest auth-integration-test
  (mt/test-drivers #{:postgres :mysql}
    (let [original-details (:details (mt/db))
          auth-details {:use-auth-provider true
                        :host "255.255.255.255"
                        :auth-provider :http
                        :http-auth-url (client/build-url "/testing/echo"
                                                         {:body (json/encode original-details)})}]
      (mt/with-temp [:model/Database db
                     {:engine (tx/driver),
                      :details auth-details}]
        (mt/with-db
          db
          (is (auth-details original-details (:details (mt/db))))
          (testing "Connection tests"
            (is (some? (api.database/test-database-connection (:engine db) (:details db)))))
          (testing "With feature"
            (mt/with-premium-features #{:database-auth-providers}
              (testing "Connection tests"
                (is (nil? (api.database/test-database-connection (:engine db) (:details db)))))
              (testing "Syncing does not blow up"
                (sync/sync-database! (mt/db)))
              (testing "Querying"
                (is (= [["Polo Lounge"]]
                       (mt/rows (mt/run-mbql-query venues {:filter [:= $id 60] :fields [$name]}))))))))))))

(deftest fetch-auth-test
  (mt/test-drivers #{:postgres :mysql}
    (let [original-details (:details (mt/db))
          auth-details {:use-auth-provider true
                        :auth-provider :http
                        :http-auth-url (client/build-url "/testing/echo"
                                                         {:body (json/encode original-details)})}]
      (testing "Without feature"
        (is (= {} (auth-provider/fetch-auth :http (mt/id) auth-details))))
      (testing "With feature"
        (mt/with-premium-features #{:database-auth-providers}
          (is (= original-details (auth-provider/fetch-auth :http (mt/id) auth-details))))))))
