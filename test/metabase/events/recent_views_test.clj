(ns metabase.events.recent-views-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models :refer [Card Dashboard Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn- most-recent-view
  [user-id]
  (t2/select-one [:model/RecentViews :user_id :model :model_id]
                 :user_id user-id
                 {:order-by [[:id :desc]]}))

(deftest card-query-test
  (mt/with-temp [Card card {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
      (events/publish-event! :event/card-query {:card-id      (u/id card)
                                                :user-id      (mt/user->id :rasta)
                                                :cached       false
                                                :ignore_cache true})
      (is (= {:user_id  (mt/user->id :rasta)
              :model    "card"
              :model_id (:id card)}
             (most-recent-view (mt/user->id :rasta)))))))

(deftest table-read-test
  (mt/with-temp [Table table {}]
    (mt/with-test-user :rasta
     (events/publish-event! :event/table-read {:object table :user-id (mt/user->id :rasta)})
     (is (partial=
          {:user_id  (mt/user->id :rasta)
           :model    "table"
           :model_id (:id table)}
          (most-recent-view (mt/user->id :rasta)))))))

(deftest dashboard-read-test
  (mt/with-temp [Dashboard dashboard {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
     (events/publish-event! :event/dashboard-read {:object dashboard :user-id (mt/user->id :rasta)})
     (is (partial
           {:user_id  (mt/user->id :rasta)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (most-recent-view (mt/user->id :rasta)))))))
