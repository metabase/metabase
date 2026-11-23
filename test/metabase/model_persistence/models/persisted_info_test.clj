(ns metabase.model-persistence.models.persisted-info-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.test-util :as events.tu]
   [metabase.model-persistence.models.persisted-info :as persisted-info]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private per-row-update-cost
  "The statements a state change runs for each PersistedInfo, which Toucan writes one by one: the SELECT of the
  before-update hook and the UPDATE."
  2)

(deftest write-function-statement-counts-do-not-grow-with-rows-test
  (mt/with-temp [:model/Database {db-id :id} {}
                 :model/Card     {c1 :id} {:database_id db-id :type :model}
                 :model/Card     {c2 :id} {:database_id db-id :type :model}
                 :model/Card     {c3 :id} {:database_id db-id :type :model}
                 :model/Card     {c4 :id} {:database_id db-id :type :model}
                 :model/Card     {c5 :id} {:database_id db-id :type :model}
                 :model/Card     {c6 :id} {:database_id db-id :type :model}
                 :model/Card     _ {:database_id db-id :type :model}]
    (let [card-ids [c1 c2 c3 c4 c5 c6]
          states   [["persisted" true] ["error" false]]
          counted  (fn [n write!]
                     (mt/with-model-cleanup [:model/PersistedInfo]
                       (let [ids (vec (t2/insert-returning-pks!
                                       :model/PersistedInfo
                                       (for [[card-id [state active]] (map vector (take n card-ids) (cycle states))]
                                         {:card_id card-id :database_id db-id :question_slug "slug"
                                          :table_name (str "model_" card-id "_slug") :active active :state state})))]
                         (events.tu/statement-count! #(write! (take n card-ids) ids)))))]
      (doseq [[label write!] {"marking a Database for pruning" (fn [_ _] (persisted-info/mark-persisted-infos-for-pruning-for-databases! [db-id]))
                              "marking by id"                  (fn [_ ids] (persisted-info/mark-persisted-infos-for-pruning! ids "off"))
                              "invalidating"                   (fn [cards _] (persisted-info/invalidate! cards))
                              "deleting"                       (fn [_ ids] (persisted-info/delete-persisted-infos! ids))
                              "readying a Database"            (fn [_ _] (persisted-info/ready-database! db-id))}]
        (testing label
          (counted 1 write!)
          (if (= "deleting" label)
            (is (= (counted 2 write!) (counted 6 write!)))
            (is (<= (- (counted 6 write!) (counted 2 write!)) (* 4 per-row-update-cost))))))
      (testing "turning on models"
        (let [turn-on! (fn [n]
                         (mt/with-model-cleanup [:model/PersistedInfo]
                           (let [cards (t2/select :model/Card :id [:in (take n card-ids)])]
                             (events.tu/statement-count! #(persisted-info/turn-on-models! nil cards)))))]
          (turn-on! 1)
          (is (= (turn-on! 2) (turn-on! 6))))))))
