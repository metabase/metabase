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
        (testing "turning it into a model creates one"
          (t2/update! :model/Card :id (u/the-id card) {:type :model})
          (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card))))))))))

(deftest model-card-insert-is-persisted-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card     card {:database_id (u/the-id db) :type :model}]
        (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card)))))))))
