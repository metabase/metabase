(ns metabase-enterprise.advanced-permissions.api.subscription-test
  "Permissions tests for API that needs to be enforced by Application Permissions to create and edit alerts/subscriptions."
  (:require
   [clojure.test :refer :all]
   [metabase.permissions.core :as perms]
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
                                 (mt/user-http-request user :get status "pulse/form_input")))
                test-pulse   (fn [status]
                               (testing "test send pulse"
                                 (mt/user-http-request user :post status "pulse/test"
                                                       pulse-default)))]
            (testing "user's group has no subscription permissions"
              (perms/revoke-application-permissions! group :subscription)
              (testing "should succeed if `advanced-permissions` is disabled"
                (mt/with-premium-features #{}
                  (create-pulse 200)
                  (update-pulse 200)
                  (get-form 200)
                  (test-pulse 200)))

              (testing "should fail if `advanced-permissions` is enabled"
                (mt/with-premium-features #{:advanced-permissions}
                  (create-pulse 403)
                  (update-pulse 403)
                  (get-form 403)
                  (test-pulse 403))))

            (testing "User's group with subscription permission"
              (perms/grant-application-permissions! group :subscription)
              (mt/with-premium-features #{:advanced-permissions}
                (testing "should succeed if `advanced-permissions` is enabled"
                  (create-pulse 200)
                  (update-pulse 200)
                  (get-form 200)
                  (test-pulse 200))))))))))

(deftest pulse-raw-email-recipient-diff-test
  (testing "PUT /api/pulse/:id — adding a raw-email recipient requires subscription permissions, also when the
            channel already has other raw-email recipients"
    (with-subscription-disabled-for-all-users!
      (mt/with-user-in-groups [group {:name "New Group"}
                               user  [group]]
        (mt/with-temp [:model/Pulse        pulse {:creator_id (u/the-id user)}
                       :model/PulseChannel _     {:pulse_id      (:id pulse)
                                                  :channel_type  :email
                                                  :schedule_type :daily
                                                  :schedule_hour 12
                                                  :enabled       true
                                                  :details       {:emails ["old@external.com"]}}]
          ;; :monitoring passes the endpoint's top-level gate; without :subscription the user may update the
          ;; pulse but must not be able to add recipients
          (perms/grant-application-permissions! group :monitoring)
          (mt/with-premium-features #{:advanced-permissions}
            (let [update-recipients (fn [status recipients]
                                      (mt/user-http-request user :put status (format "pulse/%d" (:id pulse))
                                                            {:channels [{:enabled       true
                                                                         :channel_type  "email"
                                                                         :schedule_type "daily"
                                                                         :schedule_hour 12
                                                                         :recipients    recipients}]}))]
              (testing "keeping the existing raw-email recipient is allowed"
                (update-recipients 200 [{:email "old@external.com"}]))
              (testing "adding a new raw-email recipient is rejected"
                (update-recipients 403 [{:email "old@external.com"}
                                        {:email "new@external.com"}])))))))))
