(ns metabase-enterprise.audit-app.api.user-test
  (:require
   [clojure.test :refer :all]
   [metabase.models :refer [Card Dashboard DashboardCard Pulse PulseCard PulseChannel PulseChannelRecipient User]]
   [metabase.public-settings.premium-features-test :as premium-features-test]
   [metabase.test :as mt]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest delete-subscriptions-test
  (testing "DELETE /api/ee/audit-app/user/:id/subscriptions"
    (testing "Should require a token with `:audit-app`"
      (premium-features-test/with-premium-features #{}
        (t2.with-temp/with-temp [User {user-id :id}]
          (is (= "This API endpoint is only enabled if you have a premium token with the :audit-app feature."
                 (mt/user-http-request user-id
                                       :delete 402
                                       (format "ee/audit-app/user/%d/subscriptions" user-id)))))))

    (premium-features-test/with-premium-features #{:audit-app}
      (doseq [run-type [:admin :non-admin]]
        (mt/with-temp* [User                  [{user-id :id}]
                        Card                  [{card-id :id}]
                        ;; Alert, created by a different User
                        Pulse                 [{alert-id :id}         {:alert_condition  "rows"
                                                                       :alert_first_only false
                                                                       :name             nil}]
                        PulseCard             [_                      {:pulse_id alert-id
                                                                       :card_id  card-id}]
                        PulseChannel          [{alert-chan-id :id}    {:pulse_id alert-id}]
                        PulseChannelRecipient [_                      {:user_id          user-id
                                                                       :pulse_channel_id alert-chan-id}]
                        ;; DashboardSubscription, created by this User; multiple recipients
                        Dashboard             [{dashboard-id :id}]
                        DashboardCard         [{dashcard-id :id}      {:dashboard_id dashboard-id
                                                                       :card_id      card-id}]
                        Pulse                 [{dash-sub-id :id}      {:dashboard_id dashboard-id
                                                                       :creator_id   user-id}]
                        PulseCard             [_                      {:pulse_id          dash-sub-id
                                                                       :card_id           card-id
                                                                       :dashboard_card_id dashcard-id}]
                        PulseChannel          [{dash-sub-chan-id :id} {:pulse_id dash-sub-id}]
                        PulseChannelRecipient [_                      {:user_id          user-id
                                                                       :pulse_channel_id dash-sub-chan-id}]
                        PulseChannelRecipient [_                      {:user_id          (mt/user->id :rasta)
                                                                       :pulse_channel_id dash-sub-chan-id}]]
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
