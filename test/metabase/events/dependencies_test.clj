(ns metabase.events.dependencies-test
  (:require [clojure.test :refer :all]
            [metabase.events.dependencies :as deps]
            [metabase.models :refer [Card Database Dependency Metric Segment Table]]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

(defn- temp-segment []
  {:definition {:database (mt/id)
                :filter    [:= [:field-id (mt/id :categories :id)] 1]}})

(deftest card-create-test
  (testing "`:card-create` event"
    (mt/with-temp* [Segment [segment-1 (temp-segment)]
                    Segment [segment-2 (temp-segment)]
                    Card [card {:dataset_query {:database (mt/id)
                                                :type     :query
                                                :query    {:source-table (mt/id :categories)
                                                           :filter       [:and
                                                                          [:=
                                                                           (mt/id :categories :name)
                                                                           "Toucan-friendly"]
                                                                          [:segment (u/the-id segment-1)]
                                                                          [:segment (u/the-id segment-2)]]}}}]]
      (deps/process-dependencies-event {:topic :card-create
                                        :item  card})
      (is (= #{{:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-1)}
               {:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-2)}}
             (set (map (partial into {})
                       (db/select [Dependency :dependent_on_model :dependent_on_id]
                         :model "Card", :model_id (u/the-id card)))))))))

(deftest card-update-test
  (testing "`:card-update` event"
    (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                              :type     :query
                                              :query    {:source-table (mt/id :categories)}}}]
      (deps/process-dependencies-event {:topic :card-create
                                        :item  card})
      (is (= []
             (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Card", :model_id (u/the-id card)))))))

(deftest metric-create-test
  (testing "`:metric-create` event"
    (mt/with-temp* [Segment  [segment-1 (temp-segment)]
                    Segment  [segment-2 (temp-segment)]
                    Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [metric         {:table_id   table-id
                                              :definition {:aggregation [[:count]]
                                                           :filter      [:and
                                                                         [:segment (u/the-id segment-1)]
                                                                         [:segment (u/the-id segment-2)]]}}]]
      (deps/process-dependencies-event {:topic :metric-create
                                        :item  metric})
      (is (= #{{:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-1)}
               {:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-2)}}
             (set (map (partial into {})
                       (db/select [Dependency :dependent_on_model :dependent_on_id]
                         :model "Metric", :model_id (u/the-id metric)))))))))

(deftest metric-update-test
  (testing "`:metric-update` event"
    (mt/with-temp* [Segment  [segment-1 (temp-segment)]
                    Segment  [segment-2 (temp-segment)]
                    Database [{database-id :id}]
                    Table    [{table-id :id} {:db_id database-id}]
                    Metric   [metric         {:table_id   table-id
                                              :definition {:aggregation ["count"]
                                                           :filter      ["AND"
                                                                         ["segment" (u/the-id segment-1)]
                                                                         ["segment" (u/the-id segment-2)]]}}]]
      (deps/process-dependencies-event {:topic :metric-update
                                        :item  metric})
      (is (= #{{:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-1)}
               {:dependent_on_model "Segment"
                :dependent_on_id    (u/the-id segment-2)}}
             (set (map (partial into {})
                       (db/select [Dependency :dependent_on_model :dependent_on_id]
                         :model "Metric", :model_id (u/the-id metric)))))))))
