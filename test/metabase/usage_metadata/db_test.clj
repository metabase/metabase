(ns metabase.usage-metadata.db-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.db :as usage-metadata.db]
   [metabase.usage-metadata.models.source-dimension-profile-daily]
   [metabase.usage-metadata.models.source-segment-daily]
   [metabase.usage-metadata.store :as usage-metadata.store]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(defn- segment-row [bucket-date source-id predicate]
  {:source_type :table, :source_id source-id, :ownership_mode :direct, :field_id 10,
   :predicate predicate, :bucket_date bucket-date, :count 1})

(defn- profile-row [bucket-date source-id]
  {:source_type :table, :source_id source-id, :field_id 11, :source_basis :fingerprint,
   :observation_type :single-value, :observation_value nil, :bucket_date bucket-date, :count 1})

(defn- do-with-clean-days! [days f]
  (try
    (run! usage-metadata.store/delete-day! days)
    (f)
    (finally
      (run! usage-metadata.store/delete-day! days))))

(deftest delete-rollups-by-bucket-date-test
  (testing "GHY-4588: the bound bucket date still selects the rows to delete"
    (let [day-1 (t/local-date 2026 3 1)
          day-2 (t/local-date 2026 3 2)
          day-3 (t/local-date 2026 3 3)]
      (do-with-clean-days!
       [day-1 day-2 day-3]
       (fn []
         (t2/insert! :model/SourceSegmentDaily [(segment-row day-1 1 "a")
                                                (segment-row day-2 1 "b")
                                                (segment-row day-3 1 "c")])
         (testing "for-day deletes only that day"
           (usage-metadata.db/delete-segment-rollups-for-day! day-2)
           (is (= #{"a" "c"}
                  (t2/select-fn-set :predicate :model/SourceSegmentDaily :bucket_date [:in [day-1 day-2 day-3]]))))
         (testing "before deletes only earlier days"
           (usage-metadata.db/delete-segment-rollups-before! day-3)
           (is (= #{"c"}
                  (t2/select-fn-set :predicate :model/SourceSegmentDaily :bucket_date [:in [day-1 day-2 day-3]])))))))))

(deftest grouped-rows-filter-by-source-and-bucket-range-test
  (testing "GHY-4588: the bound source id and bucket range still narrow the grouped rows"
    (let [day-1 (t/local-date 2026 3 11)
          day-2 (t/local-date 2026 3 12)
          day-3 (t/local-date 2026 3 13)]
      (do-with-clean-days!
       [day-1 day-2 day-3]
       (fn []
         (t2/insert! :model/SourceSegmentDaily [(segment-row day-1 424242 "p")
                                                (segment-row day-2 424242 "p")
                                                (segment-row day-3 424242 "p")
                                                (segment-row day-2 434343 "p")])
         (t2/insert! :model/SourceDimensionProfileDaily [(profile-row day-1 424242)
                                                         (profile-row day-2 424242)
                                                         (profile-row day-3 424242)
                                                         (profile-row day-2 434343)])
         (testing "segment rows"
           (is (=? [{:source_id 424242 :total_count #(== 2 %)}]
                   (usage-metadata.db/grouped-segment-rows :table 424242 day-2 day-3))))
         (testing "profile rows"
           (is (=? [{:source_id 424242 :total_count #(== 2 %)}]
                   (usage-metadata.db/grouped-profile-rows :table 424242 day-2 day-3)))))))))

(deftest unarchived-segments-by-table-test
  (testing "GHY-4588: the table id still narrows the Segments"
    (mt/with-temp [:model/Segment {in-table :id}    {:table_id (mt/id :venues)}
                   :model/Segment {other-table :id} {:table_id (mt/id :checkins)}]
      (let [ids (set (map :id (usage-metadata.db/unarchived-segments (mt/id :venues))))]
        (is (contains? ids in-table))
        (is (not (contains? ids other-table)))))))
