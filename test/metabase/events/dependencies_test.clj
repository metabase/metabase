(ns metabase.events.dependencies-test
  (:require [expectations :refer :all]
            [metabase.events.dependencies :refer :all]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.test.data :as data]
            [metabase.util :as u]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- temp-segment []
  {:definition {:database (data/id)
                :filter    [:= [:field-id (data/id :categories :id)] 1]}})

;; `:card-create` event
(tt/expect-with-temp [Segment [segment-1 (temp-segment)]
                      Segment [segment-2 (temp-segment)]]
  #{{:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-1)}
    {:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-2)}}
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :categories)
                                                       :filter       [:and
                                                                      [:=
                                                                       (data/id :categories :name)
                                                                       "Toucan-friendly"]
                                                                      [:segment (u/get-id segment-1)]
                                                                      [:segment (u/get-id segment-2)]]}}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id]
                :model "Card", :model_id (u/get-id card))))))

;; `:card-update` event
(expect
  []
  (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                            :type     :query
                                            :query    {:source-table (data/id :categories)}}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Card", :model_id (u/get-id card))))

;; `:metric-create` event
(tt/expect-with-temp [Segment [segment-1 (temp-segment)]
                      Segment [segment-2 (temp-segment)]]
  #{{:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-1)}
    {:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-2)}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:aggregation [[:count]]
                                                         :filter      [:and
                                                                       [:segment (u/get-id segment-1)]
                                                                       [:segment (u/get-id segment-2)]]}}]]
    (process-dependencies-event {:topic :metric-create
                                 :item  metric})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id]
                :model "Metric", :model_id (u/get-id metric))))))

;; `:card-update` event
(tt/expect-with-temp [Segment [segment-1 (temp-segment)]
                      Segment [segment-2 (temp-segment)]]
  #{{:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-1)}
    {:dependent_on_model "Segment"
     :dependent_on_id    (u/get-id segment-2)}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:aggregation ["count"]
                                                         :filter      ["AND"
                                                                       ["segment" (u/get-id segment-1)]
                                                                       ["segment" (u/get-id segment-2)]]}}]]
    (process-dependencies-event {:topic :metric-update
                                 :item  metric})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id]
                :model "Metric", :model_id (u/get-id metric))))))
