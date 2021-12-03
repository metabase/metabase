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
        (is (= nil (:cache-ttl (#'qp.card/query-for-card card {} {} {} {:dashboard-id (u/the-id dash)}))))))))

(defn- field-filter-query []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"date" {:id           "_DATE_"
                                      :name         "date"
                                      :display-name "Check-In Date"
                                      :type         :dimension
                                      :dimension    [:field (mt/id :checkins :date) nil]
                                      :widget-type  :date/all-options}}
              :query         "SELECT count(*)\nFROM CHECKINS\nWHERE {{date}}"}})

(defn- non-field-filter-query []
  {:database (mt/id)
   :type     :native
   :native   {:template-tags {"id"
                              {:id           "_ID_"
                               :name         "id"
                               :display-name "Order ID"
                               :type         :number
                               :required     true
                               :default      "1"}}
              :query         "SELECT *\nFROM ORDERS\nWHERE id = {{id}}"}})

(deftest card-template-tag-parameters-test
  (testing "Card with a Field filter parameter"
    (mt/with-temp Card [{card-id :id} {:dataset_query (field-filter-query)}]
      (is (= {"date" :date/all-options}
             (#'qp.card/card-template-tag-parameters card-id)))))
  (testing "Card with a non-Field-filter parameter"
    (mt/with-temp Card [{card-id :id} {:dataset_query (non-field-filter-query)}]
      (is (= {"id" :number}
             (#'qp.card/card-template-tag-parameters card-id)))))
  ;; TODO -- make sure it ignores native query snippets and source Card IDs
  )
