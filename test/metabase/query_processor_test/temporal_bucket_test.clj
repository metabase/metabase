(ns metabase.query-processor-test.temporal-bucket-test
  (:require
   [clojure.test :refer [are deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel temporal-unit-in-display-name-test
  (let [mp (lib.metadata.jvm/application-database-metadata-provider (mt/id))
        single-stage-query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                               (lib/aggregate (lib/count))
                               (lib/breakout (lib/with-temporal-bucket
                                               (lib.metadata/field mp (mt/id :orders :created_at))
                                               :quarter))
                               (lib/breakout (lib/with-temporal-bucket
                                               (lib.metadata/field mp (mt/id :orders :created_at))
                                               :day-of-week)))
        multi-stage-query (lib/append-stage single-stage-query)]
    (letfn [(cols-display-name-by-index [results index]
              (-> results mt/cols (nth index) :display_name))]
      (testing "Single stage query results contain bucketing in display names"
        (are [index expected-display-name] (= expected-display-name
                                              (cols-display-name-by-index
                                               (qp/process-query single-stage-query)
                                               index))
          0 "Created At: Quarter"
          1 "Created At: Day of week"))
      (testing "Columns bucketed on first stage have bucket in display name on following stage/s"
        (are [index expected-display-name] (= expected-display-name
                                              (cols-display-name-by-index
                                               (qp/process-query (-> single-stage-query (lib/append-stage)))
                                               index))
          0 "Created At: Quarter"
          1 "Created At: Day of week"))
      (testing "When column is bucketed on first stage and again on second by same unit, display name is untouched"
        (let [col (m/find-first (comp #{"Created At: Quarter"} :display-name)
                                (lib/breakoutable-columns multi-stage-query 1))]
          (is (= "Created At: Quarter"
                 (cols-display-name-by-index
                  (qp/process-query (lib/breakout multi-stage-query 1 (lib/with-temporal-bucket col :quarter)))
                  0)))))
      (testing "Second bucketing of a column on a next stage by different unit appends it into displa_name"
        (let [col (m/find-first (comp #{"Created At: Quarter"} :display-name)
                                (lib/breakoutable-columns multi-stage-query 1))]
          (is (= "Created At: Quarter: Year"
                 (cols-display-name-by-index
                  (qp/process-query (lib/breakout multi-stage-query 1 (lib/with-temporal-bucket col :year)))
                  0))))))))
