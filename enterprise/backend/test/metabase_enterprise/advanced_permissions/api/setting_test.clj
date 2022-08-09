(ns metabase-enterprise.advanced-permissions.api.setting-test
  "Permisisons tests for API that needs to be enforced by Application Permissions to access Admin/Setting pages."
  (:require [clojure.test :refer :all]
            [metabase.api.geojson-test :as geojson-test]
            [metabase.api.ldap-test :as ldap-test]
            [metabase.email :as email]
            [metabase.integrations.slack :as slack]
            [metabase.models :refer [Card Dashboard]]
            [metabase.models.permissions :as perms]
            [metabase.models.setting-test :as models.setting-test]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.integrations.ldap :as ldap.test])
  (:import java.util.UUID))

(use-fixtures :once (fixtures/initialize :db))

(deftest setting-api-test
  (testing "/api/setting"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user  [group]]
      (letfn [(get-setting [user status]
                (testing (format "get setting with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "setting")))

              (update-setting [user status]
                (testing (format "update single setting with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :put status "setting/test-setting-1" {:value "ABC"})))

              (update-settings [user status]
                (testing (format "update multiple settings setting with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :put status "setting" {:test-setting-1 "ABC", :test-setting-2 "DEF"})))]
        ;; we focus on permissions in these tests, so set default value to make it easier to test
        (models.setting-test/test-setting-1! "ABC")
        (models.setting-test/test-setting-2! "DEF")

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
              (perms/grant-application-permissions! group :setting)
              (get-setting user 200)
              (update-setting user 204)
              (update-settings user 204))))))))

(deftest email-api-test
  (testing "/api/email"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(set-email-setting [user status]
                (testing (format "set email setting with %s user" (mt/user-descriptor user))
                  (with-redefs [email/test-smtp-settings (constantly {::email/error nil})]
                    (mt/user-http-request user :put status "email" {:email-smtp-host     "foobar"
                                                                    :email-smtp-port     "789"
                                                                    :email-smtp-security :tls
                                                                    :email-smtp-username "munchkin"
                                                                    :email-smtp-password "gobble gobble"
                                                                    :email-from-address  "eating@hungry.com"
                                                                    :email-from-name     "Eating"
                                                                    :email-reply-to      ["reply-to@hungry.com"]}))))
              (delete-email-setting [user status]
                (testing (format "delete email setting with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :delete status "email")))

              (send-test-email [user status]
                (mt/with-temporary-setting-values [email-from-address "notifications@metabase.com"]
                  (mt/with-fake-inbox
                    (testing (format "send test email with %s user" (mt/user-descriptor user))
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
              (perms/grant-application-permissions! group :setting)
              (set-email-setting user 200)
              (delete-email-setting user 204)
              (send-test-email user 200))))))))

(deftest slack-api-test
  (testing "/api/slack"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(set-slack-settings [user status]
                (testing (format "set slack setting with %s user" (mt/user-descriptor user))
                  (with-redefs [slack/valid-token? (constantly true)
                                slack/channel-exists? (constantly true)
                                slack/refresh-channels-and-usernames! (constantly true)
                                slack/refresh-channels-and-usernames-when-needed! (constantly true)]
                    (mt/with-temporary-setting-values [slack-app-token nil
                                                       slack-token     "fake-token"]
                      (mt/user-http-request user :put status "slack/settings" {:slack-app-token "fake-token"})))))

              (get-manifest [user status]
                (testing (format "get slack manifest %s user" (mt/user-descriptor user))
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
              (perms/grant-application-permissions! group :setting)
              (set-slack-settings user 200)
              (get-manifest user 200)
              (set-slack-settings :crowberto 200)
              (get-manifest :crowberto 200))))))))

(deftest ldap-api-test
  (testing "/api/ldap"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(update-ldap-settings [user status]
                (testing (format "update ldap settings with %s user" (mt/user-descriptor user))
                  (ldap.test/with-ldap-server
                    (mt/user-http-request user :put status "ldap/settings"
                                          (ldap-test/ldap-test-details)))))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (update-ldap-settings user 403)
            (update-ldap-settings :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (update-ldap-settings user 403)
              (update-ldap-settings :crowberto 200))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-application-permissions! group :setting)
              (update-ldap-settings user 200)
              (update-ldap-settings :crowberto 200))))))))


(deftest geojson-api-test
  (testing "/api/geojson"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-geojson [user status]
                (testing (format "get geojson with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "geojson"
                                        :url geojson-test/test-geojson-url)))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-geojson user 403)
            (get-geojson :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (get-geojson user 403)
              (get-geojson :crowberto 200))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-application-permissions! group :setting)
              (get-geojson user 200)
              (get-geojson :crowberto 200))))))))

(deftest permissions-group-api-test
  (testing "/api/permissions"
    (mt/with-user-in-groups
      [group {:name "New Group"}
       user  [group]]
      (letfn [(get-permission-groups [user status]
                (testing (format "get permission groups with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :get status "permissions/group")))]

        (testing "if `advanced-permissions` is disabled, require admins"
          (premium-features-test/with-premium-features #{}
            (get-permission-groups user 403)
            (get-permission-groups :crowberto 200)))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission"
              (get-permission-groups user 403)
              (get-permission-groups :crowberto 200))

            (testing "succeed if user's group has `setting` permission"
              (perms/grant-application-permissions! group :setting)
              (get-permission-groups user 200)
              (get-permission-groups :crowberto 200))))))))

(deftest dashboard-api-test
  (testing "/api/dashboard"
    (mt/with-temporary-setting-values [enable-public-sharing true
                                       enable-embedding      true]
      (mt/with-user-in-groups
        [group {:name "New Group"}
         user  [group]]
        (letfn [(get-public-dashboards [user status]
                  (testing (format "get public dashboards with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get status "dashboard/public")))

                (get-embeddable-dashboards [user status]
                  (testing (format "get embeddable dashboards with %s user" (mt/user-descriptor user))
                    (mt/with-temp Dashboard [_ {:enable_embedding true}]
                      (mt/user-http-request user :get status "dashboard/embeddable"))))

                (delete-public-dashboard [user status]
                  (testing (format "delete public dashboard with %s user" (mt/user-descriptor user))
                    (mt/with-temp Dashboard [{dashboard-id :id} {:public_uuid       (str (UUID/randomUUID))
                                                                 :made_public_by_id (mt/user->id :crowberto)}]
                      (mt/user-http-request user :delete status (format "dashboard/%d/public_link" dashboard-id)))))]

          (testing "if `advanced-permissions` is disabled, require admins,"
            (premium-features-test/with-premium-features #{}
              (get-public-dashboards user 403)
              (get-embeddable-dashboards user 403)
              (delete-public-dashboard user 403)
              (get-embeddable-dashboards :crowberto 200)
              (delete-public-dashboard :crowberto 204)))

          (testing "if `advanced-permissions` is enabled,"
            (premium-features-test/with-premium-features #{:advanced-permissions}
              (testing "still fail if user's group doesn't have `setting` permission"
                (get-public-dashboards user 403)
                (get-embeddable-dashboards user 403)
                (delete-public-dashboard user 403)
                (get-public-dashboards :crowberto 200)
                (delete-public-dashboard :crowberto 204))

              (testing "succeed if user's group has `setting` permission,"
                (perms/grant-application-permissions! group :setting)
                (get-public-dashboards user 200)
                (get-embeddable-dashboards user 200)
                (delete-public-dashboard user 204)))))))))

(deftest card-api-test
  (testing "/api/card"
    (mt/with-temporary-setting-values [enable-public-sharing true
                                       enable-embedding      true]
      (mt/with-user-in-groups
        [group {:name "New Group"}
         user  [group]]
        (letfn [(get-public-cards [user status]
                  (testing (format "get public cards with %s user" (mt/user-descriptor user))
                    (mt/user-http-request user :get status "card/public")))

                (get-embeddable-cards [user status]
                  (testing (format "get embeddable dashboards with %s user" (mt/user-descriptor user))
                    (mt/with-temp Card[_ {:enable_embedding true}]
                      (mt/user-http-request user :get status "card/embeddable"))))

                (delete-public-card [user status]
                  (testing (format "delete public card with %s user" (mt/user-descriptor user))
                    (mt/with-temp Card [{card-id :id} {:public_uuid       (str (UUID/randomUUID))
                                                       :made_public_by_id (mt/user->id :crowberto)}]
                      (mt/user-http-request user :delete status (format "card/%d/public_link" card-id)))))]

          (testing "if `advanced-permissions` is disabled, require admins,"
            (premium-features-test/with-premium-features #{}
              (get-public-cards user 403)
              (get-embeddable-cards user 403)
              (delete-public-card user 403)
              (get-public-cards :crowberto 200)
              (get-embeddable-cards :crowberto 200)
              (delete-public-card :crowberto 204)))

          (testing "if `advanced-permissions` is enabled"
            (premium-features-test/with-premium-features #{:advanced-permissions}
              (testing "still fail if user's group doesn't have `setting` permission,"
                (get-public-cards user 403)
                (get-embeddable-cards user 403)
                (delete-public-card user 403)
                (get-public-cards :crowberto 200)
                (get-embeddable-cards :crowberto 200)
                (delete-public-card :crowberto 204))

              (testing "succeed if user's group has `setting` permission,"
                (perms/grant-application-permissions! group :setting)
                (get-public-cards user 200)
                (get-embeddable-cards user 200)
                (delete-public-card user 204)))))))))

(deftest persistence-test
  (testing "/api/persist"
    (mt/with-user-in-groups [group {:name "New Group"}
                             user [group]]
      (letfn [(enable-persist [user status]
                (testing (format "persist/enable with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :post status "persist/enable")))
              (disable-persist [user status]
                (testing (format "persist/disable with %s user" (mt/user-descriptor user))
                  (mt/user-http-request user :post status "persist/disable")))
              (set-interval [user status]
                (testing (format "persist/set-refresh-schedule with %s user"
                                 (mt/user-descriptor user))
                  (mt/user-http-request user :post status
                                        "persist/set-refresh-schedule"
                                        {"cron" "0 0 0/1 * * ? *"})))]

        (testing "if `advanced-permissions` is disabled, require admins,"
          (enable-persist :crowberto 204)
          (enable-persist user 403)
          (enable-persist :rasta 403)

          (disable-persist :crowberto 204)
          (disable-persist user 403)
          (disable-persist :rasta 403)

          (set-interval :crowberto 204)
          (set-interval user 403)
          (set-interval :rasta 403))

        (testing "if `advanced-permissions` is enabled"
          (premium-features-test/with-premium-features #{:advanced-permissions}
            (testing "still fail if user's group doesn't have `setting` permission,"
              (enable-persist :crowberto 204)
              (enable-persist user 403)
              (enable-persist :rasta 403)

              (disable-persist :crowberto 204)
              (disable-persist user 403)
              (disable-persist :rasta 403)

              (set-interval :crowberto 204)
              (set-interval user 403)
              (set-interval :rasta 403))

            (testing "succeed if user's group has `setting` permission,"
              (perms/grant-application-permissions! group :setting)
              (enable-persist :crowberto 204)
              (enable-persist user 204)
              (enable-persist :rasta 403)

              (disable-persist :crowberto 204)
              (disable-persist user 204)
              (disable-persist :rasta 403)

              (set-interval :crowberto 204)
              (set-interval user 204)
              (set-interval :rasta 403))))))))
