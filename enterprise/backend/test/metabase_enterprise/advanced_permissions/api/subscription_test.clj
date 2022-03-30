(ns metabase-enterprise.advanced-permissions.api.subscription-test
  "Permisisons tests for API that needs to be enforced by General Permissions to create and edit alerts/subscriptions."
  (:require [clojure.test :refer :all]
            [metabase.models :refer [Card Collection Pulse]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.util :as u]))

(defmacro ^:private with-subscription-disabled-for-all-users
  "Temporarily remove `subscription` permission for group `All Users`, execute `body` then re-grant it.
  Use it when we need to isolate a user's permissions during tests."
  [& body]
  `(try
    (perms/revoke-general-permissions! (group/all-users) :subscription)
    ~@body
    (finally
     (perms/grant-general-permissions! (group/all-users) :subscription))))

(deftest pulse-permissions-test
  (testing "/api/pulse/*"
    (with-subscription-disabled-for-all-users
     (mt/with-user-in-groups
       [group {:name "New Group"}
        user  [group]]
       (mt/with-temp*
         [Card  [card]
          Pulse [pulse]]
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
             (perms/revoke-general-permissions! group :subscription)
             (testing "should succeed if `advanced-permissions` is disabled"
               (premium-features-test/with-premium-features #{}
                 (create-pulse 200)
                 (update-pulse 200)
                 (get-form 200)))

             (testing "should fail if `advanced-permissions` is enabled"
               (premium-features-test/with-premium-features #{:advanced-permissions}
                 (create-pulse 403)
                 (update-pulse 403)
                 (get-form 403))))

           (testing "User's group with subscription permission"
             (perms/grant-general-permissions! group :subscription)
             (premium-features-test/with-premium-features #{:advanced-permissions}
               (testing "should succeed if `advanced-permissions` is enabled"
                 (create-pulse 200)
                 (update-pulse 200)
                 (get-form 200))))))))))

(deftest alert-permissions-test
  (testing "/api/alert/*"
    (with-subscription-disabled-for-all-users
     (mt/with-user-in-groups
       [group {:name "New Group"}
        user  [group]]
       (mt/with-temp*
         [Card  [card {:creator_id (:id user)}]
          Collection [collection]]
         (let [alert-default {:card             {:id                (:id card)
                                                 :include_csv       true
                                                 :include_xls       false
                                                 :dashboard_card_id nil}
                              :alert_condition  "rows"
                              :alert_first_only true
                              :channels         [{:enabled       true
                                                  :channel_type  "email"
                                                  :schedule_type "daily"
                                                  :schedule_hour 12
                                                  :recipients    []}]}
               create-alert (fn [status]
                              (testing "create alert"
                                (mt/user-http-request user :post status "alert"
                                                      alert-default)))
               user-alert   (premium-features-test/with-premium-features #{:advanced-permissions}
                              (perms/grant-general-permissions! group :subscription)
                              (u/prog1 (create-alert 200)
                                       (perms/revoke-general-permissions! group :subscription)))
               update-alert (fn [status]
                              (testing "update alert"
                                (mt/user-http-request user :put status (format "alert/%d" (:id user-alert))
                                                      (dissoc (merge alert-default {:alert_condition "goal"})
                                                              :channels))))]
           (testing "user's group has no subscription permissions"
             (perms/revoke-general-permissions! group :subscription)
             (testing "should succeed if `advanced-permissions` is disabled"
               (premium-features-test/with-premium-features #{}
                 (create-alert 200)
                 (update-alert 200)))

             (testing "should fail if `advanced-permissions` is enabled"
               (premium-features-test/with-premium-features #{:advanced-permissions}
                 (create-alert 403)
                 (update-alert 403))))

           (testing "User's group with subscription permission"
             (perms/grant-general-permissions! group :subscription)
             (premium-features-test/with-premium-features #{:advanced-permissions}
               (testing "should succeed if `advanced-permissions` is enabled"
                 (create-alert 200)
                 (update-alert 200))))))))))
