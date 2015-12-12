(ns metabase.events.dependencies-test
  (:require [expectations :refer :all]
            [metabase.db :as db]
            [metabase.events.dependencies :refer :all]
            (metabase.models [card :refer [Card]]
                             [dependency :refer [Dependency]])
            [metabase.test.data :refer :all]
            [metabase.test.data.users :refer :all]
            [metabase.test.util :as tu]
            [metabase.test-setup :refer :all]))


;; `:card-create` event
(expect
  #{{:dependent_on_model "Segment"
     :dependent_on_id    2}
    {:dependent_on_model "Segment"
     :dependent_on_id    3}}
  (tu/with-temp Card [card {:name                   "Simple Test"
                            :creator_id             (user->id :rasta)
                            :public_perms           2
                            :display                "table"
                            :dataset_query          {:database (id)
                                                     :type     :query
                                                     :query    {:source_table (id :categories)
                                                                :filter       ["AND" [">" 4 "2014-10-19"] ["=" 5 "yes"] ["SEGMENT" 2] ["SEGMENT" 3]]}}
                            :visualization_settings {}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (->> (db/sel :many Dependency :model "Card" :model_id (:id card))
         (mapv #(select-keys % [:dependent_on_model :dependent_on_id]))
         set)))

;; `:card-update` event
(expect
  []
  (tu/with-temp Card [card {:name                   "Simple Test"
                            :creator_id             (user->id :rasta)
                            :public_perms           2
                            :display                "table"
                            :dataset_query          {:database (id)
                                                     :type     :query
                                                     :query    {:source_table (id :categories)}}
                            :visualization_settings {}}]
    (process-dependencies-event {:topic :card-create
                                 :item  card})
    (->> (db/sel :many Dependency :model "Card" :model_id (:id card))
         (mapv #(select-keys % [:dependent_on_model :dependent_on_id])))))
