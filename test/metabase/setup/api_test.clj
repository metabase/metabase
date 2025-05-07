(ns metabase.setup.api-test
  "Tests for /api/setup endpoints."
  (:require
   [clojure.spec.alpha :as s]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.analytics.snowplow-test :as snowplow-test]
   [metabase.config :as config]
   [metabase.driver.h2 :as h2]
   [metabase.events :as events]
   [metabase.http-client :as client]
   [metabase.notification.test-util :as notification.tu]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.settings.core :as setting]
   [metabase.settings.deprecated-grab-bag :as public-settings]
   [metabase.settings.models.setting.cache-test :as setting.cache-test]
   [metabase.setup.api :as api.setup]
   [metabase.setup.core :as setup]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as string]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; make sure the default test users are created before running these tests, otherwise we're going to run into issues
;; if it attempts to delete this user and it is the only admin test user
(use-fixtures :once (fixtures/initialize :test-users :notifications))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  POST /setup                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-setup!* [request-body thunk]
  (try
    (mt/discard-setting-changes [site-name site-locale anon-tracking-enabled admin-email]
      (thunk))
    (finally
      (t2/delete! :model/User :email (get-in request-body [:user :email]))
      (when-let [invited (get-in request-body [:invite :name])]
        (t2/delete! :model/User :email invited))
      (when-let [db-name (get-in request-body [:database :name])]
        (t2/delete! :model/Database :name db-name)))))

(defn- default-setup-input []
  {:token (setup/create-token!)
   :prefs {:site_name "Metabase Test"
           :site_locale "en"}
   :user  {:first_name (mt/random-name)
           :last_name  (mt/random-name)
           :email      (mt/random-email)
           :password   "anythingUP12!"}})

(defn- do-with-setup! [request-body thunk]
  (let [request-body (merge-with merge (default-setup-input) request-body)]
    (do-with-setup!*
     request-body
     (fn []
       (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true
                     h2/*allow-testing-h2-connections*                       true]
         (testing "API response should return a Session UUID"
           (is (=? {:id string/valid-uuid?}
                   (client/client :post 200 "setup" request-body))))
         ;; reset our setup token
         (setup/create-token!)
         (thunk))))))

(defmacro ^:private with-setup! [request-body & body]
  `(do-with-setup! ~request-body (fn [] ~@body)))

(deftest create-superuser-test
  (testing "POST /api/setup"
    (testing "Check that we can create a new superuser via setup-token"
      (mt/with-premium-features #{:audit-app}
        (let [email (mt/random-email)]
          (with-setup! {:user {:email email}}
            (testing "new User should be created"
              (is (t2/exists? :model/User :email email)))
            (testing "Creating a new admin user should set the `admin-email` Setting"
              (is (= email (public-settings/admin-email))))
            (testing "Should record :user-joined in the Audit Log (#12933)"
              (let [user-id (u/the-id (t2/select-one :model/User :email email))]
                (is (= {:topic    :user-joined
                        :model_id user-id
                        :user_id  user-id
                        :model    "User"
                        :details  {}}
                       (mt/latest-audit-log-entry :user-joined user-id)))))))))))

(deftest invite-user-test
  (testing "POST /api/setup"
    (testing "Check that a second admin can be created during setup, and that an invite email is sent successfully and
             a Snowplow analytics event is sent"
      (mt/with-premium-features #{:audit-app}
        (notification.tu/with-send-notification-sync
          (mt/with-fake-inbox
            (snowplow-test/with-fake-snowplow-collector
              (let [email              (mt/random-email)
                    first-name         (mt/random-name)
                    last-name          (mt/random-name)
                    invitor-first-name (mt/random-name)]
                (with-setup! {:invite {:email email, :first_name first-name, :last_name last-name}
                              :user   {:first_name invitor-first-name}
                              :prefs  {:site_name "Metabase"}}
                  (let [invited-user (t2/select-one :model/User :email email)]
                    (is (= (:first_name invited-user) first-name))
                    (is (= (:last_name invited-user) last-name))
                    (is (:is_superuser invited-user))
                    (is (partial= [{:data {"event"           "invite_sent",
                                           "invited_user_id" (u/the-id invited-user)
                                           "source"          "setup"}}]
                                  (filter #(= (get-in % [:data "event"]) "invite_sent")
                                          (snowplow-test/pop-event-data-and-user-id!))))
                    (is (mt/received-email-body?
                         email
                         (re-pattern (str invitor-first-name " could use your help setting up Metabase.*"))))
                    (testing "The audit-log :user-invited event is recorded"
                      (let [logged-event (mt/latest-audit-log-entry :user-invited (u/the-id invited-user))]
                        (is (partial=
                             {:topic    :user-invited
                              :user_id  nil
                              :model    "User"
                              :model_id (u/the-id (t2/select-one :model/User :email email))
                              :details  {:invite_method          "email"
                                         :first_name             first-name
                                         :last_name              last-name
                                         :email                  email
                                         :user_group_memberships [{:id (:id (perms-group/all-users))}
                                                                  {:id (:id (perms-group/admin))}]}}
                             logged-event))))))))))))))

(deftest invite-user-test-2
  (testing "POST /api/setup"
    (testing "No second user is created if email is not set up"
      (mt/with-temporary-setting-values [email-smtp-host nil]
        (let [email (mt/random-email)
              first-name (mt/random-name)
              last-name (mt/random-name)]
          (with-setup! {:invite {:email email, :first_name first-name, :last_name last-name}}
            (is (not (t2/exists? :model/User :email email)))))))))

(deftest setup-settings-test
  (testing "POST /api/setup"
    (testing "check that we can set various Settings during setup"
      (doseq [[setting-name {:keys [k vs]}] {:site-name
                                             {:k  "site_name"
                                              :vs {"Cam's Metabase" "Cam's Metabase"
                                                   "Dan's Metabase" "Dan's Metabase"}}

                                             :anon-tracking-enabled
                                             {:k  "allow_tracking"
                                              :vs {"TRUE"  true
                                                   "true"  true
                                                   true    true
                                                   nil     true
                                                   "FALSE" true
                                                   "false" true
                                                   false   true}}

                                             :site-locale
                                             {:k  "site_locale"
                                              :vs {nil     "en" ;; `en` is the default
                                                   "es"    "es"
                                                   "ES"    "es"
                                                   "es-mx" "es_MX"
                                                   "es_MX" "es_MX"}}}
              [v expected] vs]
        (testing (format "Set Setting %s to %s" (pr-str setting-name) (pr-str v))
          (with-setup! {:prefs {k v}}
            (testing "should be set"
              (is (= expected
                     (setting/get setting-name))))))))))

(def ^:private create-database-trigger-sync-test-event (atom nil))

(derive :event/database-create ::create-database-trigger-sync-test-events)

(methodical/defmethod events/publish-event! ::create-database-trigger-sync-test-events
  [topic event]
  (reset! create-database-trigger-sync-test-event {:topic topic, :item event}))

(s/def ::setup!-args
  (s/cat :expected-status (s/? integer?)
         :f               any?
         :args            (s/* any?)))

(defn- setup!
  {:arglists '([expected-status? f & args])}
  [& args]
  (let [parsed (s/conform ::setup!-args args)]
    (when (= parsed ::s/invalid)
      (throw (ex-info (str "Invalid setup! args: " (s/explain-str ::setup!-args args))
                      (s/explain-data ::setup!-args args))))
    (let [{:keys [expected-status f args]} parsed
          body                             {:token (setup/create-token!)
                                            :prefs {:site_name "Metabase Test"}
                                            :user  {:first_name (mt/random-name)
                                                    :last_name  (mt/random-name)
                                                    :email      (mt/random-email)
                                                    :password   "anythingUP12!"}}
          body                             (apply f body args)]
      (do-with-setup!* body #(client/client :post (or expected-status 400) "setup" body)))))

(deftest setup-validation-test
  (testing "POST /api/setup validation"
    (testing ":token"
      (testing "missing"
        (is (=? {:errors {:token "Token does not match the setup token."}}
                (setup! dissoc :token))))
      (testing "incorrect"
        (is (=? {:errors {:token "Token does not match the setup token."}}
                (setup! assoc :token "foobar")))))))

(deftest setup-validation-test-2
  (testing "POST /api/setup validation"
    (testing "site name"
      ;; TODO -- it seems like this should be `{:specific-errors {:prefs {:site_name ...}}}` but defendpoint validation
      ;; is not currently that advanced.
      (is (=? {:specific-errors {:prefs ["missing required key, received: nil"]},
               :errors {:prefs #(str/starts-with? % "map where {:site_name -> <value must be a non-blank string.>")}}
              (setup! m/dissoc-in [:prefs :site_name]))))))

(deftest setup-validation-test-3
  (testing "POST /api/setup validation"
    (testing "site locale"
      (testing "invalid format"
        (is (=? {:specific-errors {:prefs {:site_locale ["valid locale, received: \"eng-USA\""]}}
                 :errors {:prefs #(str/includes? % ":site_locale (optional) -> <nullable String must be a valid two-letter ISO language or language-country code e.g. 'en' or 'en_US'.>")}}
                (setup! assoc-in [:prefs :site_locale] "eng-USA"))))
      (testing "non-existent locale"
        (is (=? {:specific-errors {:prefs {:site_locale ["valid locale, received: \"en-EN\""]}}
                 :errors {:prefs #(str/includes? % ":site_locale (optional) -> <nullable String must be a valid two-letter ISO language or language-country code e.g. 'en' or 'en_US'.>")}}
                (setup! assoc-in [:prefs :site_locale] "en-EN")))))))

(deftest setup-validation-test-4
  (testing "POST /api/setup validation"
    (testing "user"
      (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true]
        (testing "first name may be nil"
          (is (:id (setup! 200 m/dissoc-in [:user :first_name])))
          (is (:id (setup! 200 assoc-in [:user :first_name] nil))))
        (testing "last name may be nil"
          (is (:id (setup! 200 m/dissoc-in [:user :last_name])))
          (is (:id (setup! 200 assoc-in [:user :last_name] nil)))))
      (testing "email"
        (testing "missing"
          (is (=? {:errors          {:user #(str/includes? % ":email -> <value must be a valid email address.>")}
                   :specific-errors {:user {:email ["missing required key, received: nil"]}}}
                  (setup! m/dissoc-in [:user :email]))))
        (testing "invalid"
          (is (=? {:errors          {:user #(str/includes? % ":email -> <value must be a valid email address.>")}
                   :specific-errors {:user {:email ["valid email address, received: \"anything\""]}}}
                  (setup! assoc-in [:user :email] "anything")))))
      (testing "password"
        (testing "missing"
          (is (=? {:specific-errors {:user {:password ["missing required key, received: nil"]}}
                   :errors          {:user #(str/includes? % ":password -> <password is too common.>")}}
                  (setup! m/dissoc-in [:user :password]))))
        (testing "invalid"
          (is (=? {:specific-errors {:user {:password ["valid password that is not too common, received: \"anything\""]}}}
                  (setup! assoc-in [:user :password] "anything"))))))))

(deftest setup-with-empty-cache-test
  (testing "POST /api/setup"
    ;; I have seen this fail randomly, no idea why
    (testing "Make sure setup completes successfully if Settings cache needs to be restored"
      (setting.cache-test/reset-last-update-check!)
      (setting.cache-test/clear-cache!)
      (with-setup! {:user {:email "setupper@setup.net"}}
        (is (= "setupper@setup.net" (t2/select-one-fn :email :model/User :email "setupper@setup.net")))))))

(deftest has-user-setup-setting-test
  (testing "has-user-setup is true iff there are 1 or more users"
    (let [user-count (t2/count :model/User {:where [:not= :id config/internal-mb-user-id]})]
      (if (zero? user-count)
        (is (not (setup/has-user-setup)))
        (is (setup/has-user-setup))))))

(deftest create-superuser-only-once-test
  (testing "POST /api/setup"
    (testing "Check that we cannot create a new superuser via setup-token when a user exists"
      (let [token          (setup/create-token!)
            body           {:token token
                            :prefs {:site_locale "es_MX"
                                    :site_name   (mt/random-name)}
                            :user  {:first_name (mt/random-name)
                                    :last_name  (mt/random-name)
                                    :email      (mt/random-email)
                                    :password   "p@ssword1"}}
            has-user-setup (atom false)]
        (with-redefs [setup/has-user-setup (fn [] @has-user-setup)]
          (is (not (setup/has-user-setup)))
          (mt/discard-setting-changes [site-name site-locale anon-tracking-enabled admin-email]
            (is (malli= [:map {:closed true} [:id ms/NonBlankString]]
                        (client/client :post 200 "setup" body))))
          ;; In the non-test context, this is 'set' iff there is one or more users, and doesn't have to be toggled
          (reset! has-user-setup true)
          (is (setup/has-user-setup))
          ;; use do-with-setup!* to delete the random user that was created
          (do-with-setup!* body
                           #(is (= "The /api/setup route can only be used to create the first user, however a user currently exists."
                                   (client/client :post 403 "setup" (assoc-in body [:user :email] (mt/random-email)))))))))))

(deftest transaction-test
  (testing "POST /api/setup/"
    (testing "should run in a transaction -- if something fails, all changes should be rolled back"
      (let [user-email  (mt/random-email)
            setup-token (setup/create-token!)
            site-name   (mt/random-name)
            db-name     (mt/random-name)
            body        {:token    setup-token
                         :prefs    {:site_locale "es_MX"
                                    :site_name   site-name}
                         :database {:engine  "h2"
                                    :details (:details (mt/db))
                                    :name    db-name}
                         :user     {:first_name (mt/random-name)
                                    :last_name  (mt/random-name)
                                    :email      user-email
                                    :password   "p@ssword1"}}]
        (do-with-setup!*
         body
         (fn []
           (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true
                         h2/*allow-testing-h2-connections*                       true
                         api.setup/setup-set-settings! (let [orig @#'api.setup/setup-set-settings!]
                                                         (fn [& args]
                                                           (apply orig args)
                                                           (throw (ex-info "Oops!" {}))))]
             (is (=? {:message "Oops!"}
                     (client/client :post 500 "setup" body))))
           (testing "New user shouldn't exist"
             (is (= false
                    (t2/exists? :model/User :email user-email))))
           (testing "New DB shouldn't exist"
             ;; TODO -- we should also be deleting relevant sync tasks for the DB, but this doesn't matter too much
             ;; for right now.
             (is (= false
                    (t2/exists? :model/Database :engine "h2", :name db-name))))
           (testing "Settings should not be changed"
             (is (not= site-name
                       (public-settings/site-name)))
             (is (= "en"
                    (public-settings/site-locale))))
           (testing "Setup token should still be set"
             (is (= setup-token
                    (setup/setup-token))))))))))

(deftest user-defaults-test
  (testing "with no user defaults configured"
    (mt/with-temp-env-var-value! [mb-user-defaults nil]
      (is (= "Not found." (client/client :get "setup/user_defaults")))))

  (testing "with defaults containing no token"
    (mt/with-temp-env-var-value! [mb-user-defaults "{}"]
      (is (= "Not found." (client/client :get "setup/user_defaults")))))

  (testing "with valid configuration"
    (mt/with-temp-env-var-value! [mb-user-defaults "{\"token\":\"123456\",\"email\":\"john.doe@example.com\"}"]
      (testing "with mismatched token"
        (is (= "You don't have permissions to do that." (client/client :get "setup/user_defaults?token=987654"))))
      (testing "with valid token"
        (is (= {:email "john.doe@example.com"} (client/client :get "setup/user_defaults?token=123456")))))))
