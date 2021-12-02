(ns metabase.query-processor.card-test
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Card Dashboard Database]]
            [metabase.models.query :as query]
            [metabase.public-settings :as public-settings]
            [metabase.query-processor.card :as qp.card]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest query-cache-ttl-hierarchy-test
  (mt/discard-setting-changes [enable-query-caching]
    (public-settings/enable-query-caching true)
    (testing "query-magic-ttl converts to seconds correctly"
      (mt/with-temporary-setting-values [query-caching-ttl-ratio 2]
        ;; fake average execution time (in millis)
        (with-redefs [query/average-execution-time-ms (constantly 4000)]
          (mt/with-temp Card [card]
            ;; the magic multiplier should be ttl-ratio times avg execution time
            (is (= (* 2 4) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))))
    (testing "card ttl only"
      (mt/with-temp* [Card [card {:cache_ttl 1337}]]
        (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {}))))))
    (testing "multiple ttl, dash wins"
      (mt/with-temp* [Database [db {:cache_ttl 1337}]
                      Dashboard [dash {:cache_ttl 1338}]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= (* 3600 1338) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
    (testing "multiple ttl, db wins"
      (mt/with-temp* [Database [db {:cache_ttl 1337}]
                      Dashboard [dash]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= (* 3600 1337) (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))
    (testing "no ttl, nil res"
      (mt/with-temp* [Database [db]
                      Dashboard [dash]
                      Card [card {:database_id (u/the-id db)}]]
        (is (= nil (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))))<
