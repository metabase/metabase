(ns metabase-enterprise.advanced-permissions.api.subscription-test
  "Permissions tests for API that needs to be enforced by Application Permissions to create and edit alerts/subscriptions."
  (:require
   [clojure.test :refer :all]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.core :as perms]
   [metabase.permissions.test-util :as perms.test-util]
   [metabase.pulse.send :as pulse.send]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defmacro ^:private with-subscription-disabled-for-all-users!
  "Temporarily remove `subscription` permission for group `All Users`, execute `body` then re-grant it.
  Use it when we need to isolate a user's permissions during tests."
  [& body]
  `(try
     (perms/revoke-application-permissions! (perms/all-users-group) :subscription)
     ~@body
     (finally
       (perms/grant-application-permissions! (perms/all-users-group) :subscription))))

(deftest pulse-permissions-test
  (testing "/api/pulse/*"
    (with-subscription-disabled-for-all-users!
      (mt/with-user-in-groups [group {:name "New Group"}
                               user [group]]
        (mt/with-temp [:model/Card card {:dataset_query (mt/mbql-query products
                                                          {:aggregation [[:sum $price]
                                                                         [:avg $price]]
                                                           :breakout    [$category
                                                                         !year.created_at]})}
                       :model/Pulse pulse {:creator_id (u/the-id user)}]
          (let [pulse-default {:name     "A Pulse"
                               :cards    [{:id          (:id card)
                                           :include_csv true
                                           :include_xls false}]
                               :channels [{:enabled       true
                                           :channel_type  "email"
                                           :schedule_type "daily"
                                           :schedule_hour 12
                                           :recipients    []}]}
                create-pulse (fn [status]
                               (testing "create pulse"
                                 (mt/user-http-request user :post status "pulse"
                                                       pulse-default)))
                update-pulse (fn [status]
                               (testing "update pulse"
                                 (mt/user-http-request user :put status (format "pulse/%d" (:id pulse))
                                                       (merge pulse-default {:name "New Name"}))))
                get-form     (fn [status]
                               (testing "get form input"
                                 (mt/user-http-request user :get status "pulse/form_input")))]
            (testing "user's group has no subscription permissions"
              (perms/revoke-application-permissions! group :subscription)
              (testing "should succeed if `advanced-permissions` is disabled"
                (mt/with-premium-features #{}
                  (create-pulse 200)
                  (update-pulse 200)
                  (get-form 200)))

              (testing "should fail if `advanced-permissions` is enabled"
                (mt/with-premium-features #{:advanced-permissions}
                  (create-pulse 403)
                  (update-pulse 403)
                  (get-form 403))))

            (testing "User's group with subscription permission"
              (perms/grant-application-permissions! group :subscription)
              (mt/with-premium-features #{:advanced-permissions}
                (testing "should succeed if `advanced-permissions` is enabled"
                  (create-pulse 200)
                  (update-pulse 200)
                  (get-form 200))))))))))

(deftest send-time-attachment-perm-drift-test
  (testing "Subscription attachments are gated by the subscription creator's send-time download perms (GH #71696)"
    ;; Regression test for PR #66827. The bug: result-attachment used (:creator_id card) — the card author —
    ;; instead of the subscription creator. The check must use the subscription creator at send time so that
    ;; perm drift between save time and send time is honored, and so the card author's perms (which are
    ;; unrelated to the subscription) don't accidentally gate every subscription using their cards.
    ;;
    ;; with-restored-data-perms! is required because this test mutates the All Users group perms,
    ;; which would otherwise leak into subsequent tests in the same namespace.
    (mt/with-premium-features #{:advanced-permissions}
      (perms.test-util/with-restored-data-perms!
        (notification.tu/with-notification-testing-setup!
          (notification.tu/with-channel-fixtures [:channel/email]
            (mt/with-temp [:model/User                       {sub-creator-id :id} {:email "drift@example.com"}
                           :model/PermissionsGroup           {group-id :id}       {}
                           :model/PermissionsGroupMembership _                    {:user_id sub-creator-id :group_id group-id}]
            ;; Subscription creator initially has full download perms on the products table.
            ;; The card is authored by crowberto (admin) — never the subscription creator.
              (perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
              (perms/set-table-permission! group-id (mt/id :products) :perms/create-queries :query-builder)
              (perms/set-table-permission! group-id (mt/id :products) :perms/download-results :one-million-rows)
              (mt/with-temp [:model/Dashboard    {dash-id :id}              {:name "drift-test-dashboard"}
                             :model/Card         {card-id :id}              {:creator_id    (mt/user->id :crowberto)
                                                                             :dataset_query (mt/mbql-query products {:limit 5})}
                             :model/DashboardCard {dashcard-id :id}         {:dashboard_id dash-id
                                                                             :card_id      card-id
                                                                             :row          0
                                                                             :col          0}
                             :model/Pulse        {pulse-id :id, :as pulse}  {:creator_id   sub-creator-id
                                                                             :name         "drift-test-pulse"
                                                                             :dashboard_id dash-id}
                             :model/PulseCard    _                          {:pulse_id          pulse-id
                                                                             :card_id           card-id
                                                                             :dashboard_card_id dashcard-id
                                                                             :position          0
                                                                             :include_csv       true}
                             :model/PulseChannel {pc-id :id}                {:pulse_id     pulse-id
                                                                             :channel_type "email"
                                                                             :details      {}}
                             :model/PulseChannelRecipient _                 {:user_id          sub-creator-id
                                                                             :pulse_channel_id pc-id}]
                (letfn [(csv-attachments-of [captured]
                          (->> (get captured :channel/email)
                               (mapcat :message)
                               (filter #(= "text/csv" (:content-type %)))))]
                  (testing "subscription creator with full download perms → CSV attachment included"
                    (let [captured (notification.tu/with-captured-channel-send!
                                     (pulse.send/send-pulse! pulse))]
                      (is (seq (csv-attachments-of captured))
                          "expected at least one CSV attachment when subscription creator has full perms")))
                  (testing "after subscription creator's perms drift to :no → CSV attachment is dropped"
                  ;; Must revoke from BOTH the user's group AND the All Users group, since the user
                  ;; is implicitly in All Users and download-perms-level takes the max across groups.
                    (perms/set-table-permission! group-id (mt/id :products) :perms/download-results :no)
                    (perms/set-table-permission! (perms/all-users-group) (mt/id :products) :perms/download-results :no)
                    (let [captured (notification.tu/with-captured-channel-send!
                                     (pulse.send/send-pulse! pulse))]
                      (is (empty? (csv-attachments-of captured))
                          "expected CSV attachment to be dropped after subscription creator's perms drift to :no"))))))))))))
