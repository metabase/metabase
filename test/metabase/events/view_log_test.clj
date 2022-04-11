(ns metabase.events.view-log-test
  (:require [clojure.test :refer :all]
            [metabase.events.view-log :as view-log]
            [metabase.models :refer [Card Dashboard Table User ViewLog]]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest card-create-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :card-create
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest card-read-test
  (mt/with-temp* [User [user]
                  Card [card {:creator_id (:id user)}]]

    (view-log/handle-view-event! {:topic :card-read
                                  :item  card})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (mt/derecordize
            (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

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
            (db/select-one [ViewLog :user_id :model :model_id :metadata], :user_id (:id user)))))))

(deftest table-read-test
  (mt/with-temp* [User  [user]
                  Table [table]]

    (view-log/handle-view-event! {:topic :table-read
                                  :item  (assoc table :actor_id (:id user))})
    (is (= {:user_id  (:id user)
            :model    "table"
            :model_id (:id table)}
           (mt/derecordize
            (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))

(deftest dashboard-read-test
  (mt/with-temp* [User      [user]
                  Dashboard [dashboard {:creator_id (:id user)}]]
    (view-log/handle-view-event! {:topic :dashboard-read
                                  :item  dashboard})
    (is (= {:user_id  (:id user)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (mt/derecordize
            (db/select-one [ViewLog :user_id :model :model_id], :user_id (:id user)))))))
