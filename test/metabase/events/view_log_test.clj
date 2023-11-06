(ns metabase.events.view-log-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events :as events]
   [metabase.events.view-log :as view-log]
   [metabase.models :refer [Card Dashboard Table User ViewLog]]
   [metabase.models.setting :as setting]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest card-create-test
  (mt/with-temp [User user {}
                 Card card {:creator_id (:id user)}]

    (events/publish-event! :event/card-create {:object card :user-id (:id user)})
    (is (= {:user_id  (:id user)
            :model    "card"
            :model_id (:id card)}
           (t2/select-one [ViewLog :user_id :model :model_id], :user_id (:id user))))))

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

(deftest user-recent-views-test
  (mt/with-temp [Card      card1 {:name                   "rand-name"
                                  :creator_id             (mt/user->id :crowberto)
                                  :display                "table"
                                  :visualization_settings {}}
                 Card      archived  {:name                   "archived-card"
                                      :creator_id             (mt/user->id :crowberto)
                                      :display                "table"
                                      :archived               true
                                      :visualization_settings {}}
                 Dashboard dash {:name        "rand-name2"
                                 :description "rand-name2"
                                 :creator_id  (mt/user->id :crowberto)}
                 Table     table1 {:name "rand-name"}
                 Table     hidden-table {:name            "hidden table"
                                         :visibility_type "hidden"}
                 Card      dataset {:name                   "rand-name"
                                    :dataset                true
                                    :creator_id             (mt/user->id :crowberto)
                                    :display                "table"
                                    :visualization_settings {}}]
    (mt/with-model-cleanup [ViewLog]
      (testing "User's recent views are updated when card/dashboard/table-read events occur."
        (mt/with-test-user :crowberto
          ;; ensure no views from any other tests/temp items exist
          (view-log/user-recent-views! [])
          (doseq [{:keys [topic event]} [{:topic :event/card-query     :event {:card-id (:id dataset)}} ; oldest view
                                         {:topic :event/card-query     :event {:card-id (:id dataset)}}
                                         {:topic :event/card-query     :event {:card-id (:id card1)}}
                                         {:topic :event/card-query     :event {:card-id (:id card1)}}
                                         {:topic :event/card-query     :event {:card-id (:id card1)}}
                                         {:topic :event/dashboard-read :event {:object dash}}
                                         {:topic :event/card-query     :event {:card-id (:id card1)}}
                                         {:topic :event/dashboard-read :event {:object dash}}
                                         {:topic :event/table-read     :event {:object table1}}
                                         {:topic :event/card-query     :event {:card-id (:id archived)}}
                                         {:topic :event/table-read     :event {:object hidden-table}}]]
            (events/publish-event! topic
                                   (assoc event :user-id (mt/user->id :crowberto))))

          (is (= [{:model "table" :model_id (u/the-id hidden-table)}
                  {:model "card" :model_id (u/the-id archived)}
                  {:model "table" :model_id (u/the-id table1)}
                  {:model "dashboard" :model_id (u/the-id dash)}
                  {:model "card" :model_id (u/the-id card1)}
                  {:model "card" :model_id (u/the-id dataset)}]
                 (view-log/user-recent-views))))))))

(deftest user-dismissed-toasts-setting-test
  (testing "user-dismissed-toasts! updates user-dismissed-toasts"
    (binding [setting/*user-local-values* (delay (atom {}))]
      (view-log/dismissed-custom-dashboard-toast! false)
      (is (false? (view-log/dismissed-custom-dashboard-toast)))
      (view-log/dismissed-custom-dashboard-toast! true)
      (is (true? (view-log/dismissed-custom-dashboard-toast)))
      (view-log/dismissed-custom-dashboard-toast! false)
      (is (false? (view-log/dismissed-custom-dashboard-toast))))))

(deftest most-recently-viewed-dashboard-test
  (t2.with-temp/with-temp [Dashboard dash {:name "Look at this Distinguished Dashboard!"}]
    (mt/with-model-cleanup [ViewLog]
      (testing "When a user views a dashboard, most-recently-viewed-dashboard is updated with that id."
        (mt/with-test-user :crowberto
          (is (nil? (view-log/most-recently-viewed-dashboard! nil)))
          (is (nil? (view-log/most-recently-viewed-dashboard)))
          (events/publish-event! :event/dashboard-read {:object dash :user-id (mt/user->id :crowberto)})
          (is (= (u/the-id dash)
                 (view-log/most-recently-viewed-dashboard)))
          (testing "When the user's most recent dashboard view is older than 24 hours, return `nil`."
            (is (string?
                 (setting/set-value-of-type! :json
                                             :most-recently-viewed-dashboard
                                             {:id        (u/the-id dash)
                                              :timestamp (t/minus (t/zoned-date-time) (t/hours 25))})))
            (is (nil? (view-log/most-recently-viewed-dashboard)))))))))
