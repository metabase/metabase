(ns ^:mb/once metabase-enterprise.audit-app.api.user-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.audit-app.permissions-test :as ee-perms-test]
   [metabase.audit :as audit]
   [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard
                            PulseChannel PulseChannelRecipient User]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db))

(deftest delete-subscriptions-test
  (testing "DELETE /api/ee/audit-app/user/:id/subscriptions"
    (testing "Should require a token with `:audit-app`"
      (mt/with-premium-features #{}
        (t2.with-temp/with-temp [User {user-id :id}]
          (is (= "Audit app is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
                 (mt/user-http-request user-id
                                       :delete 402
                                       (format "ee/audit-app/user/%d/subscriptions" user-id)))))))

    (mt/with-premium-features #{:audit-app}
      (doseq [run-type [:admin :non-admin]]
        (mt/with-temp [User                  {user-id :id} {}
                       Card                  {card-id :id} {}
                       ;; Alert, created by a different User
                       Pulse                 {alert-id :id}         {:alert_condition  "rows"
                                                                     :alert_first_only false
                                                                     :name             nil}
                       PulseCard             _                      {:pulse_id alert-id
                                                                     :card_id  card-id}
                       PulseChannel          {alert-chan-id :id}    {:pulse_id alert-id}
                       PulseChannelRecipient _                      {:user_id          user-id
                                                                     :pulse_channel_id alert-chan-id}
                       ;; DashboardSubscription, created by this User; multiple recipients
                       Dashboard             {dashboard-id :id}      {}
                       DashboardCard         {dashcard-id :id}      {:dashboard_id dashboard-id
                                                                     :card_id      card-id}
                       Pulse                 {dash-sub-id :id}      {:dashboard_id dashboard-id
                                                                     :creator_id   user-id}
                       PulseCard             _                      {:pulse_id          dash-sub-id
                                                                     :card_id           card-id
                                                                     :dashboard_card_id dashcard-id}
                       PulseChannel          {dash-sub-chan-id :id} {:pulse_id dash-sub-id}
                       PulseChannelRecipient _                      {:user_id          user-id
                                                                     :pulse_channel_id dash-sub-chan-id}
                       PulseChannelRecipient _                      {:user_id          (mt/user->id :rasta)
                                                                     :pulse_channel_id dash-sub-chan-id}]
          (letfn [(describe-objects []
                    {:num-subscriptions                (t2/count PulseChannelRecipient :user_id user-id)
                     :alert-archived?                  (t2/select-one-fn :archived Pulse :id alert-id)
                     :dashboard-subscription-archived? (t2/select-one-fn :archived Pulse :id dash-sub-id)})
                  (api-delete-subscriptions! [request-user-name-or-id expected-status-code]
                    (mt/user-http-request request-user-name-or-id
                                          :delete expected-status-code
                                          (format "ee/audit-app/user/%d/subscriptions" user-id)))]
            (testing "Sanity check: User should have 2 subscriptions (1 Alert, 1 DashboardSubscription)"
              (is (= {:num-subscriptions                2
                      :alert-archived?                  false
                      :dashboard-subscription-archived? false}
                     (describe-objects))))
            (case run-type
              :non-admin
              (testing "Non-admin"
                (testing "should not be allowed to delete all subscriptions for another User"
                  (is (= "You don't have permissions to do that."
                         (api-delete-subscriptions! :rasta 403)))
                  (is (= {:num-subscriptions                2
                          :alert-archived?                  false
                          :dashboard-subscription-archived? false}
                         (describe-objects))))
                (testing "should be allowed to delete all subscriptions for themselves."
                  (is (nil? (api-delete-subscriptions! user-id 204)))
                  (testing (str "\nAlert should get archived because this User was the last subscriber."
                                "\nDashboardSubscription should get archived because this User created it.")
                    (is (= {:num-subscriptions                0
                            :alert-archived?                  true
                            :dashboard-subscription-archived? true}
                           (describe-objects))))))

              :admin
              (testing "Admin should be allowed to delete all subscriptions for another User"
                (is (nil? (api-delete-subscriptions! :crowberto 204)))
                (testing "\nAlert and DashboardSubscription should have gotten archived as well"
                  (is (= {:num-subscriptions                0
                          :alert-archived?                  true
                          :dashboard-subscription-archived? true}
                         (describe-objects))))))))))))

(deftest get-audit-info-test
  (testing "GET /api/ee/audit-app/user/audit-info"
    (mt/with-premium-features #{:audit-app}
      (ee-perms-test/install-audit-db-if-needed!)
      (testing "None of the ids show up when perms aren't given"
        (perms/revoke-collection-permissions! (perms-group/all-users) (audit/default-custom-reports-collection))
        (perms/revoke-collection-permissions! (perms-group/all-users) (audit/default-audit-collection))
        (is (= #{}
               (->>
                (mt/user-http-request :rasta :get 200 "/ee/audit-app/user/audit-info")
                keys
                (into #{})))))
      (testing "Custom reports collection shows up when perms are given"
        (perms/grant-collection-read-permissions! (perms-group/all-users) (audit/default-custom-reports-collection))
        (is (= #{:custom_reports}
               (->>
                (mt/user-http-request :rasta :get 200 "/ee/audit-app/user/audit-info")
                keys
                (into #{})))))
      (testing "Everything shows up when all perms are given"
        (perms/grant-collection-read-permissions! (perms-group/all-users) (audit/default-audit-collection))
        (is (= #{:question_overview :dashboard_overview :custom_reports}
               (->>
                (mt/user-http-request :rasta :get 200 "/ee/audit-app/user/audit-info")
                keys
                (into #{}))))))))
