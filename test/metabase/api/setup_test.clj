(ns metabase.api.setup-test
  "Tests for /api/setup endpoints."
  (:require [clojure.core.async :as a]
            [clojure.spec.alpha :as s]
            [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.analytics.snowplow-test :as snowplow-test]
            [metabase.api.setup :as api.setup]
            [metabase.email :as email]
            [metabase.events :as events]
            [metabase.http-client :as client]
            [metabase.integrations.slack :as slack]
            [metabase.models :refer [Activity Database Table User]]
            [metabase.models.setting :as setting]
            [metabase.models.setting.cache-test :as setting.cache-test]
            [metabase.public-settings :as public-settings]
            [metabase.setup :as setup]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as schema]
            [toucan.db :as db]))

;; make sure the default test users are created before running these tests, otherwise we're going to run into issues
;; if it attempts to delete this user and it is the only admin test user
(use-fixtures :once (fixtures/initialize :test-users :events))

(defn- wait-for-result
  "Call thunk up to 10 times, until it returns a truthy value. Wait 50ms between tries. Useful for waiting for something
  asynchronous to happen."
  [thunk]
  (loop [tries 10]
    (or (thunk)
        (when (pos? tries)
          (Thread/sleep 50)
          (recur (dec tries))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                  POST /setup                                                   |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- do-with-setup* [request-body thunk]
  (try
    (mt/discard-setting-changes [site-name site-locale anon-tracking-enabled admin-email]
      (thunk))
    (finally
      (db/delete! User :email (get-in request-body [:user :email]))
      (when-let [invited (get-in request-body [:invite :name])]
        (db/delete! User :email invited))
      (when-let [db-name (get-in request-body [:database :name])]
        (db/delete! Database :name db-name)))))

(defn- default-setup-input []
  {:token (setup/create-token!)
   :prefs {:site_name "Metabase Test"}
   :user  {:first_name (mt/random-name)
           :last_name  (mt/random-name)
           :email      (mt/random-email)
           :password   "anythingUP12!!"}})

(defn- do-with-setup [request-body thunk]
  (let [request-body (merge-with merge (default-setup-input) request-body)]
    (do-with-setup*
     request-body
     (fn []
       (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true]
         (testing "API response should return a Session UUID"
           (is (schema= {:id (schema/pred mt/is-uuid-string? "UUID string")}
                        (client/client :post 200 "setup" request-body))))
         ;; reset our setup token
         (setup/create-token!)
         (thunk))))))

(defmacro ^:private with-setup [request-body & body]
  `(do-with-setup ~request-body (fn [] ~@body)))

(deftest create-superuser-test
  (testing "POST /api/setup"
    (testing "Check that we can create a new superuser via setup-token"
      (let [email (mt/random-email)]
        (with-setup {:user {:email email}}
          (testing "new User should be created"
            (is (db/exists? User :email email)))
          (testing "Creating a new admin user should set the `admin-email` Setting"
            (is (= email
                   (public-settings/admin-email))))

          (testing "Should record :user-joined Activity (#12933)"
            (let [user-id (u/the-id (db/select-one-id User :email email))]
              (is (schema= {:topic         (schema/eq :user-joined)
                            :model_id      (schema/eq user-id)
                            :user_id       (schema/eq user-id)
                            :model         (schema/eq "user")
                            schema/Keyword schema/Any}
                           (wait-for-result #(db/select-one Activity :topic "user-joined", :user_id user-id)))))))))))

(deftest invite-user-test
  (testing "POST /api/setup"
    (testing "Check that a second admin can be created during setup, and that an invite email is sent successfully and
             a Snowplow analytics event is sent"
      (mt/with-fake-inbox
        (snowplow-test/with-fake-snowplow-collector
          (let [email (mt/random-email)
                first-name (mt/random-name)
                last-name (mt/random-name)
                invitor-first-name (mt/random-name)]
            (with-setup {:invite {:email email, :first_name first-name, :last_name last-name}
                         :user {:first_name invitor-first-name}
                         :site_name "Metabase"}
              (let [invited-user (User :email email)]
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
                     (re-pattern (str invitor-first-name " could use your help setting up Metabase.*"))))))))))

    (testing "No second user is created if email is not set up"
      (mt/with-temporary-setting-values [email-smtp-host nil]
        (let [email (mt/random-email)
              first-name (mt/random-name)
              last-name (mt/random-name)]
          (with-setup {:invite {:email email, :first_name first-name, :last_name last-name}}
            (is (not (db/exists? User :email email)))))))))

(deftest setup-settings-test
  (testing "POST /api/setup"
    (testing "check that we can set various Settings during setup"
      (doseq [[setting-name {:keys [k vs]}] {:site-name
                                             {:k  "site_name"
                                              :vs {"Cam's Metabase" "Cam's Metabase"}}

                                             :anon-tracking-enabled
                                             {:k  "allow_tracking"
                                              :vs {"TRUE"  true
                                                   "true"  true
                                                   true    true
                                                   nil     true
                                                   "FALSE" false
                                                   "false" false
                                                   false   false}}

                                             :site-locale
                                             {:k  "site_locale"
                                              :vs {nil     "en" ; `en` is the default
                                                   "es"    "es"
                                                   "ES"    "es"
                                                   "es-mx" "es_MX"
                                                   "es_MX" "es_MX"}}}
              [v expected] vs]
        (testing (format "Set Setting %s to %s" (pr-str setting-name) (pr-str v))
          (with-setup {:prefs {k v}}
            (testing "should be set"
              (is (= expected
                     (setting/get setting-name))))))))))

(deftest create-database-test
  (testing "POST /api/setup"
    (testing "Check that we can Create a Database when we set up MB (#10135)"
      (doseq [[k {:keys [default]}] {:is_on_demand     {:default false}
                                     :is_full_sync     {:default true}
                                     :auto_run_queries {:default true}}
              v                     [true false nil]]
        (let [db-name (mt/random-name)]
          (with-setup {:database {:engine  "h2"
                                  :name    db-name
                                  :details {:db  "file:/home/hansen/Downloads/Metabase/longnames.db",
                                            :ssl true}
                                  k        v}}
            (testing "Database should be created"
              (is (= true
                     (db/exists? Database :name db-name))))
            (testing (format "should be able to set %s to %s (default: %s) during creation" k (pr-str v) default)
              (is (= (if (some? v) v default)
                     (db/select-one-field k Database :name db-name))))))))

    (testing "Setup should trigger sync right away for the newly created Database (#12826)"
      (let [db-name (mt/random-name)]
        (mt/with-open-channels [chan (a/chan)]
          (events/subscribe-to-topics! #{:database-create} chan)
          (with-setup {:database {:engine  "h2"
                                  :name    db-name
                                  :details (:details (mt/db))}}
            (testing ":database-create events should have been fired"
              (is (schema= {:topic (schema/eq :database-create)
                            :item  {:id            su/IntGreaterThanZero
                                    :name          (schema/eq db-name)
                                    schema/Keyword schema/Any}}
                           (mt/wait-for-result chan 100))))

            (testing "Database should be synced"
              (let [db (db/select-one Database :name db-name)]
                (assert (some? db))
                (is (= 4
                       (wait-for-result (fn []
                                          (let [cnt (db/count Table :db_id (u/the-id db))]
                                            (when (= cnt 4)
                                              cnt))))))))))))

    (testing "error conditions"
      (testing "should throw Exception if driver is invalid"
        (is (= {:errors {:database {:engine "Cannot create Database: cannot find driver my-fake-driver."}}}
               (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true]
                 (client/client :post 400 "setup" (assoc (default-setup-input)
                                                         :database {:engine  "my-fake-driver"
                                                                    :name    (mt/random-name)
                                                                    :details {}})))))))))

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
                                                    :password   "anythingUP12!!"}}
          body                             (apply f body args)]
      (do-with-setup* body #(client/client :post (or expected-status 400) "setup" body)))))

(deftest setup-validation-test
  (testing "POST /api/setup validation"
    (testing ":token"
      (testing "missing"
        (is (= {:errors {:token "Token does not match the setup token."}}
               (setup! dissoc :token))))

      (testing "incorrect"
        (is (= {:errors {:token "Token does not match the setup token."}}
               (setup! assoc :token "foobar")))))

    (testing "site name"
      (is (= {:errors {:site_name "value must be a non-blank string."}}
             (setup! m/dissoc-in [:prefs :site_name]))))

    (testing "site locale"
      (testing "invalid format"
        (is (schema= {:errors {:site_locale #".*must be a valid two-letter ISO language or language-country code.*"}}
                     (setup! assoc-in [:prefs :site_locale] "eng-USA"))))
      (testing "non-existent locale"
        (is (schema= {:errors {:site_locale #".*must be a valid two-letter ISO language or language-country code.*"}}
                     (setup! assoc-in [:prefs :site_locale] "en-EN")))))

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
          (is (= {:errors {:email "value must be a valid email address."}}
                 (setup! m/dissoc-in [:user :email]))))

        (testing "invalid"
          (is (= {:errors {:email "value must be a valid email address."}}
                 (setup! assoc-in [:user :email] "anything")))))

      (testing "password"
        (testing "missing"
          (is (= {:errors {:password "password is too common."}}
                 (setup! m/dissoc-in [:user :password]))))

        (testing "invalid"
          (is (= {:errors {:password "password is too common."}}
                 (setup! assoc-in [:user :password] "anything"))))))))

(deftest setup-with-empty-cache-test
  (testing "POST /api/setup"
    ;; I have seen this fail randomly, no idea why
    (testing "Make sure setup completes successfully if Settings cache needs to be restored"
      (setting.cache-test/reset-last-update-check!)
      (setting.cache-test/clear-cache!)
      (let [db-name (mt/random-name)]
        (with-setup {:database {:engine "h2", :name db-name}}
          (is (db/exists? Database :name db-name)))))))

(deftest has-user-setup-setting-test
  (testing "has-user-setup is true iff there are 1 or more users"
    (let [user-count (db/count User)]
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
            (is (schema= {:id client/UUIDString}
                         (client/client :post 200 "setup" body))))
          ;; In the non-test context, this is 'set' iff there is one or more users, and doesn't have to be toggled
          (reset! has-user-setup true)
          (is (setup/has-user-setup))
          ;; use do-with-setup* to delete the random user that was created
          (do-with-setup* body
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
                         :database {:engine "h2"
                                    :name   db-name}
                         :user     {:first_name (mt/random-name)
                                    :last_name  (mt/random-name)
                                    :email      user-email
                                    :password   "p@ssword1"}}]
        (do-with-setup*
         body
         (fn []
           (with-redefs [api.setup/*allow-api-setup-after-first-user-is-created* true
                         api.setup/setup-set-settings! (let [orig @#'api.setup/setup-set-settings!]
                                                         (fn [& args]
                                                           (apply orig args)
                                                           (throw (ex-info "Oops!" {}))))]
             (is (schema= {:message (schema/eq "Oops!"), schema/Keyword schema/Any}
                          (client/client :post 500 "setup" body))))
           (testing "New user shouldn't exist"
             (is (= false
                    (db/exists? User :email user-email))))
           (testing "New DB shouldn't exist"
             ;; TODO -- we should also be deleting relevant sync tasks for the DB, but this doesn't matter too much
             ;; for right now.
             (is (= false
                    (db/exists? Database :engine "h2", :name db-name))))
           (testing "Settings should not be changed"
             (is (not= site-name
                       (public-settings/site-name)))
             (is (= "en"
                    (public-settings/site-locale))))
           (testing "Setup token should still be set"
             (is (= setup-token
                    (setup/setup-token))))))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                            POST /api/setup/validate                                            |
;;; +----------------------------------------------------------------------------------------------------------------+

(deftest validate-setup-test
  (testing "POST /api/setup/validate"
    (testing "Should validate token"
      (is (= {:errors {:token "Token does not match the setup token."}}
             (client/client :post 400 "setup/validate" {})))
      (is (= {:errors {:token "Token does not match the setup token."}}
             (client/client :post 400 "setup/validate" {:token "foobar"})))
      ;; make sure we have a valid setup token
      (setup/create-token!)
      (is (= {:errors {:engine "value must be a valid database engine."}}
             (client/client :post 400 "setup/validate" {:token (setup/setup-token)}))))

    (testing "should validate that database connection works"
      (is (= {:errors {:db "check your connection string"},
              :message "Database cannot be found."}
             (client/client :post 400 "setup/validate" {:token   (setup/setup-token)
                                                        :details {:engine  "h2"
                                                                  :details {:db "file:///tmp/fake.db"}}}))))

    (testing "should return 204 no content if everything is valid"
      (is (= nil
             (client/client :post 204 "setup/validate" {:token   (setup/setup-token)
                                                        :details {:engine  "h2"
                                                                  :details (:details (mt/db))}}))))))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                         GET /api/setup/admin_checklist                                         |
;;; +----------------------------------------------------------------------------------------------------------------+

;; basic sanity check
(deftest admin-checklist-test
  (testing "GET /api/setup/admin_checklist"
    (with-redefs [db/exists?              (constantly true)
                  db/count                (constantly 5)
                  email/email-configured? (constantly true)
                  slack/slack-configured? (constantly false)]
      (is (= [{:name  "Get connected"
               :tasks [{:title        "Add a database"
                        :completed    true
                        :triggered    true
                        :is_next_step false}
                       {:title        "Set up email"
                        :completed    true
                        :triggered    true
                        :is_next_step false}
                       {:title        "Set Slack credentials"
                        :completed    false
                        :triggered    true
                        :is_next_step true}
                       {:title        "Invite team members"
                        :completed    true
                        :triggered    true
                        :is_next_step false}]}
              {:name  "Curate your data"
               :tasks [{:title        "Hide irrelevant tables"
                        :completed    true
                        :triggered    false
                        :is_next_step false}
                       {:title        "Organize questions"
                        :completed    true
                        :triggered    false
                        :is_next_step false}
                       {:title        "Create metrics"
                        :completed    true
                        :triggered    false
                        :is_next_step false}
                       {:title        "Create segments"
                        :completed    true
                        :triggered    false
                        :is_next_step false}]}]
             (for [{group-name :name, tasks :tasks} (mt/user-http-request :crowberto :get 200 "setup/admin_checklist")]
               {:name  (str group-name)
                :tasks (for [task tasks]
                         (-> (select-keys task [:title :completed :triggered :is_next_step])
                             (update :title str)))}))))

    (testing "require superusers"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "setup/admin_checklist"))))))

(deftest user-defaults-test
  (testing "with no user defaults configured"
    (mt/with-temp-env-var-value [mb-user-defaults nil]
      (is (= "Not found." (client/client :get "setup/user_defaults")))))

  (testing "with defaults containing no token"
    (mt/with-temp-env-var-value [mb-user-defaults "{}"]
      (is (= "Not found." (client/client :get "setup/user_defaults")))))

  (testing "with valid configuration"
    (mt/with-temp-env-var-value [mb-user-defaults "{\"token\":\"123456\",\"email\":\"john.doe@example.com\"}"]
      (testing "with mismatched token"
        (is (= "You don't have permissions to do that." (client/client :get "setup/user_defaults?token=987654"))))
      (testing "with valid token"
        (is (= {:email "john.doe@example.com"} (client/client :get "setup/user_defaults?token=123456")))))))
