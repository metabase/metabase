(ns metabase.model-persistence.events.persisted-info-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest model-card-is-persisted-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card     card {:database_id (u/the-id db)}]
        (testing "a question gets no PersistedInfo"
          (is (zero? (t2/count :model/PersistedInfo :card_id (u/the-id card)))))
        (testing "turning it into a model with no user creates none"
          (t2/update! :model/Card :id (u/the-id card) {:type :model})
          (is (zero? (t2/count :model/PersistedInfo :card_id (u/the-id card)))))
        (testing "a user turning it into a model creates one"
          (t2/update! :model/Card :id (u/the-id card) {:type :question})
          (mt/with-current-user (mt/user->id :crowberto)
            (t2/update! :model/Card :id (u/the-id card) {:type :model}))
          (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card))))))))))

(deftest model-card-insert-is-persisted-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}]
        (mt/with-model-cleanup [:model/Card]
          (let [card-id (mt/with-current-user (mt/user->id :crowberto)
                          (t2/insert-returning-pk! :model/Card (assoc (mt/with-temp-defaults :model/Card)
                                                                      :database_id (u/the-id db)
                                                                      :type        :model)))]
            (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id card-id))))))))))

(deftest updating-model-does-not-persist-it-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card     card {:database_id (u/the-id db) :type :model}]
        (mt/with-current-user (mt/user->id :crowberto)
          (t2/update! :model/Card :id (u/the-id card) {:name "Renamed model" :description "Edited"}))
        (is (zero? (t2/count :model/PersistedInfo :card_id (u/the-id card))))))))
