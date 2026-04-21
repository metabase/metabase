(ns metabase.usage-metadata.store-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.models.source-dimension-daily]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-metric-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.settings :as usage-metadata.settings]
   [metabase.usage-metadata.store :as usage-metadata.store]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest replace-day!-test
  (let [bucket-date (t/local-date 2026 4 15)
        payload-a   {:segments   [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 10, :predicate "pred-a", :bucket_date bucket-date, :count 2}
                                  {:source_type nil, :source_id nil, :ownership_mode :mixed, :field_id nil, :predicate "pred-mixed", :bucket_date bucket-date, :count 1}]
                     :metrics    [{:source_type :card, :source_id 2, :ownership_mode :direct, :agg_type :count, :agg_field_id nil, :temporal_field_id nil, :temporal_unit nil, :bucket_date bucket-date, :count 3}]
                     :dimensions [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 11, :temporal_unit :month, :binning nil, :bucket_date bucket-date, :count 4}]
                     :profiles   [{:source_type :table, :source_id 1, :field_id 11, :source_basis :fingerprint, :observation_type :single-value, :observation_value nil, :bucket_date bucket-date, :count 4}]}
        payload-b   {:segments   [{:source_type :table, :source_id 1, :ownership_mode :projected, :field_id 12, :predicate "pred-b", :bucket_date bucket-date, :count 5}]
                     :metrics    []
                     :dimensions []
                     :profiles   []}]
    (try
      (usage-metadata.store/delete-day! bucket-date)
      (usage-metadata.store/replace-day! bucket-date payload-a)
      (is (= 2 (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)))
      (is (= 1 (t2/count :model/SourceMetricDaily :bucket_date bucket-date)))
      (is (= 1 (t2/count :model/SourceDimensionDaily :bucket_date bucket-date)))
      (is (= 1 (t2/count :model/SourceDimensionProfileDaily :bucket_date bucket-date)))

      (usage-metadata.store/replace-day! bucket-date payload-b)
      (is (= 1 (t2/count :model/SourceSegmentDaily :bucket_date bucket-date)))
      (is (= 0 (t2/count :model/SourceMetricDaily :bucket_date bucket-date)))
      (is (= 0 (t2/count :model/SourceDimensionDaily :bucket_date bucket-date)))
      (is (= 0 (t2/count :model/SourceDimensionProfileDaily :bucket_date bucket-date)))
      (is (= {:source_type :table, :ownership_mode :projected, :field_id 12, :predicate "pred-b", :count 5}
             (select-keys (t2/select-one :model/SourceSegmentDaily :bucket_date bucket-date)
                          [:source_type :ownership_mode :field_id :predicate :count])))
      (finally
        (usage-metadata.store/delete-day! bucket-date)))))

(deftest replace-day!-does-not-affect-other-days-test
  (let [day-a (t/local-date 2026 4 15)
        day-b (t/local-date 2026 4 16)]
    (try
      (usage-metadata.store/delete-day! day-a)
      (usage-metadata.store/delete-day! day-b)
      (usage-metadata.store/replace-day! day-a {:segments   [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 10, :predicate "pred-a", :bucket_date day-a, :count 1}]
                                                :metrics    []
                                                :dimensions []
                                                :profiles   []})
      (usage-metadata.store/replace-day! day-b {:segments   [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 11, :predicate "pred-b", :bucket_date day-b, :count 1}]
                                                :metrics    []
                                                :dimensions []
                                                :profiles   []})
      (usage-metadata.store/replace-day! day-a {:segments   [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 12, :predicate "pred-c", :bucket_date day-a, :count 1}]
                                                :metrics    []
                                                :dimensions []
                                                :profiles   []})
      (is (= #{"pred-b"}
             (t2/select-fn-set :predicate :model/SourceSegmentDaily :bucket_date day-b)))
      (finally
        (usage-metadata.store/delete-day! day-a)
        (usage-metadata.store/delete-day! day-b)))))

(deftest replace-day!-transaction-rolls-back-on-failure-test
  (let [bucket-date (t/local-date 2026 4 15)
        original    {:segments   [{:source_type :table, :source_id 1, :ownership_mode :direct, :field_id 10, :predicate "pred-a", :bucket_date bucket-date, :count 2}]
                     :metrics    []
                     :dimensions []
                     :profiles   []}]
    (try
      (usage-metadata.store/delete-day! bucket-date)
      (usage-metadata.store/replace-day! bucket-date original)
      (with-redefs [usage-metadata.store/insert-segment-rollups! (fn [_] (throw (ex-info "boom" {})))]
        (is (thrown? clojure.lang.ExceptionInfo
                     (usage-metadata.store/replace-day! bucket-date original))))
      (is (= #{"pred-a"}
             (t2/select-fn-set :predicate :model/SourceSegmentDaily :bucket_date bucket-date)))
      (finally
        (usage-metadata.store/delete-day! bucket-date)))))

(deftest usage-metadata-settings-test
  (is (false? (usage-metadata.settings/usage-metadata-enabled?)))
  (is (= 90 (usage-metadata.settings/usage-metadata-retention-days)))
  (is (= "0 0 2 * * ? *" (usage-metadata.settings/usage-metadata-schedule)))
  (mt/with-temporary-setting-values [usage-metadata-last-completed-day "2026-04-14"]
    (is (= "2026-04-14"
           (usage-metadata.settings/usage-metadata-last-completed-day)))))
