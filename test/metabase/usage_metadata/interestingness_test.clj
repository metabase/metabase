(ns metabase.usage-metadata.interestingness-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [java-time.api :as t]
   [metabase.interestingness.core :as interestingness]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.usage-metadata.interestingness :as usage-metadata.interestingness]
   [metabase.usage-metadata.models.source-dimension-daily]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(def ^:private fingerprint
  "A middle-of-the-road categorical fingerprint so the baseline score sits well below 1.0,
   leaving room for the usage signal to move it."
  {:global {:distinct-count 15 :nil% 0.0}
   :type   {:type/Text {:average-length 8 :percent-blank 0.0}}})

(deftest rescore-dimension-interestingness!-test
  ;; `rescore-dimension-interestingness!`/`breakout-counts-by-field` query `source_dimension_daily`
  ;; instance-wide; the rollup row is a temp so it can't leak into other tests.
  (mt/with-temp [:model/Database            db    {}
                 :model/Table               table {:db_id (:id db)}
                 :model/Field               field {:table_id      (:id table)
                                                   :semantic_type :type/Category
                                                   :base_type     :type/Text
                                                   :fingerprint   fingerprint}
                 :model/SourceDimensionDaily _    {:source_type    :table
                                                   :source_id      (:id table)
                                                   :ownership_mode :direct
                                                   :field_id       (:id field)
                                                   :temporal_unit  nil
                                                   :binning        nil
                                                   :bucket_date    (t/local-date 2026 4 15)
                                                   :count          100000}]
    (let [baseline (interestingness/dimension-interestingness field)]
      (testing "a field broken out many times scores higher than its usage-less baseline"
        (is (= 1 (usage-metadata.interestingness/rescore-dimension-interestingness!)))
        (let [rescored (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))]
          (is (some? rescored))
          (is (> rescored baseline))))
      (testing "breakout-counts-by-field sums executions per field"
        (is (= {(:id field) 100000}
               (usage-metadata.interestingness/breakout-counts-by-field)))))))

(deftest rescore-resets-decayed-fields-test
  ;; A field boosted by breakout usage, then left idle until its last rollup row is pruned, must be
  ;; reset back to its usage-less score when passed in `pruned-field-ids` — even though it no longer
  ;; appears in the current counts. Otherwise the boost would freeze until the next re-fingerprint.
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db)}
                 :model/Field    field {:table_id      (:id table)
                                        :semantic_type :type/Category
                                        :base_type     :type/Text
                                        :fingerprint   fingerprint}]
    (let [usage-less (interestingness/dimension-interestingness field)]
      (testing "usage boosts the score while rollup rows exist"
        (mt/with-temp [:model/SourceDimensionDaily _ {:source_type    :table
                                                      :source_id      (:id table)
                                                      :ownership_mode :direct
                                                      :field_id       (:id field)
                                                      :temporal_unit  nil
                                                      :binning        nil
                                                      :bucket_date    (t/local-date 2026 4 15)
                                                      :count          100000}]
          (usage-metadata.interestingness/rescore-dimension-interestingness!)
          (is (> (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))
                 usage-less))))
      ;; the SourceDimensionDaily temp has rolled back here — i.e. the field's last rollup row is gone,
      ;; exactly as `delete-expired-rollups!` would leave it after a retention prune.
      (testing "a pruned field with no surviving usage is reset to its usage-less score"
        (is (= 1 (usage-metadata.interestingness/rescore-dimension-interestingness! #{(:id field)})))
        (is (= usage-less
               (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field))))))))

(deftest rescore-persists-all-fields-across-chunks-test
  ;; Several used fields with distinct counts, rescored with a partition size small enough to force
  ;; multiple chunked CASE-based updates — every field must still get its own correct score.
  (mt/with-temp [:model/Database db    {}
                 :model/Table    table {:db_id (:id db)}
                 :model/Field    f1    {:table_id (:id table) :semantic_type :type/Category
                                        :base_type :type/Text :fingerprint fingerprint}
                 :model/Field    f2    {:table_id (:id table) :semantic_type :type/Category
                                        :base_type :type/Text :fingerprint fingerprint}
                 :model/Field    f3    {:table_id (:id table) :semantic_type :type/Category
                                        :base_type :type/Text :fingerprint fingerprint}]
    (let [row             (fn [field cnt] {:source_type    :table
                                           :source_id      (:id table)
                                           :ownership_mode :direct
                                           :field_id       (:id field)
                                           :temporal_unit  nil
                                           :binning        nil
                                           :bucket_date    (t/local-date 2026 4 15)
                                           :count          cnt})
          expected-counts {(:id f1) 10
                           (:id f2) 1000
                           (:id f3) 100000}]
      (mt/with-temp [:model/SourceDimensionDaily _ (row f1 10)
                     :model/SourceDimensionDaily _ (row f2 1000)
                     :model/SourceDimensionDaily _ (row f3 100000)]
        ;; partition size 1 forces a separate CASE-based update per field
        (binding [usage-metadata.interestingness/*update-partition-size* 1]
          (usage-metadata.interestingness/rescore-dimension-interestingness!))
        (testing "each field persists the score computed from its own breakout count"
          (doseq [field [f1 f2 f3]]
            (let [n        (get expected-counts (:id field))
                  expected (interestingness/dimension-interestingness
                            (assoc field :usage {:breakout-count          n
                                                 :baseline-breakout-count (:baseline (usage-metadata.interestingness/breakout-usage))}))]
              (is (= expected
                     (t2/select-one-fn :dimension_interestingness :model/Field :id (:id field)))))))))))
