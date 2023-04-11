(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.view-log :as view-log]
   [metabase.models :refer [Card Dashboard Table User ViewLog]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(deftest card-create-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :card-create
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest card-read-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]

    (view-log/handle-view-event! {:topic :card-read
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest card-query-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]

    (view-log/handle-view-event! {:topic :card-query
                                  :item  (assoc card :cached false :ignore_cache true)})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)
            :metadata {:cached false :ignore_cache true}}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id :metadata], :user_id (:id user)))))))

(deftest table-read-test
  (mt/with-temp* [User  [user]
                  Table [table]]

    (view-log/handle-view-event! {:topic :table-read
                                  :item  (assoc table :actor_id (:id user))})
    (is (= {:user_id  (:id user)
            :model    "table"
            :model_id (:id table)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest dashboard-read-test
  (mt/with-temp* [User      [user]
                  Dashboard [dashboard {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :dashboard-read
                                  :item  dashboard})
    (is (= {:user_id  (:id user)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (mt/derecordize
            (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest user-recent-views-test
  (mt/with-temp* [Card      [card1 {:name                   "rand-name"
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
                  Card      [archived  {:name                   "archived-card"
                                        :creator_id             (mt/user->id :crowberto)
                                        :display                "table"
                                        :archived               true
                                        :visualization_settings {}}]
                  Dashboard [dash {:name        "rand-name2"
                                   :description "rand-name2"
                                   :creator_id  (mt/user->id :crowberto)}]
                  Table     [table1 {:name "rand-name"}]
                  Table     [hidden-table {:name            "hidden table"
                                           :visibility_type "hidden"}]
                  Card      [dataset {:name                   "rand-name"
                                      :dataset                true
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :visualization_settings {}}]]
    (testing "User's recent views are updated when card/dashboard/table-read events occur."
      (mt/with-test-user :crowberto
        (view-log/user-recent-views! []) ;; ensure no views from any other tests/temp items exist
        (doseq [event [{:topic :card-read :item dataset}
                       {:topic :card-read :item dataset}
                       {:topic :card-read :item card1}
                       {:topic :card-read :item card1}
                       {:topic :card-read :item card1}
                       {:topic :dashboard-read :item dash}
                       {:topic :card-read :item card1}
                       {:topic :dashboard-read :item dash}
                       {:topic :table-read :item table1}
                       {:topic :card-read :item archived}
                       {:topic :table-read :item hidden-table}]]
          (view-log/handle-view-event!
           ;; view log entries look for the `:actor_id` in the item being viewed to set that view's :user_id
           (assoc-in event [:item :actor_id] (mt/user->id :crowberto))))
        (let [recent-views (mt/with-test-user :crowberto (view-log/user-recent-views))]
          (is (=
               [{:model "card" :model_id (u/the-id dataset)}
                {:model "card" :model_id (u/the-id card1)}
                {:model "dashboard" :model_id (u/the-id dash)}
                {:model "table" :model_id (u/the-id table1)}
                {:model "card" :model_id (u/the-id archived)}
                {:model "table" :model_id (u/the-id hidden-table)}]
               recent-views)))))))
