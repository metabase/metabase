(ns metabase.usage-metadata.models-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.test-util :as events.tu]
   [metabase.test :as mt]
   [metabase.usage-metadata.models.source-dimension-daily :as source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily :as source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily :as source-metric-daily]
   [metabase.usage-metadata.models.source-segment-composite-daily :as source-segment-composite-daily]
   [metabase.usage-metadata.models.source-segment-daily :as source-segment-daily]))

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (let [bucket-date (t/local-date 2001 2 3)]
    (mt/with-model-cleanup [:model/SourceSegmentDaily :model/SourceSegmentCompositeDaily :model/SourceMetricDaily
                            :model/SourceDimensionDaily :model/SourceDimensionProfileDaily]
      (doseq [[create! row] [[source-segment-daily/create-segment-rollups!
                              {:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 10
                               :predicate "pred", :bucket_date bucket-date, :count 1}]
                             [source-segment-composite-daily/create-segment-composite-rollups!
                              {:source_type :table, :source_id 1, :ownership_mode :direct, :clause "clause"
                               :atom_fingerprints "fingerprints", :atom_count 2, :bucket_date bucket-date, :count 1}]
                             [source-metric-daily/create-metric-rollups!
                              {:source_type :card, :source_id 2, :ownership_mode :direct, :agg_type :count
                               :agg_field_id nil, :temporal_field_id nil, :temporal_unit nil
                               :bucket_date bucket-date, :count 3}]
                             [source-dimension-daily/create-dimension-rollups!
                              {:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 11
                               :temporal_unit :month, :binning nil, :bucket_date bucket-date, :count 4}]
                             [source-dimension-profile-daily/create-dimension-profile-rollups!
                              {:source_type :table, :source_id 1, :field_id 11, :source_basis :fingerprint
                               :observation_type :single-value, :observation_value nil
                               :bucket_date bucket-date, :count 4}]]]
        (testing (str create!)
          (let [counted (fn [n] (events.tu/statement-count! #(create! (vec (repeat n row)))))]
            (counted 1)
            (is (= (counted 2) (counted 6)))))))))
