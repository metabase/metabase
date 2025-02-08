(ns metabase.revisions.impl.legacy-metric-test
  (:require
   [clojure.test :refer :all]
   [metabase.revisions.models.revision :as revision]
   [metabase.test :as mt]))

(deftest ^:parallel serialize-metric-test
  (testing "serialize-metric"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id} {:db_id database-id}
                   :model/LegacyMetric   metric         {:table_id   table-id
                                                         :definition {:aggregation [[:count]]
                                                                      :filter      [:and [:> [:field 4 nil] "2014-10-19"]]}}]
      (is (=? {:id          true
               :table_id    true
               :entity_id   (:entity_id metric)
               :creator_id  (mt/user->id :rasta)
               :name        "Toucans in the rainforest"
               :description "Lookin' for a blueberry"
               :definition  {:aggregation [[:count]]
                             :filter      [:> [:field 4 nil] "2014-10-19"]}}
              (into {}
                    (-> (revision/serialize-instance :model/LegacyMetric (:id metric) metric)
                        (update :id boolean)
                        (update :table_id boolean))))))))

(deftest ^:parallel diff-metrics-test
  (testing "diff-metrics"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id} {:db_id database-id}
                   :model/LegacyMetric   metric         {:table_id   table-id
                                                         :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]
      (is (= {:definition  {:before {:filter [:> [:field 4 nil] "2014-10-19"]}
                            :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
              :description {:before "Lookin' for a blueberry"
                            :after  "BBB"}
              :name        {:before "Toucans in the rainforest"
                            :after  "Something else"}}
             (revision/diff-map :model/LegacyMetric metric (assoc metric
                                                                  :name        "Something else"
                                                                  :description "BBB"
                                                                  :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]})))))))

(deftest ^:parallel diff-metrics-test-2
  (testing "diff-metrics"
    (testing "test case where definition doesn't change"
      (is (= {:name {:before "A"
                     :after  "B"}}
             (revision/diff-map :model/LegacyMetric
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}
                                {:name        "B"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))))

(deftest ^:parallel diff-metrics-test-3
  (testing "diff-metrics"
    (testing "first version, so comparing against nil"
      (is (= {:name        {:after "A"}
              :description {:after "Unchanged"}
              :definition  {:after {:filter [:and [:> 4 "2014-10-19"]]}}}
             (revision/diff-map :model/LegacyMetric
                                nil
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))))

(deftest ^:parallel diff-metrics-test-4
  (testing "diff-metrics"
    (testing "removals only"
      (is (= {:definition {:before {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}
                           :after  {:filter [:and [:> 4 "2014-10-19"]]}}}
             (revision/diff-map :model/LegacyMetric
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}}
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))))
