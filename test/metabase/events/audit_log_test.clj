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
   [metabase.notification.test-util :as notification.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(comment events.audit-log/keep-me)

(clojure.test/use-fixtures :once
  (fn [test-fn]
    (mt/with-premium-features #{:audit-app}
      (test-fn))))

(deftest card-create-test
  (testing ":card-create event"
    (mt/with-temp [:model/Card card {:name "My Cool Card"}]
      (is (= {:object card :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/card-create {:object card :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :card-create
            :user_id  (mt/user->id :rasta)
            :model    "Card"
            :model_id (:id card)
            :details  {:name "My Cool Card", :description nil, :database_id (mt/id) :table_id nil}}
           (mt/latest-audit-log-entry "card-create" (:id card)))))))

(deftest card-create-nested-query-test
  (testing :card-create
    (testing "when I save a Card that uses a NESTED query, is the activity recorded? :D"
      (mt/with-temp [:model/Card card-1 {:name          "My Cool Card"
                                         :dataset_query {:database (mt/id)
                                                         :type     :query
                                                         :query    {:source-table (mt/id :venues)}}}
                     :model/Card card-2 {:name          "My Cool NESTED Card"
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
             (mt/latest-audit-log-entry "card-create" (:id card-2))))))))

(deftest card-update-event-test
  (testing :card-update
    (doseq [card-type [:question :model]]
      (testing card-type
        (mt/with-temp [:model/Card card {:name "My Cool Card", :type card-type}]
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
                              (= card-type :model) (assoc :model? true))}
                 (mt/latest-audit-log-entry "card-update" (:id card))))))))))

(deftest card-delete-event-test
  (testing :card-delete
    (doseq [card-type [:question :model]]
      (testing card-type
        (mt/with-temp [:model/Card card {:name "My Cool Card", :type card-type}]
          (mt/with-test-user :rasta
            (is (= {:object card :user-id (mt/user->id :rasta)}
                   (events/publish-event! :event/card-delete {:object card :user-id (mt/user->id :rasta)})))
            (is (partial=
                 {:topic    :card-delete
                  :user_id  (mt/user->id :rasta)
                  :model    "Card"
                  :model_id (:id card)
                  :details  (cond-> {:name "My Cool Card", :description nil}
                              (= card-type :model) (assoc :model? true))}
                 (mt/latest-audit-log-entry "card-delete" (:id card))))))))))

(deftest dashboard-create-event-test
  (testing :dashboard-create
    (mt/with-temp [:model/Dashboard dashboard {:name "My Cool Dashboard"}]
      (is (= {:object dashboard :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/dashboard-create {:object dashboard :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :dashboard-create
            :user_id  (mt/user->id :rasta)
            :model    "Dashboard"
            :model_id (:id dashboard)
            :details  {:name "My Cool Dashboard", :description nil}}
           (mt/latest-audit-log-entry "dashboard-create" (:id dashboard)))))))

(deftest dashboard-delete-event-test
  (testing :dashboard-delete
    (mt/with-temp [:model/Dashboard dashboard {:name "My Cool Dashboard"}]
      (is (= {:object dashboard :user-id (mt/user->id :rasta)}
             (events/publish-event! :event/dashboard-delete {:object dashboard :user-id (mt/user->id :rasta)})))
      (is (partial=
           {:topic    :dashboard-delete
            :user_id  (mt/user->id :rasta)
            :model    "Dashboard"
            :model_id (:id dashboard)
            :details  {:name "My Cool Dashboard", :description nil}}
           (mt/latest-audit-log-entry "dashboard-delete" (:id dashboard)))))))

(deftest dashboard-add-cards-event-test
  (testing :dashboard-add-cards
    (mt/with-temp [:model/Dashboard     dashboard {:name "My Cool Dashboard"}
                   :model/Card          card {}
                   :model/DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
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
             (mt/latest-audit-log-entry "dashboard-add-cards" (:id dashboard))))))))

(deftest dashboard-remove-cards-event-test
  (testing :dashboard-remove-cards
    (mt/with-temp [:model/Dashboard     dashboard {:name "My Cool Dashboard"}
                   :model/Card          card {}
                   :model/DashboardCard dashcard  {:dashboard_id (:id dashboard), :card_id (:id card)}]
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
             (mt/latest-audit-log-entry "dashboard-remove-cards" (:id dashboard))))))))

(deftest install-event-test
  (testing :install
    (is (= {}
           (events/publish-event! :event/install {})))
    (is (= {:topic       :install
            :user_id     nil
            :model       nil
            :model_id    nil
            :details     {}}
           (mt/latest-audit-log-entry "install")))))

(deftest metric-create-event-test
  (testing :metric-create
    (mt/with-temp [:model/LegacyMetric metric {:table_id (mt/id :venues)}]
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
             (mt/latest-audit-log-entry "metric-create" (:id metric)))))))

(deftest metric-update-event-test
  (testing :metric-update
    (mt/with-temp [:model/LegacyMetric metric {:table_id (mt/id :venues)}]
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
               (mt/latest-audit-log-entry "metric-update" (:id metric))))))))

(deftest metric-delete-event-test
  (testing :metric-delete
    (mt/with-temp [:model/LegacyMetric metric {:table_id (mt/id :venues)}]
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
               (mt/latest-audit-log-entry "metric-delete" (:id metric))))))))

(deftest subscription-events-test
  (mt/with-temp [:model/Dashboard      {dashboard-id :id} {}
                 :model/Pulse          pulse {:archived     false
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
               (mt/latest-audit-log-entry "subscription-update" (:id pulse)))))
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
               (mt/latest-audit-log-entry "subscription-create" (:id pulse))))))))

(deftest alert-events-test
  (mt/with-temp [:model/Dashboard      {dashboard-id :id} {}
                 :model/Card           card {:name "card-name"}
                 :model/Pulse          pulse {:archived     false
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
               (mt/latest-audit-log-entry "alert-update" (:id pulse))))))))

(deftest subscription-unsubscribe-event-test
  (testing :subscription-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "subscription-unsubscribe"))))))

(deftest subscription-unsubscribe-undo-event-test
  (testing :subscription-unsubscribe-undo
    (mt/with-test-user :rasta
      (events/publish-event! :event/subscription-unsubscribe-undo {:object {:email "test"}})
      (is (= {:topic       :subscription-unsubscribe-undo
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "subscription-unsubscribe-undo"))))))

(deftest subscription-send-event-test
  (testing :subscription-send
    (mt/with-premium-features #{:audit-app}
      (let [id 1]
        (mt/with-test-user :rasta
          (events/publish-event! :event/subscription-send {:id      id
                                                           :user-id (mt/user->id :lucky)
                                                           :object  {:recipients [[{:email "test"}]]
                                                                     :filters    []}}))
        (is (= {:topic       :subscription-send
                :user_id     (mt/user->id :lucky)
                :model       "Pulse"
                :model_id    id
                :details     {:recipients [[{:email "test"}]]
                              :filters    []}}
               (mt/latest-audit-log-entry "subscription-send" id)))))))

(deftest alert-send-event-test
  (testing :alert-send
    (mt/with-model-cleanup [:model/AuditLog]
      (let [id 1]
        (mt/with-test-user :rasta
          (events/publish-event! :event/alert-send {:id      id
                                                    :user-id (mt/user->id :lucky)
                                                    :object  {:recipients [[{:email "test"}]]
                                                              :filters    []}}))
        (is (= {:topic       :alert-send
                :user_id     (mt/user->id :lucky)
                :model       "Pulse"
                :model_id    id
                :details     {:recipients [[{:email "test"}]]
                              :filters    []}}
               (mt/latest-audit-log-entry "alert-send" id)))))))

(deftest alert-unsubscribe-event-test
  (testing :alert-unsubscribe
    (mt/with-test-user :rasta
      (events/publish-event! :event/alert-unsubscribe {:object {:email "test"}})
      (is (= {:topic       :alert-unsubscribe
              :user_id     (mt/user->id :rasta)
              :model       "Pulse"
              :model_id    nil
              :details     {:email "test"}}
             (mt/latest-audit-log-entry "alert-unsubscribe"))))))

(deftest segment-create-event-test
  (testing :segment-create
    (mt/with-temp [:model/Segment segment]
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
               (mt/latest-audit-log-entry "segment-create" (:id segment))))))))

(deftest segment-update-event-test
  (testing :segment-update
    (mt/with-temp [:model/Segment segment]
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
               (mt/latest-audit-log-entry "segment-update" (:id segment))))))))

(deftest segment-delete-event-test
  (testing :segment-delete
    (mt/with-temp [:model/Segment segment]
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
               (mt/latest-audit-log-entry "segment-delete" (:id segment))))))))

(deftest user-joined-event-test
  (testing :user-joined
    (is (= {:user-id (mt/user->id :rasta)}
           (events/publish-event! :event/user-joined {:user-id (mt/user->id :rasta)})))
    (is (= {:topic       :user-joined
            :user_id     (mt/user->id :rasta)
            :model       "User"
            :model_id    (mt/user->id :rasta)
            :details     {}}
           (mt/latest-audit-log-entry :user-joined (mt/user->id :rasta))))))

(deftest user-invited-event-test
  (testing :event/user-invited
    (mt/with-current-user (mt/user->id :rasta)
      (mt/with-temp [:model/User {:keys [id] :as new-user}]
        (let [details {:invitor {:first_name "Ngoc"
                                 :email      "ngoc@metabase.com"}}]
          (is (= {:object  new-user
                  :details details}
                 (events/publish-event! :event/user-invited {:object new-user
                                                             :details details})))
          (is (partial=
               {:model_id id
                :user_id  (mt/user->id :rasta)
                :details  (assoc (select-keys new-user [:first_name :last_name :email])
                                 :user_group_memberships [{:id 1}]
                                 :invitor (:invitor details))
                :topic    :user-invited
                :model    "User"}
               (mt/latest-audit-log-entry :user-invited id))))))))

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
             (mt/latest-audit-log-entry :user-update (mt/user->id :lucky))))))))

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
               (mt/latest-audit-log-entry :user-deactivated (mt/user->id :lucky))))))))

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
               (mt/latest-audit-log-entry :user-reactivated (mt/user->id :lucky))))))))

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
               (mt/latest-audit-log-entry :password-reset-initiated (mt/user->id :rasta))))))))

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
               (mt/latest-audit-log-entry :password-reset-successful (mt/user->id :rasta))))))))

(deftest create-channel-event-test
  (mt/with-current-user (mt/user->id :rasta)
    (mt/with-temp [:model/Channel channel notification.tu/default-can-connect-channel]
      (testing :event/channel-create
        (is (= {:object channel}
               (events/publish-event! :event/channel-create {:object channel})))
        (is (= {:model_id (:id channel)
                :user_id  (mt/user->id :rasta)
                :details  {:id          (:id channel)
                           :name        "Test channel"
                           :description "Test channel description"
                           :type        notification.tu/test-channel-type
                           :active      true}
                :topic    :channel-create
                :model    "Channel"}
               (mt/latest-audit-log-entry :channel-create (:id channel)))))

      (testing :event/channel-update
        (events/publish-event! :event/channel-update {:object          (assoc channel
                                                                              :details {:new-detail true}
                                                                              :name "New Name")
                                                      :previous-object channel})

        (is (= {:model_id (:id channel)
                :user_id  (mt/user->id :rasta)
                :details  {:previous {:name "Test channel"}
                           :new      {:name "New Name"}}
                :topic    :channel-update
                :model    "Channel"}
               (mt/latest-audit-log-entry :channel-update (:id channel))))))))
