(ns metabase.events.audit-log-test
  "Tests for `publish-event!` handlers which record events to the audit log. These tests generally call `publish-event!`
  with the appropriate arguments for a given event, and check that the correct data was written to the audit_log table.
  Integration tests that check that feature code is calling `publish-event!` in the correct places should be placed in
  the test code for the feature."
  (:require
   [clojure.test :refer :all]
   [metabase.events :as events]
   [metabase.events.audit-log :as events.audit-log]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models
    :refer [Card Dashboard DashboardCard Table Metric Pulse Segment]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(comment events.audit-log/keep-me)

(defn latest-event
  ([topic]
   (latest-event topic nil))

  ([topic model-id]
   (t2/select-one [:model/AuditLog :topic :user_id :model :model_id :details]
                  :topic    topic
                  :model_id model-id
                  {:order-by [[:id :desc]]})))

(deftest card-create-test
  (testing ":card-create event"
    (t2.with-temp/with-temp [Card card {:name "My Cool Card"}]
      (is (= {:object card :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :card-create
            :user_id  (mt/user->id :rasta)
            :model    "Card"
            :model_id (:id card)
            :details  {:name "My Cool Card", :description nil, :database_id (mt/id) :table_id nil}}
           (latest-event "card-create" (:id card)))))))

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
        (is (= {:object card-2 :user-id (mt/user->id :rasta)}
               (events/publish-event! :event/card-create {:object card-2 :user-id (mt/user->id :rasta)})))
        (is (partial=
             {:topic    :card-create
              :user_id  (mt/user->id :rasta)
              :model    "Card"
              :model_id (:id card-2)
              :details  {:name        "My Cool NESTED Card"
                         :description nil
                         :database_id (mt/id)
                         :table_id    (mt/id :venues)}}
             (latest-event "card-create" (:id card-2))))))))

(deftest card-update-event-test
  (testing :card-update
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card" :dataset dataset?}]
          (mt/with-test-user :rasta
            (is (= {:object card :user-id (mt/user->id :rasta)}
                   (events/publish-event! :event/card-update {:object card :user-id (mt/user->id :rasta)})))
            (is (partial=
                 {:topic    :card-update
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card)
                  :details  (cond-> {:name        "My Cool Card"
                                     :description nil
                                     :table_id    nil
                                     :database_id (mt/id)}
                              dataset? (assoc :model? true))}
                 (latest-event "card-update" (:id card))))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card", :dataset dataset?}]
          (mt/with-test-user :rasta
            (is (= {:object card :user-id (mt/user->id :rasta)}
                   (events/publish-event! :event/card-delete {:object card :user-id (mt/user->id :rasta)})))
            (is (partial=
                 {:topic    :card-delete
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card)
                  :details  (cond-> {:name "My Cool Card", :description nil}
                              dataset? (assoc :model? true))}
                 (latest-event "card-delete" (:id card))))))))))

(deftest card-read-event-test
  (testing :card-read
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card", :dataset dataset?}]
          (is (= {:object card :user-id (mt/user->id :rasta)}
                 (events/publish-event! :event/card-read {:object card :user-id (mt/user->id :rasta)})))
          (is (partial=
               {:topic    :card-read
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id (:id card)
                :details  (cond-> {:name "My Cool Card", :description nil}
                            dataset? (assoc :model? true))}
               (latest-event "card-read" (:id card)))))))))

(deftest card-query-event-test
  (testing :card-query
    (doseq [dataset? [false true]]
      (testing (if dataset? "Dataset" "Card")
        (t2.with-temp/with-temp [Card card {:name "My Cool Card", :dataset dataset?}]
          (events/publish-event! :event/card-query {:user-id      (mt/user->id :rasta)
                                                    :card-id      (u/the-id card)
                                                    :cached       false
                                                    :ignore_cache false
                                                    :context      :question})
          (is (partial=
               {:topic    :card-query
                :user_id  (mt/user->id :rasta)
                :model    "Card"
                :model_id (:id card)
                :details  {:cached false :ignore_cache false :context "question"}}
               (latest-event "card-query" (:id card)))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (is (= {:object dashboard :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/dashboard-create {:object dashboard :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :dashboard-create
            :user_id  (mt/user->id :rasta)
            :model    "Dashboard"
            :model_id (:id dashboard)
            :details  {:name "My Cool Dashboard", :description nil}}
           (latest-event "dashboard-create" (:id dashboard)))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (is (= {:object dashboard :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/dashboard-delete {:object dashboard :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :dashboard-delete
            :user_id  (mt/user->id :rasta)
            :model    "Dashboard"
            :model_id (:id dashboard)
            :details  {:name "My Cool Dashboard", :description nil}}
           (latest-event "dashboard-delete" (:id dashboard)))))))

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (let [event {:object    dashboard
                   :dashcards [dashcard]
                   :user-id   (mt/user->id :rasta)}]
        (is (= event
               (events/publish-event! :event/dashboard-add-cards event)))
        (is (partial=
             {:topic    :dashboard-add-cards
              :user_id  (mt/user->id :rasta)
              :model    "Dashboard"
              :model_id (:id dashboard)
              :details  {:name        "My Cool Dashboard"
                         :description nil
                         :dashcards   [{:description (:description card)
                                        :name        (:name card)
                                        :id          (:id dashcard)
                                        :card_id     (:id card)}]}}
             (latest-event "dashboard-add-cards" (:id dashboard))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp [Dashboard     dashboard {:name "My Cool Dashboard"}
                   Card          card {}
                   DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
      (let [event {:object    dashboard
                   :dashcards [dashcard]
                   :user-id   (mt/user->id :rasta)}]
        (is (= event
               (events/publish-event! :event/dashboard-remove-cards event)))
        (is (partial=
             {:topic       :dashboard-remove-cards
              :user_id     (mt/user->id :rasta)
              :model       "Dashboard"
              :model_id    (:id dashboard)
              :details     {:name        "My Cool Dashboard"
                            :description nil
                            :dashcards   [{:description (:description card)
                                           :name        (:name card)
                                           :id          (:id dashcard)
                                           :card_id     (:id card)}]}}
             (latest-event "dashboard-remove-cards" (:id dashboard))))))))

(deftest dashboard-read-event-test
  (testing :dashboard-read
    (t2.with-temp/with-temp [Dashboard dashboard {:name "My Cool Dashboard"}]
      (is (= {:object dashboard :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/dashboard-read {:object dashboard :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :dashboard-read
            :user_id  (mt/user->id :rasta)
            :model    "Dashboard"
            :model_id (:id dashboard)
            :details  {:name "My Cool Dashboard", :description nil}}
           (latest-event "dashboard-read" (:id dashboard)))))))

(deftest table-read-event-test
  (testing :table-read
    (t2.with-temp/with-temp [Table table {:name "My Cool Table"}]
      (is (= {:object table :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/table-read {:object table :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :table-read
            :user_id  (mt/user->id :rasta)
            :model    "Table"
            :model_id (:id table)
            :details  {}}
           (latest-event "table-read" (:id table)))))))

(deftest install-event-test
  (testing :install
    (is (= {}
           (events/publish-event! :event/install {})))
    (is (= {:topic       :install
            :user_id     nil
            :model       nil
            :model_id    nil
            :details     {}}
           (latest-event "install")))))

(deftest metric-create-event-test
  (testing :metric-create
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (is (= {:object metric :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/metric-create {:object metric :user-id (mt/user->id :rasta)})))
      (is (= {:topic       :metric-create
              :user_id     (mt/user->id :rasta)
              :model       "Metric"
              :model_id    (:id metric)
              :details     {:name        (:name metric)
                            :description (:description metric)
                            :database_id (mt/id)
                            :table_id    (mt/id :venues)}}
             (latest-event "metric-create" (:id metric)))))))

(deftest metric-update-event-test
  (testing :metric-update
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (let [event {:object           metric
                   :revision-message "update this mofo"
                   :user-id          (mt/user->id :rasta)}]
        (is (= event
               (events/publish-event! :event/metric-update event)))
        (is (= {:topic       :metric-update
                :user_id     (mt/user->id :rasta)
                :model       "Metric"
                :model_id    (:id metric)
                :details     {:name             (:name metric)
                              :description      (:description metric)
                              :database_id (mt/id)
                              :table_id    (mt/id :venues)
                              :revision-message "update this mofo"}}
               (latest-event "metric-update" (:id metric))))))))

(deftest metric-delete-event-test
  (testing :metric-delete
    (t2.with-temp/with-temp [Metric metric {:table_id (mt/id :venues)}]
      (let [event {:object           metric
                   :revision-message "deleted"
                   :user-id          (mt/user->id :rasta)}]
       (is (= event
              (events/publish-event! :event/metric-delete event)))
       (is (= {:topic       :metric-delete
               :user_id     (mt/user->id :rasta)
               :model       "Metric"
               :model_id    (:id metric)
               :details     {:name             (:name metric)
                             :description      (:description metric)
                             :revision-message "deleted"
                             :database_id (mt/id)
                             :table_id    (mt/id :venues)}}
              (latest-event "metric-delete" (:id metric))))))))

(deftest subscription-events-test
  (t2.with-temp/with-temp [Dashboard      {dashboard-id :id} {}
                           Pulse          pulse {:archived     false
                                                 :name         "name"
                                                 :dashboard_id dashboard-id
                                                 :parameters   ()}]
    (let [recipients [{:email "test@metabase.com"}
                      {:id    (mt/user->id :rasta)
                       :email "rasta@metabase.com"}]
          pulse      (assoc pulse
                            :channels [{:channel_type  :email
                                        :schedule_type :daily
                                        :recipients    recipients}])]
      (testing :subscription-update
        (is (= {:object pulse :user-id (mt/user->id :rasta)}
               (events/publish-event! :event/subscription-update {:object pulse :user-id (mt/user->id :rasta)})))
        (is (= {:topic       :subscription-update
                :user_id     (mt/user->id :rasta)
                :model       "Pulse"
                :model_id    (:id pulse)
                :details     {:archived     false
                              :name         "name"
                              :dashboard_id dashboard-id
                              :parameters   []
                              :channel      ["email"]
                              :schedule     ["daily"]
                              :recipients   [recipients]}}
               (latest-event "subscription-update" (:id pulse)))))
      (testing :subscription-create
        (is (= {:object pulse :user-id (mt/user->id :rasta)}
               (events/publish-event! :event/subscription-create {:object pulse :user-id (mt/user->id :rasta)})))
        (is (= {:topic       :subscription-create
                :user_id     (mt/user->id :rasta)
                :model       "Pulse"
                :model_id    (:id pulse)
                :details     {:archived     false
                              :name         "name"
                              :dashboard_id dashboard-id
                              :parameters   []
                              :channel      ["email"]
                              :schedule     ["daily"]
                              :recipients   [recipients]}}
               (latest-event "subscription-create" (:id pulse))))))))

(deftest alert-events-test
  (t2.with-temp/with-temp [Dashboard      {dashboard-id :id} {}
                           Card           card {:name "card-name"}
                           Pulse          pulse {:archived     false
                                                 :name         "name"
                                                 :dashboard_id dashboard-id
                                                 :parameters   ()}]
    (let [pulse (-> pulse
                    (assoc :card card)
                    (assoc :channels [{:channel_type  :email
                                       :schedule_type :daily
                                       :recipients    [{:email "test@metabase.com"}
                                                       {:id    (mt/user->id :rasta)
                                                        :email "rasta@metabase.com"}]}
                                      {:channel_type  :slack
                                       :schedule_type :hourly
                                       :recipients    [{:id (mt/user->id :rasta)}]}]))]
      (testing :alert-update
        (is (= {:object pulse :user-id (mt/user->id :rasta)}
               (events/publish-event! :event/alert-update {:object pulse :user-id (mt/user->id :rasta)})))
        (is (= {:topic       :alert-update
                :user_id     (mt/user->id :rasta)
                :model       "Card"
                :model_id    (:id pulse)
                :details     {:archived   false
                              :name       "card-name"
                              :card_id    (:id card)
                              :parameters []
                              :channel    ["email" "slack"]
                              :schedule   ["daily" "hourly"]
                              :recipients [[{:email "test@metabase.com"}
                                            {:id    (mt/user->id :rasta)
                                             :email "rasta@metabase.com"}]
                                           [{:id (mt/user->id :rasta)}]]}}
               (latest-event "alert-update" (:id pulse))))))))

(deftest subscription-unsubscribe-event-test
  (testing :subscription-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (latest-event "subscription-unsubscribe"))))))

(deftest subscription-unsubscribe-undo-event-test
  (testing :subscription-unsubscribe-undo
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe-undo {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe-undo
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (latest-event "subscription-unsubscribe-undo"))))))

(deftest alert-unsubscribe-event-test
  (testing :alert-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/alert-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :alert-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (latest-event "alert-unsubscribe"))))))

(deftest segment-create-event-test
  (testing :segment-create
    (t2.with-temp/with-temp [Segment segment]
      (mt/with-test-user :rasta
       (is (= {:object segment :user-id (mt/user->id :rasta)}
              (events/publish-event! :event/segment-create {:object segment :user-id (mt/user->id :rasta)})))
       (is (= {:topic       :segment-create
               :user_id     (mt/user->id :rasta)
               :model       "Segment"
               :model_id    (:id segment)
               :details     {:name        (:name segment)
                             :description (:description segment)
                             :database_id (mt/id)
                             :table_id    (mt/id :checkins)}}
              (latest-event "segment-create" (:id segment))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (t2.with-temp/with-temp [Segment segment]
     (let [event (-> {:object segment}
                     (assoc :revision-message "update this mofo")
                     (assoc :user-id (mt/user->id :rasta)))]
       (is (= event
              (events/publish-event! :event/segment-update event)))
       (is (= {:topic       :segment-update
               :user_id     (mt/user->id :rasta)
               :model       "Segment"
               :model_id    (:id segment)
               :details     {:name             (:name segment)
                             :description      (:description segment)
                             :revision-message "update this mofo"
                             :database_id (mt/id)
                             :table_id    (mt/id :checkins)}}
              (latest-event "segment-update" (:id segment))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (t2.with-temp/with-temp [Segment segment]
     (let [event (assoc {:object segment}
                        :revision-message "deleted"
                        :user-id (mt/user->id :rasta))]
       (is (= event
              (events/publish-event! :event/segment-delete event)))
       (is (= {:topic       :segment-delete
               :user_id     (mt/user->id :rasta)
               :model       "Segment"
               :model_id    (:id segment)
               :details     {:name             (:name segment)
                             :description      (:description segment)
                             :revision-message "deleted"
                             :database_id (mt/id)
                             :table_id    (mt/id :checkins)}}
              (latest-event "segment-delete" (:id segment))))))))

(deftest user-joined-event-test
  (testing :user-joined
    ;; TODO - what's the difference between `user-login` / `user-joined`?
    (is (= {:user-id (mt/user->id :rasta)}
           (events/publish-event! :event/user-joined {:user-id (mt/user->id :rasta)})))
    (is (= {:topic       :user-joined
            :user_id     (mt/user->id :rasta)
            :model       "User"
            :model_id    (mt/user->id :rasta)
            :details     {}}
           (latest-event :user-joined (mt/user->id :rasta))))))

(deftest user-invited-event-test
  (testing :event/user-invited
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/User {:keys [id] :as new-user}]
        (is (= {:object new-user}
               (events/publish-event! :event/user-invited {:object new-user})))
        (is (partial=
             {:model_id id
              :user_id  (mt/user->id :rasta)
              :details  (assoc (select-keys new-user [:first_name :last_name :email])
                               :user_group_memberships [{:id 1}])
              :topic    :user-invited
              :model    "User"}
             (latest-event :user-invited id)))))))

(deftest user-update-event-test
  (testing :event/user-update
    (mt/with-current-user (mt/user->id :rasta)
      (let [user   (mt/fetch-user :lucky)
            event {:object          user
                   :previous-object (assoc user :last_name "Charms")}]
        (is (= event (events/publish-event! :event/user-update event)))
        (is (partial=
             {:model_id (mt/user->id :lucky)
              :user_id  (mt/user->id :rasta)
              :details  {:previous {:last_name "Charms"}
                         :new      {:last_name "Pigeon"}}
              :topic    :user-update
              :model    "User"}
             (latest-event :user-update (mt/user->id :lucky))))))))

(deftest user-deactivated-event-test
 (testing :event/user-deactivated
   (mt/with-current-user (mt/user->id :rasta)
     (let [user (mt/fetch-user :lucky)]
       (is (= {:object user}
              (events/publish-event! :event/user-deactivated {:object user})))
       (is (= {:model_id (mt/user->id :lucky)
               :user_id  (mt/user->id :rasta)
               :details  {}
               :topic    :user-deactivated
               :model    "User"}
              (latest-event :user-deactivated (mt/user->id :lucky))))))))

(deftest user-reactivated-event-test
 (testing :event/user-reactivated
   (mt/with-current-user (mt/user->id :rasta)
     (let [user (mt/fetch-user :lucky)]
       (is (= {:object user}
              (events/publish-event! :event/user-reactivated {:object user})))
       (is (= {:model_id (mt/user->id :lucky)
               :user_id  (mt/user->id :rasta)
               :details  {}
               :topic    :user-reactivated
               :model    "User"}
              (latest-event :user-reactivated (mt/user->id :lucky))))))))

(deftest password-reset-initiated-event-test
  (testing :event/password-reset-initiated
    (mt/with-current-user (mt/user->id :rasta)
      (let [user (assoc (mt/fetch-user :rasta) :token "hash")]
        (is (= {:object user}
               (events/publish-event! :event/password-reset-initiated {:object user})))
        (is (= {:model_id (mt/user->id :rasta)
                :user_id  (mt/user->id :rasta)
                :details  {:token "hash"}
                :topic    :password-reset-initiated
                :model    "User"}
               (latest-event :password-reset-initiated (mt/user->id :rasta))))))))

(deftest password-reset-successful-event-test
  (testing :event/password-reset-successful
    (mt/with-current-user (mt/user->id :rasta)
      (let [user (assoc (mt/fetch-user :rasta) :token "hash")]
        (is (= {:object user}
               (events/publish-event! :event/password-reset-successful {:object user})))
        (is (= {:model_id (mt/user->id :rasta)
                :user_id  (mt/user->id :rasta)
                :details  {:token "hash"}
                :topic    :password-reset-successful
                :model    "User"}
               (latest-event :password-reset-successful (mt/user->id :rasta))))))))
