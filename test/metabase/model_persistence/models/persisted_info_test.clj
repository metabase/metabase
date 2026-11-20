(ns metabase.model-persistence.models.persisted-info-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest state-derives-active-and-refresh-end-test
  (mt/with-temp [:model/Database db {}
                 :model/Card     model {:database_id (u/the-id db) :type :model}
                 :model/PersistedInfo info {:database_id (u/the-id db) :card_id (u/the-id model)}]
    (let [id    (u/the-id info)
          fetch #(t2/select-one :model/PersistedInfo :id id)]
      (t2/update! :model/PersistedInfo :id id {:state "creating"})
      (testing "persisted is active and ends the refresh"
        (t2/update! :model/PersistedInfo :id id {:state "persisted"})
        (is (true? (:active (fetch))))
        (is (some? (:refresh_end (fetch)))))
      (testing "refreshing is inactive and has no end"
        (t2/update! :model/PersistedInfo :id id {:state "refreshing"})
        (is (false? (:active (fetch))))
        (is (nil? (:refresh_end (fetch)))))
      (testing "every other state is inactive"
        (t2/update! :model/PersistedInfo :id id {:state "persisted"})
        (t2/update! :model/PersistedInfo :id id {:state "deletable"})
        (is (false? (:active (fetch))))))))
