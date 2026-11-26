(ns metabase.model-persistence.events.persisted-info-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.app-db.query :as mdb.query]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.queries.models.card :as card]
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
          (card/update-cards! [{:id (u/the-id card) :type :model}])
          (is (zero? (t2/count :model/PersistedInfo :card_id (u/the-id card)))))
        (testing "a user turning it into a model creates one"
          (card/update-cards! [{:id (u/the-id card) :type :question}])
          (mt/with-current-user (mt/user->id :crowberto)
            (card/update-cards! [{:id (u/the-id card) :type :model}]))
          (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id (u/the-id card))))))))))

(deftest model-card-insert-is-persisted-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}]
        (mt/with-model-cleanup [:model/Card]
          (let [card-id (mt/with-current-user (mt/user->id :crowberto)
                          (:id (first (card/create-cards! [(assoc (mt/with-temp-defaults :model/Card)
                                                                  :database_id (u/the-id db)
                                                                  :type        :model)]))))]
            (is (= "creating" (:state (t2/select-one :model/PersistedInfo :card_id card-id))))))))))

(deftest updating-model-does-not-persist-it-test
  (mt/with-premium-features #{}
    (mt/with-temporary-setting-values [persisted-models-enabled true]
      (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                     :model/Card     card {:database_id (u/the-id db) :type :model}]
        (mt/with-current-user (mt/user->id :crowberto)
          (card/update-cards! [{:id (u/the-id card) :name "Renamed model" :description "Edited"}]))
        (is (zero? (t2/count :model/PersistedInfo :card_id (u/the-id card))))))))

(deftest ^:synchronized model-cards-across-partitions-are-persisted-test
  (testing "an event with more model Cards than one batch persists every one of them"
    (mt/with-premium-features #{}
      (mt/with-temporary-setting-values [persisted-models-enabled true]
        (mt/with-temp [:model/Database db {:settings {:persist-models-enabled true}}
                       :model/Card     c1 {:database_id (u/the-id db)}
                       :model/Card     c2 {:database_id (u/the-id db)}
                       :model/Card     c3 {:database_id (u/the-id db)}
                       :model/Card     c4 {:database_id (u/the-id db)}
                       :model/Card     c5 {:database_id (u/the-id db)}]
          (mt/with-model-cleanup [:model/PersistedInfo]
            (let [card-ids (mapv u/the-id [c1 c2 c3 c4 c5])
                  batches  (atom 0)
                  turn-on! persisted-info/turn-on-models!]
              (with-redefs [mdb.query/create-partition-size 2
                            persisted-info/turn-on-models!  (fn [& args]
                                                              (swap! batches inc)
                                                              (apply turn-on! args))]
                (mt/with-current-user (mt/user->id :crowberto)
                  (card/update-cards! (vec (for [id card-ids] {:id id :type :model})))))
              (testing "the Cards are handled in batches of two"
                (is (= 3 @batches)))
              (is (= 5 (t2/count :model/PersistedInfo :card_id [:in card-ids]))))))))))
