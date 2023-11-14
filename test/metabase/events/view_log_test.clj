(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models :refer [Card Dashboard Table User ViewLog]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest card-read-test
  (mt/with-temp [User user {}
                 Card card {:creator_id (:id user)}]

    (events/publish-event! :event/card-read {:object card :user-id (:id user)})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))))

(deftest card-query-test
  (mt/with-temp [User user {}
                 Card card {:creator_id (:id user)}]
    (events/publish-event! :event/card-query {:cached       false
                                              :ignore_cache true
                                              :card-id      (:id card)
                                              :user-id      (:id user)
                                              :context      "dashboard"})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)
            :metadata {:cached false :ignore_cache true :context "dashboard"}}
           (t2/select-one [ViewLog :user_id :model :model_id :metadata], :user_id (:id user))))))

(deftest table-read-test
  (mt/with-temp [User  user  {}
                 Table table {}]
    (events/publish-event! :event/table-read {:object table :user-id (:id user)})
    (is (= {:user_id  (:id user)
            :model    "table"
            :model_id (:id table)}
           (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))))

(deftest dashboard-read-test
  (mt/with-temp [User      user {}
                 Dashboard dashboard {:creator_id (:id user)}]
    (events/publish-event! :event/dashboard-read {:object dashboard :user-id (:id user)})
    (is (= {:user_id  (:id user)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))))
