(ns metabase.models.legacy-metric-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.revision :as revision]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(def ^:private metric-defaults
  {:description             nil
   :how_is_this_calculated  nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :entity_id               true
   :definition              nil})

(deftest update-test
  (testing "Updating"
    (t2.with-temp/with-temp [:model/LegacyMetric {:keys [id]} {:creator_id (mt/user->id :rasta)
                                                               :table_id   (mt/id :checkins)}]
      (testing "you should not be able to change the creator_id of a Metric"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Metric"
             (t2/update! :model/LegacyMetric id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             Exception
             #"You cannot update the creator_id of a Metric"
             (t2/update! :model/LegacyMetric id {:creator_id nil}))))

      (testing "However calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= 1
               (t2/update! :model/LegacyMetric id {:creator_id (mt/user->id :rasta)})))))))

;; ## Metric Revisions

(deftest serialize-metric-test
  (testing "serialize-metric"
    (mt/with-temp [:model/Database {database-id :id} {}
                   :model/Table    {table-id :id} {:db_id database-id}
                   :model/LegacyMetric   metric         {:table_id   table-id
                                                         :definition {:aggregation [[:count]]
                                                                      :filter      [:and [:> [:field 4 nil] "2014-10-19"]]}}]
      (is (= (merge metric-defaults
                    {:id          true
                     :table_id    true
                     :entity_id   (:entity_id metric)
                     :creator_id  (mt/user->id :rasta)
                     :name        "Toucans in the rainforest"
                     :description "Lookin' for a blueberry"
                     :definition  {:aggregation [[:count]]
                                   :filter      [:> [:field 4 nil] "2014-10-19"]}})
             (into {}
                   (-> (revision/serialize-instance :model/LegacyMetric (:id metric) metric)
                       (update :id boolean)
                       (update :table_id boolean))))))))

(deftest diff-metrics-test
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
                                                                  :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]})))))

    (testing "test case where definition doesn't change"
      (is (= {:name {:before "A"
                     :after  "B"}}
             (revision/diff-map :model/LegacyMetric
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}
                                {:name        "B"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))

    (testing "first version, so comparing against nil"
      (is (= {:name        {:after "A"}
              :description {:after "Unchanged"}
              :definition  {:after {:filter [:and [:> 4 "2014-10-19"]]}}}
             (revision/diff-map :model/LegacyMetric
                                nil
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))

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
