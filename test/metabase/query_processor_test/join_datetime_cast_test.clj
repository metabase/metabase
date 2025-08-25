(ns metabase.query-processor-test.join-datetime-cast-test
  "Tests for joins with columns cast to datetime (issue #62099)"
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest join-datetime-cast-test
  (testing "Joining columns that are cast to Datetime should work (#62099)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :expressions/datetime)
      (let [mp (mt/metadata-provider)]
        (testing "Join two tables on datetime cast fields"
          (let [query (mt/mbql-query orders
                        {:joins [{:source-table $$checkins
                                  :alias "c"
                                  :condition [:=
                                              [:datetime $created_at]
                                              [:datetime &c.checkins.date]]
                                  :fields :all}]
                         :limit 5})]
            (mt/with-native-query-testing-context query
              (is (some? (qp/process-query query))
                  "Query with datetime cast join should not fail"))))
        
        (testing "Join with datetime expression in MLv2"
          (let [query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :checkins))
                                                         [(lib/=
                                                           (lib/datetime (lib.metadata/field mp (mt/id :orders :created_at)))
                                                           (lib/datetime (lib.metadata/field mp (mt/id :checkins :date))))])
                                        (lib/with-join-alias "c")
                                        (lib/with-join-fields :all)))
                          (lib/limit 5))]
            (mt/with-native-query-testing-context query
              (is (some? (qp/process-query query))
                  "MLv2 query with datetime cast join should not fail"))))))))

(deftest join-with-field-casting-test
  (testing "Join condition with field casting should be properly resolved"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :expressions/datetime)
      (let [mp (mt/metadata-provider)]
        (testing "Join on cast field should preserve field metadata"
          (let [orders-created-at (lib.metadata/field mp (mt/id :orders :created_at))
                checkins-date (lib.metadata/field mp (mt/id :checkins :date))
                query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                          (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :checkins))
                                                         [(lib/=
                                                           (lib/datetime orders-created-at)
                                                           (lib/datetime checkins-date))])
                                        (lib/with-join-alias "c")))
                          (lib/limit 1))]
            (mt/with-native-query-testing-context query
              (let [result (qp/process-query query)]
                (is (some? result)
                    "Query should execute successfully")
                (is (not (empty? (:data result)))
                    "Query should return data")))))))))