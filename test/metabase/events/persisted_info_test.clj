(ns metabase.events.persisted-info-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.events :as events]
   [metabase.models :refer [Card Database PersistedInfo]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest event-test
  (mt/with-temporary-setting-values [persisted-models-enabled true]
    (t2.with-temp/with-temp [Database db   {:settings {:persist-models-enabled true}}
                             Card     card {:database_id (u/the-id db)}]
      (events/publish-event! :event/card-create card)
      (is (zero? (t2/count PersistedInfo :card_id (u/the-id card))))
      (events/publish-event! :event/card-update (assoc card :dataset true))
      (is (= "creating" (:state (t2/select-one PersistedInfo :card_id (u/the-id card))))))))
