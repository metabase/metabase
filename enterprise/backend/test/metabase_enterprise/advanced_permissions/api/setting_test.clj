(ns metabase-enterprise.advanced-permissions.api.setting-test
  "Permisisons tests for API that needs to be enforced by General Permissions to access Admin/Setting pages."
  (:require [clojure.test :refer :all]
            [metabase.email :as email]
            [metabase.integrations.slack :as slack]
            [metabase.models.permissions :as perms]
            [metabase.models.setting-test :refer [test-setting-1 test-setting-2]]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(defn- user->name
  [user]
  (if (map? user) "non-admin" (name user)))

(deftest setting-api-test
  (testing "/api/setting"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-setting [user status]
                (testing (format "get setting with %s user" (user->name user))
                  (mt/user-http-request user :get status "setting")))

              (update-setting [user status]
                (testing (format "update single setting with %s user" (user->name user))
                  (mt/user-http-request user :put status "setting/test-setting-1" {:value "ABC"})))

              (update-settings [user status]
                (testing (format "update multiple settings setting with %s user" (user->name user))
                  (mt/user-http-request user :put status "setting" {:test-setting-1 "ABC", :test-setting-2 "DEF"})))]
        ;; we focus on permissions in these tests, so set default value to make it easier to test
        (test-setting-1 "ABC")
        (test-setting-2 "DEF")

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-setting user 403)
            (update-setting user 403)
            (update-settings user 403)
            (get-setting :crowberto 200)
            (update-setting :crowberto 204)
            (update-settings :crowberto 204)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (get-setting user 403)
              (update-setting user 403)
              (update-settings user 403)
              (get-setting :crowberto 200)
              (update-setting :crowberto 204)
              (update-settings :crowberto 204))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-general-permissions! group :setting)
              (get-setting user 200)
              (update-setting user 204)
              (update-settings user 204)
              (get-setting :crowberto 200)
              (update-setting :crowberto 204)
              (update-settings :crowberto 204))))))))

(deftest email-api-test
  (testing "/api/email"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(set-email-setting [user status]
                (testing (format "set email setting with %s user" (user->name user))
                  (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                    (mt/user-http-request user :put status "email" {:email-smtp-host     "foobar"
                                                                    :email-smtp-port     "789"
                                                                    :email-smtp-security :tls
                                                                    :email-smtp-username "munchkin"
                                                                    :email-smtp-password "gobble gobble"
                                                                    :email-from-address  "eating@hungry.com"}))))

              (delete-email-setting [user status]
                (testing (format "delete email setting with %s user" (user->name user))
                  (mt/user-http-request user :delete status "email")))

              (send-test-email [user status]
                (mt/with-temporary-setting-values [email-from-address "notifications@metabase.com"]
                  (mt/with-fake-inbox
                    (testing (format "send test email with %s user" (user->name user))
                      (mt/user-http-request user :post status "email/test")))))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (set-email-setting user 403)
            (delete-email-setting user 403)
            (send-test-email user 403)
            (set-email-setting :crowberto 200)
            (delete-email-setting :crowberto 204)
            (send-test-email :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (set-email-setting user 403)
              (delete-email-setting user 403)
              (send-test-email user 403)
              (set-email-setting :crowberto 200)
              (delete-email-setting :crowberto 204)
              (send-test-email :crowberto 200))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-general-permissions! group :setting)
              (set-email-setting user 200)
              (delete-email-setting user 204)
              (send-test-email user 200)
              (set-email-setting :crowberto 200)
              (delete-email-setting :crowberto 204)
              (send-test-email :crowberto 200))))))))

(deftest slack-api-test
  (testing "/api/slack"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(set-slack-settings [user status]
                (testing (format "set slack setting with %s user" (user->name user))
                  (with-redefs [slack/valid-token? (constantly true)
                                slack/channel-exists? (constantly true)
                                slack/refresh-channels-and-usernames! (constantly true)
                                slack/refresh-channels-and-usernames-when-needed! (constantly true)]
                    (mt/with-temporary-setting-values [slack-app-token nil
                                                       slack-token     "fake-token"]
                      (mt/user-http-request user :put status "slack/settings" {:slack-app-token "fake-token"})))))

              (get-manifest [user status]
                (testing (format "get slack manifest %s user" (user->name user))
                  (mt/user-http-request user :get status "slack/manifest" )))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (set-slack-settings user 403)
            (get-manifest user 403)
            (set-slack-settings :crowberto 200)
            (get-manifest :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (set-slack-settings user 403)
              (get-manifest user 403)
              (set-slack-settings :crowberto 200)
              (get-manifest :crowberto 200))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-general-permissions! group :setting)
              (set-slack-settings user 200)
              (get-manifest user 200)
              (set-slack-settings :crowberto 200)
              (get-manifest :crowberto 200))))))))
