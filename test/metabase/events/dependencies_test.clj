(ns metabase.events.dependencies-test
  (:require [expectations :refer :all]
            [metabase.events.dependencies :refer :all]
            [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [metric :refer [Metric]]
             [table :refer [Table]]]
            [metabase.test.data :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

;; `:card-create` event
(expect
  #{{:dependent_on_model "Segment"
     :dependent_on_id    2}
    {:dependent_on_model "Segment"
     :dependent_on_id    3}}
  (tt/with-temp Card [card {:dataset_query {:database (id)
                                            :type     :query
                                            :query    {:source_table (id :categories)
                                                       :filter       ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Card", :model_id (:id card))))))

;; `:card-update` event
(expect
  []
  (tt/with-temp Card [card {:dataset_query {:database (id)
                                            :type     :query
                                            :query    {:source_table (id :categories)}}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Card", :model_id (:id card))))

;; `:metric-create` event
(expect
  #{{:dependent_on_model "Segment"
     :dependent_on_id    18}
    {:dependent_on_model "Segment"
     :dependent_on_id    35}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:aggregation ["count"]
                                                         :filter      ["AND" ["SEGMENT" 18] ["SEGMENT" 35]]}}]]
    (process-dependencies-event {:topic :metric-create
                                 :item  metric})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Metric", :model_id (:id metric))))))

;; `:card-update` event
(expect
  #{{:dependent_on_model "Segment"
     :dependent_on_id    18}
    {:dependent_on_model "Segment"
     :dependent_on_id    35}}
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id} {:db_id database-id}]
                  Metric   [metric         {:table_id   table-id
                                            :definition {:aggregation ["count"]
                                                         :filter      ["AND" ["SEGMENT" 18] ["SEGMENT" 35]]}}]]
    (process-dependencies-event {:topic :metric-update
                                 :item  metric})
    (set (map (partial into {})
              (db/select [Dependency :dependent_on_model :dependent_on_id], :model "Metric", :model_id (:id metric))))))
