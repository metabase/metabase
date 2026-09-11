(ns metabase.query-permissions.goal-reference-test
  "A dynamic goal reference selects a query the server will run, just as `:dataset_query` does, so saving one is
  gated the same way. Without this an editor can point a goal at an entity they cannot read and have a public or
  embedded page resolve it for them under its root-permissions binding."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]))

(defn- goal-viz
  "Viz settings whose goal reads `card-id`'s count."
  [card-id]
  {:graph.goal_value {:id card-id :type "card" :column "count"}})

(defn- with-unreadable-goal-card
  "Call `f` with the id of a card in a collection the All Users group cannot read."
  [f]
  (mt/with-temp [:model/Collection {secret-id :id} {}
                 :model/Card       {goal-id :id} {:collection_id secret-id
                                                  :dataset_query (mt/mbql-query venues
                                                                   {:aggregation [[:count]]})}]
    (perms/revoke-collection-permissions! (perms/all-users-group) secret-id)
    (f goal-id)))

(deftest cannot-create-a-card-referencing-an-unreadable-goal-test
  (testing "saving a goal that reads a card you cannot read is refused"
    (with-unreadable-goal-card
      (fn [goal-id]
        (mt/user-http-request :rasta :post 403 "card"
                              {:name                   "Chart"
                               :type                   :question
                               :display                :line
                               :dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                               :visualization_settings (goal-viz goal-id)})))))

(deftest can-create-a-card-referencing-a-readable-goal-test
  (testing "the ordinary case still saves"
    (mt/with-temp [:model/Card {goal-id :id} {:dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
      (mt/user-http-request :rasta :post 200 "card"
                            {:name                   "Chart"
                             :type                   :question
                             :display                :line
                             :dataset_query          (mt/mbql-query venues {:aggregation [[:count]]})
                             :visualization_settings (goal-viz goal-id)}))))

(deftest cannot-update-a-card-to-reference-an-unreadable-goal-test
  (testing "the update path is gated too, not just create"
    (with-unreadable-goal-card
      (fn [goal-id]
        (mt/with-temp [:model/Card {card-id :id} {:dataset_query (mt/mbql-query venues
                                                                   {:aggregation [[:count]]})}]
          (mt/user-http-request :rasta :put 403 (format "card/%d" card-id)
                                {:visualization_settings (goal-viz goal-id)}))))))

(deftest cannot-put-an-unreadable-goal-on-a-dashcard-test
  (testing "dashcard viz settings are merged over the card's, so they need the same gate"
    (with-unreadable-goal-card
      (fn [goal-id]
        (mt/with-temp [:model/Card      {card-id :id} {:dataset_query (mt/mbql-query venues
                                                                        {:aggregation [[:count]]})}
                       :model/Dashboard {dash-id :id} {}]
          (mt/user-http-request :rasta :put 403 (format "dashboard/%d" dash-id)
                                {:dashcards [{:id                     -1
                                              :card_id                card-id
                                              :row                    0
                                              :col                    0
                                              :size_x                 4
                                              :size_y                 4
                                              :visualization_settings (goal-viz goal-id)}]
                                 :tabs      []}))))))
