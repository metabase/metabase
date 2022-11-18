(ns metabase.models.metric-test
  (:require [clojure.test :refer :all]
            [metabase.models.database :refer [Database]]
            [metabase.models.metric :as metric :refer [Metric]]
            [metabase.models.revision :as revision]
            [metabase.models.serialization.hash :as serdes.hash]
            [metabase.models.table :refer [Table]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import java.time.LocalDateTime))

(def ^:private metric-defaults
  {:description             nil
   :how_is_this_calculated  nil
   :show_in_getting_started false
   :caveats                 nil
   :points_of_interest      nil
   :archived                false
   :entity_id               true
   :definition              nil})

(defn- user-details
  [username]
  (dissoc (mt/fetch-user username) :date_joined :last_login))

(deftest retrieve-metrics-test
  (mt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id-1 :id} {:db_id database-id}]
                  Table    [{table-id-2 :id} {:db_id database-id}]
                  Metric   [segment-1        {:table_id table-id-1, :name "Metric 1", :description nil}]
                  Metric   [_                {:table_id table-id-2}]
                  Metric   [_                {:table_id table-id-1, :archived true}]]
    (is (= [(merge
             metric-defaults
             {:creator_id (mt/user->id :rasta)
              :creator    (user-details :rasta)
              :entity_id  (:entity_id segment-1)
              :name       "Metric 1"})]
           (for [metric (u/prog1 (metric/retrieve-metrics table-id-1)
                                 (assert (= 1 (count <>))))]
             (update (dissoc (into {} metric) :id :table_id :created_at :updated_at)
                     :creator dissoc :date_joined :last_login))))))


(deftest update-test
  (testing "Updating"
    (mt/with-temp Metric [{:keys [id]} {:creator_id (mt/user->id :rasta)}]
      (testing "you should not be able to change the creator_id of a Metric"
        (is (thrown-with-msg?
             UnsupportedOperationException
             #"You cannot update the creator_id of a Metric"
             (db/update! Metric id {:creator_id (mt/user->id :crowberto)}))))

      (testing "you shouldn't be able to set it to `nil` either"
        (is (thrown-with-msg?
             UnsupportedOperationException
             #"You cannot update the creator_id of a Metric"
             (db/update! Metric id {:creator_id nil}))))

      (testing "However calling `update!` with a value that is the same as the current value shouldn't throw an Exception"
        (is (= true
               (db/update! Metric id {:creator_id (mt/user->id :rasta)})))))))


;; ## Metric Revisions

(deftest serialize-metric-test
  (testing "serialize-metric"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [metric         {:table_id   table-id
                                              :definition {:aggregation [[:count]]
                                                           :filter      [:and [:> [:field 4 nil] "2014-10-19"]]}}]]
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
                   (-> (revision/serialize-instance Metric (:id metric) metric)
                       (update :id boolean)
                       (update :table_id boolean))))))))

(deftest diff-metrics-test
  (testing "diff-metrics"
    (mt/with-temp* [Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [metric         {:table_id   table-id
                                              :definition {:filter [:and [:> [:field 4 nil] "2014-10-19"]]}}]]
      (is (= {:definition  {:before {:filter [:> [:field 4 nil] "2014-10-19"]}
                            :after  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]}}
              :description {:before "Lookin' for a blueberry"
                            :after  "BBB"}
              :name        {:before "Toucans in the rainforest"
                            :after  "Something else"}}
             (revision/diff-map Metric metric (assoc metric
                                                     :name        "Something else"
                                                     :description "BBB"
                                                     :definition  {:filter [:between [:field 4 nil] "2014-07-01" "2014-10-19"]})))))

    (testing "test case where definition doesn't change"
      (is (= {:name {:before "A"
                     :after  "B"}}
             (revision/diff-map Metric
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
             (revision/diff-map Metric
                                nil
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))

    (testing "removals only"
      (is (= {:definition {:before {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}
                           :after  {:filter [:and [:> 4 "2014-10-19"]]}}}
             (revision/diff-map Metric
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"] [:= 5 "yes"]]}}
                                {:name        "A"
                                 :description "Unchanged"
                                 :definition  {:filter [:and [:> 4 "2014-10-19"]]}}))))))

(deftest identity-hash-test
  (testing "Metric hashes are composed of the metric name and table identity-hash"
    (let [now (LocalDateTime/of 2022 9 1 12 34 56)]
      (mt/with-temp* [Database [db    {:name "field-db" :engine :h2}]
                      Table    [table {:schema "PUBLIC" :name "widget" :db_id (:id db)}]
                      Metric   [metric {:name "measurement" :table_id (:id table) :created_at now}]]
        (is (= "a2318866"
               (serdes.hash/raw-hash ["measurement" (serdes.hash/identity-hash table) now])
               (serdes.hash/identity-hash metric)))))))
