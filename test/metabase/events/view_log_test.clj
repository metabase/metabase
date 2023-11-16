(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events :as events]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn latest-view
  "Returns the most recent view for a given user and model ID"
  [user-id model-id]
  (t2/select-one :model/ViewLog
                 :user_id user-id
                 :model_id model-id
                 {:order-by [[:id :desc]]}))

(deftest card-read-test
  (mt/with-temp [:model/User user {}
                 :model/Card card {:creator_id (u/id user)}]
    (testing "A basic card read event is recorded"
      (events/publish-event! :event/card-read {:object card :user-id (u/the-id user)})
      (is (partial=
           {:user_id  (u/id user)
            :model    "card"
            :model_id (u/id card)
            :has_access true
            :context    "question"}
           (latest-view (u/id user) (u/id card)))))))

(deftest table-read-test
  (mt/with-temp [:model/User user {}]
    (let [table (t2/select-one :model/Table :id (mt/id :users))]
      (testing "A basic table read event is recorded"
        (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
        (is (partial=
             {:user_id  (u/id user)
              :model    "table"
              :model_id (u/id table)
              :has_access nil
              :context    nil}
             (latest-view (u/id user) (u/id table)))))

      (testing "If a user is bound, has_access is recorded based on the user's current permissions"
        (binding [api/*current-user-id* (u/id user)
                  api/*current-user-permissions-set* (delay #{(perms/table-query-path (mt/id :users))})]
          (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
          (is (true? (:has_access (latest-view (u/id user) (u/id table)))))

          (binding [api/*current-user-permissions-set* (delay #{(perms/table-query-path (mt/id :checkins))})]
            (events/publish-event! :event/table-read {:object table :user-id (u/id user)})
            (is (false? (:has_access (latest-view (u/id user) (u/id table)))))))))))

(deftest dashboard-read-test
  (mt/with-temp [:model/User          user      {}
                 :model/Dashboard     dashboard {:name "Test Dashboard"}
                 :model/Card          card      {:name "Dashboard Test Card"}
                 :model/DashboardCard _dashcard {:dashboard_id (u/id dashboard) :card_id (u/id card)}]
    (let [dashboard (t2/hydrate dashboard [:dashcards :card])]
      (testing "A basic dashboard read event is recorded, as well as events for its cards"
        (events/publish-event! :event/dashboard-read {:object dashboard :user-id (u/id user)})
        (is (partial=
             {:user_id    (u/id user)
              :model      "dashboard"
              :model_id   (u/id dashboard)
              :has_access true
              :context    nil}
             (latest-view (u/id user) (u/id dashboard))))

        (is (partial=
             {:user_id    (u/id user)
              :model      "card"
              :model_id   (u/id card)
              :has_access true
              :context    "dashboard"}
             (latest-view (u/id user) (u/id card))))))))
