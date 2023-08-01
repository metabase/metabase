(ns metabase.events.persisted-info-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.events.persisted-info :as events.persisted-info]
   [metabase.models :refer [Card Database PersistedInfo]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest event-test
  (mt/with-temporary-setting-values [persisted-models-enabled true]
    (mt/with-temp* [Database [db {:options {:persist-models-enabled true}}]
                    Card     [card {:database_id (u/the-id db)}]]
      (events.persisted-info/process-event {:topic :card-create
                                            :item  card})
      (is (zero? (count (t2/select PersistedInfo :card_id (u/the-id card)))))

      (events.persisted-info/process-event {:topic :card-update
                                            :item (assoc card :dataset true)})
      (is (= "creating" (:state (t2/select-one PersistedInfo :card_id (u/the-id card))))))))
