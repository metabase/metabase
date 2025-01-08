(ns metabase.events.persisted-info-test
  (:require
   [clojure.test :refer [deftest is]]
   [metabase.events :as events]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest event-test
  (mt/with-temporary-setting-values [persisted-models-enabled true]
    (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                   :model/Card     card {:database_id (u/the-id db)}]
      (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)})
      (is (zero? (count (t2/select :model/PersistedInfo :card_id (u/the-id card)))))
      (events/publish-event! :event/card-create {:object (assoc card :type :model) :user-id (mt/user->id :rasta)})
      (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card))))))))
