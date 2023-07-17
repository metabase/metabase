(ns metabase-enterprise.advanced-config.caching-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card Dashboard Database]]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features-test
    :as premium-features-test]
   [metabase.query-processor.card :as qp.card]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest query-cache-ttl-hierarchy-test
  (premium-features-test/with-premium-features #{:advanced-config}
    (mt/discard-setting-changes [enable-query-caching]
      (public-settings/enable-query-caching! true)
      ;; corresponding OSS tests in metabase.query-processor.card-test
      (testing "database TTL takes effect when no dashboard or card TTLs are set"
        (mt/with-temp* [Database [db {:cache_ttl 1337}]
                        Dashboard [dash]
                        Card [card {:database_id (u/the-id db)}]]
          (is (= (* 3600 1337)
                 (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "card ttl only"
        (mt/with-temp* [Card [card {:cache_ttl 1337}]]
          (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))
      (testing "multiple ttl, card wins if dash and database TTLs are set"
        (mt/with-temp* [Database [db {:cache_ttl 1337}]
                        Dashboard [dash {:cache_ttl 1338}]
                        Card [card {:database_id (u/the-id db), :cache_ttl 1339}]]
          (is (= (* 3600 1339) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
      (testing "multiple ttl, dash wins when no card TTLs are set"
        (mt/with-temp* [Database [db {:cache_ttl 1337}]
                        Dashboard [dash {:cache_ttl 1338}]
                        Card [card {:database_id (u/the-id db)}]]
          (is (= (* 3600 1338) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)})))))))))
