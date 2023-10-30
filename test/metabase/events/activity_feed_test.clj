(ns metabase.events.activity-feed-test
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.activity-feed :as events.activity-feed]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Activity Card Dashboard DashboardCard Metric Pulse Segment]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(comment events.activity-feed/keep-me)

(defn- activity
  ([topic]
   (activity topic nil))

  ([topic model-id]
   (t2/select-one [Activity :topic :user_id :model :model_id :database_id :table_id :details]
                  :topic    topic
                  :model_id model-id
                  {:order-by [[:id :desc]]})))

(deftest card-create-test
  (testing :card-create
    (t2.with-temp/with-temp [Card card {:name "My Cool Card"}]
      (mt/with-model-cleanup [Activity]
        (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)})
        (is (= {:topic       :card-create
                :user_id     (mt/user->id :rasta)
                :model       "card"
                :model_id    (:id card)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Card", :description nil}}
               (activity "card-create" (:id card))))))))

(deftest card-create-nested-query-test
  (testing :card-create
    (testing "when I save a Card that uses a NESTED query, is the activity recorded? :D"
      (mt/with-temp [Card card-1 {:name          "My Cool Card"
                                  :dataset_query {:database (mt/id)
                                                  :type     :query
                                                  :query    {:source-table (mt/id :venues)}}}
                     Card card-2 {:name          "My Cool NESTED Card"
                                  :dataset_query {:database lib.schema.id/saved-questions-virtual-database-id
                                                  :type     :query
                                                  :query    {:source-table (str "card__" (u/the-id card-1))}}}]
        (mt/with-model-cleanup [Activity]
          (events/publish-event! :event/card-create {:object card-2 :user-id (mt/user->id :rasta)})
          (is (= {:topic       :card-create
                  :user_id     (mt/user->id :rasta)
                  :model       "card"
                  :model_id    (:id card-2)
                  :database_id (mt/id)
                  :table_id    (mt/id :venues)
                  :details     {:name "My Cool NESTED Card", :description nil}}
                 (activity "card-create" (:id card-2)))))))))

(deftest card-update-event-test
  (testing :card-update
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card" :dataset dataset?}]
          (mt/with-model-cleanup [Activity]
            (events/publish-event! :event/card-update {:object card :user-id (mt/user->id :rasta)})
            (is (= {:topic       :card-update
                    :user_id     (mt/user->id :rasta)
                    :model       (if dataset? "dataset" "card")
                    :model_id    (:id card)
                    :database_id nil
                    :table_id    nil
                    :details     (cond-> {:name "My Cool Card", :description nil}
                                   dataset? (assoc :original-model "card"))}
                   (activity "card-update" (:id card))))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card", :dataset dataset?}]
          (mt/with-model-cleanup [Activity]
            (events/publish-event! :event/card-delete {:object card :user-id (mt/user->id :rasta)})
            (is (= {:topic       :card-delete
                    :user_id     (mt/user->id :rasta)
                    :model       (if dataset? "dataset" "card")
                    :model_id (:id card)
                    :database_id nil
                    :table_id    nil
                    :details     (cond-> {:name "My Cool Card", :description nil}
                                   dataset? (assoc :original-model "card"))}
                   (activity "card-delete" (:id card))))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [Activity]
        (is (= {:object  dashboard
                :user-id (mt/user->id :rasta)}
               (events/publish-event! :event/dashboard-create {:object dashboard :user-id (mt/user->id :rasta)})))
        (is (= {:topic       :dashboard-create
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Dashboard", :description nil}}
               (activity "dashboard-create" (:id dashboard))))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (mt/with-model-cleanup [Activity]
        (events/publish-event! :event/dashboard-delete {:object dashboard :user-id (mt/user->id :rasta)})
        (is (= {:topic       :dashboard-delete
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name "My Cool Dashboard", :description nil}}
               (activity "dashboard-delete" (:id dashboard))))))))

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (mt/with-model-cleanup [Activity]
        (let [event {:object    dashboard
                     :user-id   (mt/user->id :rasta)
                     :dashcards [dashcard]}]
          (is (= event
                 (events/publish-event! :event/dashboard-add-cards event))))
        (is (=? {:topic       :dashboard-add-cards
                 :user_id     (mt/user->id :rasta)
                 :model       "dashboard"
                 :model_id    (:id dashboard)
                 :database_id nil
                 :table_id    nil
                 :details     {:name        "My Cool Dashboard"
                               :description nil
                               :dashcards   [{:description (:description card)
                                              :name        (:name card)
                                              :id          (:id dashcard)
                                              :card_id     (:id card)}]}}
                (activity "dashboard-add-cards" (:id dashboard))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (mt/with-model-cleanup [Activity]
        (let [event {:object    dashboard
                     :user-id   (mt/user->id :rasta)
                     :dashcards [dashcard]}]
          (is (= event
                 (events/publish-event! :event/dashboard-remove-cards event))))
       (is (=? {:topic       :dashboard-remove-cards
                :user_id     (mt/user->id :rasta)
                :model       "dashboard"
                :model_id    (:id dashboard)
                :database_id nil
                :table_id    nil
                :details     {:name        "My Cool Dashboard"
                              :description nil
                              :dashcards   [{:description (:description card)
                                             :name        (:name card)
                                             :id          (:id dashcard)
                                             :card_id     (:id card)}]}}
              (activity "dashboard-remove-cards" (:id dashboard))))))))

(deftest install-event-test
  (testing :install
    (mt/with-model-cleanup [Activity]
      (is (= {}
             (events/publish-event! :event/install {})))
      (is (= {:topic       :install
              :user_id     nil
              :database_id nil
              :table_id    nil
              :model       "install"
              :model_id    nil
              :details     {}}
             (activity "install"))))))

(deftest metric-create-event-test
  (testing :metric-create
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (events/publish-event! :event/metric-create {:object metric :user-id (mt/user->id :rasta)})
        (is (= {:topic       :metric-create
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :revision_message nil}}
               (activity "metric-create" (:id metric))))))))

(deftest metric-update-event-test
  (testing :metric-update
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (let [event {:object           metric
                     :user-id          (mt/user->id :rasta)
                     :revision-message "update this mofo"}]
          (is (= event
                 (events/publish-event! :event/metric-update event))))
        (is (= {:topic       :metric-update
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :revision_message "update this mofo"}}
               (activity "metric-update" (:id metric))))))))

(deftest metric-delete-event-test
  (testing :metric-delete
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (mt/with-model-cleanup [Activity]
        (let [event {:object           metric
                     :user-id          (mt/user->id :rasta)
                     :revision-message "deleted"}]
          (is (= event
                 (events/publish-event! :event/metric-delete event))))
        (is (= {:topic       :metric-delete
                :user_id     (mt/user->id :rasta)
                :model       "metric"
                :model_id    (:id metric)
                :database_id (mt/id)
                :table_id    (mt/id :venues)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :revision_message "deleted"}}
               (activity "metric-delete" (:id metric))))))))

(deftest pulse-create-event-test
  (testing :pulse-create
    (t2.with-temp/with-temp [Pulse pulse]
      (mt/with-model-cleanup [Activity]
        (events/publish-event! :event/pulse-create {:object pulse :user-id (mt/user->id :rasta)})
        (is (= {:topic       :pulse-create
                :user_id     (mt/user->id :rasta)
                :model       "pulse"
                :model_id    (:id pulse)
                :database_id nil
                :table_id    nil
                :details     {:name (:name pulse)}}
               (activity "pulse-create" (:id pulse))))))))

(deftest segment-create-event-test
  (testing :segment-create
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :rasta)})
        (is (= {:topic       :segment-create
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision_message nil}}
               (activity "segment-create" (:id segment))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (let [event {:object           segment
                     :user-id          (mt/user->id :rasta)
                     :revision-message "update this mofo"}]
          (is (= event
                 (events/publish-event! :event/segment-update event))))
        (is (= {:topic       :segment-update
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision_message "update this mofo"}}
               (activity "segment-update" (:id segment))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-model-cleanup [Activity]
        (let [event {:object           segment
                     :user-id          (mt/user->id :rasta)
                     :revision-message "deleted"}]
          (is (= event
                 (events/publish-event! :event/segment-delete event))))
        (is (= {:topic       :segment-delete
                :user_id     (mt/user->id :rasta)
                :model       "segment"
                :model_id    (:id segment)
                :database_id (mt/id)
                :table_id    (mt/id :checkins)
                :details     {:name             (:name segment)
                              :description      (:description segment)
                              :revision_message "deleted"}}
               (activity "segment-delete" (:id segment))))))))

(deftest user-login-event-test
  (testing :user-login
    ;; TODO - what's the difference between `user-login` / `user-joined`?
    (mt/with-model-cleanup [Activity]
      (let [event {:user-id (mt/user->id :rasta)}]
        (is (= event
               (events/publish-event! :event/user-login event))))
      (is (= {:topic       :user-joined
              :user_id     (mt/user->id :rasta)
              :model       "user"
              :model_id    (mt/user->id :rasta)
              :database_id nil
              :table_id    nil
              :details     {}}
             (activity "user-joined" (mt/user->id :rasta)))))))
