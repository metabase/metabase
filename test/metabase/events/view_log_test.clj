(ns metabase.events.view-log-test
  (:require [clojure.test :refer :all]
            [metabase
             [models :refer [Card Dashboard User ViewLog]]
             [test :as mt]]
            [metabase.events.view-log :as view-log]
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
