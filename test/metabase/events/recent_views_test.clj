(ns metabase.events.recent-views-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.models :refer [Card Dashboard Table]]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(defn- most-recent-view
  [user-id model-id model-type]
  (t2/select-one [:model/RecentViews :user_id :model :model_id]
                 :user_id  user-id
                 :model_id model-id
                 :model    model-type
                 {:order-by [[:id :desc]]}))

(deftest card-query-test
  (mt/with-temp [Card card {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
      (events/publish-event! :event/card-query {:card-id (:id card)
                                                :user-id (mt/user->id :rasta)
                                                :context :question})
      (is (= {:user_id  (mt/user->id :rasta)
              :model    "card"
              :model_id (:id card)}
             (most-recent-view (mt/user->id :rasta) (:id card) "card")))

      (testing "pinned cards should not be counted"
        (mt/with-temp [Card card-2 {:creator_id (mt/user->id :rasta)}]
          (events/publish-event! :event/card-query {:card-id (:id card-2)
                                                    :user-id (mt/user->id :rasta)
                                                    :context :collection})
          (is (nil? (most-recent-view (mt/user->id :rasta) (:id card-2) "card"))))))))

(deftest table-read-test
  (mt/with-temp [Table table {}]
    (mt/with-test-user :rasta
      (events/publish-event! :event/table-read {:object table :user-id (mt/user->id :rasta)})
      (is (partial=
           {:user_id  (mt/user->id :rasta)
            :model    "table"
            :model_id (:id table)}
           (most-recent-view (mt/user->id :rasta) (:id table) "table"))))))

(deftest dashboard-read-test
  (mt/with-temp [Dashboard dashboard {:creator_id (mt/user->id :rasta)}]
    (mt/with-test-user :rasta
     (events/publish-event! :event/dashboard-read {:object-id (:id dashboard) :user-id (mt/user->id :rasta)})
     (is (partial
           {:user_id  (mt/user->id :rasta)
            :model    "dashboard"
            :model_id (:id dashboard)}
           (most-recent-view (mt/user->id :rasta) (:id dashboard) "dashboard"))))))
