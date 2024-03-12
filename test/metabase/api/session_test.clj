(ns ^:mb/once metabase.api.session-test
  "Tests for /api/session"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.api.session :as api.session]
   [metabase.driver.h2 :as h2]
   [metabase.email.messages :as messages]
   [metabase.http-client :as client]
   [metabase.models
    :refer [LoginHistory PermissionsGroup PermissionsGroupMembership Pulse
            PulseChannel Session User]]
   [metabase.models.setting :as setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.server.middleware.session :as mw.session]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.integrations.ldap :as ldap.test]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

;; one of the tests below compares the way properties for the H2 driver are translated, so we need to make sure it's
;; loaded
(comment h2/keep-me)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers! []
  (doseq [throttler (vals @#'api.session/login-throttlers)]
    (reset! (:attempts throttler) nil)))

(def ^:private SessionResponse
  [:map
   [:id ms/UUIDString]])

(def ^:private session-cookie mw.session/metabase-session-cookie)

(deftest login-test
  (reset-throttlers!)
  (testing "POST /api/session"
    (testing "Test that we can login"
      (is (malli= SessionResponse
                  (mt/client :post 200 "session" (mt/user->credentials :rasta)))))
    (testing "Test that we can login with email of mixed case"
      (let [creds    (update (mt/user->credentials :rasta) :username u/upper-case-en)
            response (mt/client :post 200 "session" creds)]
        (is (malli= SessionResponse
                    response))
        (testing "Login should record a LoginHistory item"
          (is (malli= [:map
                       [:id                 ms/PositiveInt]
                       [:timestamp          (ms/InstanceOfClass java.time.OffsetDateTime)]
                       [:user_id            [:= (mt/user->id :rasta)]]
                       [:device_id          ms/UUIDString]
                       [:device_description ms/NonBlankString]
                       [:ip_address         ms/NonBlankString]
                       [:active             [:= true]]]
                      (t2/select-one LoginHistory :user_id (mt/user->id :rasta), :session_id (:id response)))))))
    (testing "Test that 'remember me' checkbox sets Max-Age attribute on session cookie"
      (let [body (assoc (mt/user->credentials :rasta) :remember true)
            response (mt/client-real-response :post 200 "session" body)]
        ;; clj-http sets :expires key in response when Max-Age attribute is set
        (is (get-in response [:cookies session-cookie :expires])))
      (let [body (assoc (mt/user->credentials :rasta) :remember false)
            response (mt/client-real-response :post 200 "session" body)]
        (is (nil? (get-in response [:cookies session-cookie :expires]))))))
  (testing "failure should log an error(#14317)"
    (t2.with-temp/with-temp [User user]
      (is (=? [:error clojure.lang.ExceptionInfo "Authentication endpoint error"]
              (->> (mt/with-log-messages-for-level :error
                     (mt/client :post 400 "session" {:email (:email user), :password "wooo"}))
                   ;; geojson can throw errors and we want the authentication error
                   (filter (fn [[_log-level _error message]] (= message "Authentication endpoint error")))
                   first))))))

(deftest login-validation-test
  (reset-throttlers!)
  (testing "POST /api/session"
    (testing "Test for required params"
      (is (=? {:errors {:username "value must be a non-blank string."}}
              (mt/client :post 400 "session" {})))

      (is (=? {:errors {:password "value must be a non-blank string."}}
              (mt/client :post 400 "session" {:username "anything@metabase.com"}))))

    (testing "Test for inactive user (user shouldn't be able to login if :is_active = false)"
      ;; Return same error as incorrect password to avoid leaking existence of user
      (is (=? {:errors {:_error "Your account is disabled."}}
              (mt/client :post 401 "session" (mt/user->credentials :trashbird)))))

    (testing "Test for password checking"
      (is (=? {:errors {:password "did not match stored password"}}
              (mt/client :post 401 "session" (-> (mt/user->credentials :rasta)
                                                 (assoc :password "something else"))))))))

(deftest login-throttling-test
  (reset-throttlers!)
  (testing (str "Test that people get blocked from attempting to login if they try too many times (Check that"
                " throttling works at the API level -- more tests in the throttle library itself:"
                " https://github.com/metabase/throttle)")
    (let [login (fn []
                  (-> (mt/client :post 401 "session" {:username "fakeaccount3000@metabase.com", :password "toucans"})
                      :errors
                      :username))]
      ;; attempt to log in 10 times
      (dorun (repeatedly 10 login))
      (testing "throttling should now be triggered"
        (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
                 (login))))
      (testing "Error should be logged (#14317)"
        (is (=? [:error clojure.lang.ExceptionInfo "Authentication endpoint error"]
                (first (mt/with-log-messages-for-level :error
                         (login))))))
      (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
               (login))
          "Trying to login immediately again should still return throttling error"))))

(defn- send-login-request [username & [{:or {} :as headers}]]
  (try
    (http/post (client/build-url "session" {})
               {:form-params {"username" username,
                              "password" "incorrect-password"}
                :content-type :json
                :headers headers})
    (catch clojure.lang.ExceptionInfo e
      (ex-data e))))

(defn- cleaned-throttlers [var-symbol ks]
  (let [throttlers (var-get var-symbol)
        clean-key  (fn [m k] (assoc-in m [k :attempts] (atom '())))]
    (reduce clean-key throttlers ks)))

(deftest failure-threshold-throttling-test
  (reset-throttlers!)
  (testing "Test that source based throttling kicks in after the login failure threshold (50) has been reached"
    (with-redefs [api.session/login-throttlers          (cleaned-throttlers #'api.session/login-throttlers
                                                                            [:username :ip-address])
                  public-settings/source-address-header (constantly "x-forwarded-for")]
      (dotimes [n 50]
        (let [response    (send-login-request (format "user-%d" n)
                                              {"x-forwarded-for" "10.1.2.3"})
              status-code (:status response)]
          (assert (= status-code 401) (str "Unexpected response status code:" status-code))))
      (let [error (fn []
                    (-> (send-login-request "last-user" {"x-forwarded-for" "10.1.2.3"})
                        :body
                        json/parse-string
                        (get-in ["errors" "username"])))]
        (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
                 (error)))
        (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
                 (error)))))))

(deftest failure-threshold-per-request-source
  (reset-throttlers!)
  (testing "The same as above, but ensure that throttling is done on a per request source basis."
    (with-redefs [api.session/login-throttlers          (cleaned-throttlers #'api.session/login-throttlers
                                                                            [:username :ip-address])
                  public-settings/source-address-header (constantly "x-forwarded-for")]
      (dotimes [n 50]
        (let [response    (send-login-request (format "user-%d" n)
                                              {"x-forwarded-for" "10.1.2.3"})
              status-code (:status response)]
          (assert (= status-code 401) (str "Unexpected response status code:" status-code))))
      (dotimes [n 40]
        (let [response    (send-login-request (format "round2-user-%d" n)) ; no x-forwarded-for
              status-code (:status response)]
          (assert (= status-code 401) (str "Unexpected response status code:" status-code))))
      (let [error (fn []
                    (-> (send-login-request "last-user" {"x-forwarded-for" "10.1.2.3"})
                        :body
                        json/parse-string
                        (get-in ["errors" "username"])))]
        (is (re= #"^Too many attempts! You must wait 1\d seconds before trying again\.$"
                 (error)))
        (is (re= #"^Too many attempts! You must wait 4\d seconds before trying again\.$"
                 (error)))))))

(deftest logout-test
  (reset-throttlers!)
  (testing "DELETE /api/session"
    (testing "Test that we can logout"
      ;; clear out cached session tokens so next time we make an API request it log in & we'll know we have a valid
      ;; Session
      (test.users/clear-cached-session-tokens!)
      (let [session-id       (test.users/username->token :rasta)
            login-history-id (t2/select-one-pk LoginHistory :session_id session-id)]
        (testing "LoginHistory should have been recorded"
          (is (integer? login-history-id)))
        ;; Ok, calling the logout endpoint should delete the Session in the DB. Don't worry, `test-users` will log back
        ;; in on the next API call
        (mt/user-http-request :rasta :delete 204 "session")
        ;; check whether it's still there -- should be GONE
        (is (= nil
               (t2/select-one Session :id session-id)))
        (testing "LoginHistory item should still exist, but session_id should be set to nil (active = false)"
          (is (malli= [:map
                       [:id                 ms/PositiveInt]
                       [:timestamp          (ms/InstanceOfClass java.time.OffsetDateTime)]
                       [:user_id            [:= (mt/user->id :rasta)]]
                       [:device_id          ms/UUIDString]
                       [:device_description ms/NonBlankString]
                       [:ip_address         ms/NonBlankString]
                       [:active             [:= false]]]
                (t2/select-one LoginHistory :id login-history-id))))))))

(deftest forgot-password-test
  (reset-throttlers!)
  (testing "POST /api/session/forgot_password"
    ;; deref forgot-password-impl for the tests since it returns a future
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (testing "Test that we can initiate password reset"
        (mt/with-fake-inbox
          (letfn [(reset-fields-set? []
                    (let [{:keys [reset_token reset_triggered]} (t2/select-one [User :reset_token :reset_triggered]
                                                                               :id (mt/user->id :rasta))]
                      (boolean (and reset_token reset_triggered))))]
            ;; make sure user is starting with no values
            (t2/update! User (mt/user->id :rasta) {:reset_token nil, :reset_triggered nil})
            (assert (not (reset-fields-set?)))
            ;; issue reset request (token & timestamp should be saved)
            (is (= nil
                   (mt/user-http-request :rasta :post 204 "session/forgot_password"
                                         {:email (:username (mt/user->credentials :rasta))}))
                "Request should return no content")
            (is (= true
                   (reset-fields-set?))
                "User `:reset_token` and `:reset_triggered` should be updated")
            (is (mt/received-email-subject? :rasta #"Password Reset")))))
      (testing "We use `site-url` in the email"
        (let [my-url "abcdefghij"]
          (mt/with-temporary-setting-values [site-url my-url]
            (mt/with-fake-inbox
              (mt/user-http-request :rasta :post 204 "session/forgot_password"
                                    {:email (:username (mt/user->credentials :rasta))})
              (is (mt/received-email-body? :rasta (re-pattern my-url)))))))
      (testing "test that email is required"
        (is (=? {:errors {:email "value must be a valid email address."}}
                (mt/client :post 400 "session/forgot_password" {}))))
      (testing "Test that email not found also gives 200 as to not leak existence of user"
        (is (= nil
               (mt/client :post 204 "session/forgot_password" {:email "not-found@metabase.com"})))))))

(deftest forgot-password-event-test
  (reset-throttlers!)
  (mt/with-premium-features #{:audit-app}
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-model-cleanup [:model/User]
        (testing "Test that forgot password event is logged."
          (mt/user-http-request :rasta :post 204 "session/forgot_password"
                                {:email (:username (mt/user->credentials :rasta))})
          (let [rasta-id (mt/user->id :rasta)]
            (is (= {:topic    :password-reset-initiated
                    :user_id  rasta-id
                    :model_id rasta-id
                    :model    "User"
                    :details  {:token (t2/select-one-fn :reset_token :model/User :id rasta-id)}}
                   (mt/latest-audit-log-entry :password-reset-initiated rasta-id)))))))))

(deftest forgot-password-throttling-test
  (reset-throttlers!)
  (testing "Test that email based throttling kicks in after the login failure threshold (3) has been reached"
    (letfn [(send-password-reset! [& [expected-status & _more]]
              (mt/client :post (or expected-status 204) "session/forgot_password" {:email "not-found@metabase.com"}))]
      (with-redefs [api.session/forgot-password-throttlers (cleaned-throttlers #'api.session/forgot-password-throttlers
                                                                               [:email :ip-address])]
        (dotimes [_ 3]
          (send-password-reset!))
        (let [error (fn []
                      (-> (send-password-reset! 400)
                          :errors
                          :email))]
          (is (= "Too many attempts! You must wait 15 seconds before trying again."
                 (error)))
          ;;`throttling/check` gives 15 in stead of 42
          (is (= "Too many attempts! You must wait 15 seconds before trying again."
                 (error))))))))

(deftest reset-password-test
  (reset-throttlers!)
  (testing "POST /api/session/reset_password"
    (testing "Test that we can reset password from token (AND after token is used it gets removed)"
      (mt/with-fake-inbox
        (let [password {:old "password"
                        :new "whateverUP12!!"}]
          (t2.with-temp/with-temp [User {:keys [email id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
            (let [token (u/prog1 (str id "_" (random-uuid))
                          (t2/update! User id {:reset_token <>}))
                  creds {:old {:password (:old password)
                               :username email}
                         :new {:password (:new password)
                               :username email}}]
              ;; Check that creds work
              (mt/client :post 200 "session" (:old creds))
              ;; Call reset password endpoint to change the PW
              (testing "reset password endpoint should return a valid session token"
                (is (=? {:session_id mt/is-uuid-string?
                         :success    true}
                        (mt/client :post 200 "session/reset_password" {:token    token
                                                                       :password (:new password)}))))
              (testing "Old creds should no longer work"
                (is (= {:errors {:password "did not match stored password"}}
                       (mt/client :post 401 "session" (:old creds)))))
              (testing "New creds *should* work"
                (is (malli= SessionResponse
                            (mt/client :post 200 "session" (:new creds)))))
              (testing "check that reset token was cleared"
                (is (= {:reset_token     nil
                        :reset_triggered nil}
                       (mt/derecordize (t2/select-one [User :reset_token :reset_triggered], :id id))))))))))))

(deftest reset-password-successful-event-test
  (reset-throttlers!)
  (mt/with-premium-features #{:audit-app}
    (testing "Test that a successful password reset creates the correct event"
      (mt/with-model-cleanup [:model/Activity :model/AuditLog :model/User]
        (mt/with-fake-inbox
          (let [password {:old "password"
                          :new "whateverUP12!!"}]
            (t2.with-temp/with-temp [User {:keys [id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
              (let [token       (u/prog1 (str id "_" (random-uuid))
                                  (t2/update! User id {:reset_token <> :last_login :%now}))
                    reset-token (t2/select-one-fn :reset_token :model/User :id id)]
                (mt/client :post 200 "session/reset_password" {:token    token
                                                               :password (:new password)})
                (is (= {:topic    :password-reset-successful
                        :user_id  nil
                        :model    "User"
                        :model_id id
                        :details  {:token reset-token}}
                       (mt/latest-audit-log-entry :password-reset-successful id)))))))))))

(deftest reset-password-validation-test
  (reset-throttlers!)
  (testing "POST /api/session/reset_password"
    (testing "Test that token and password are required"
      (is (=? {:errors {:token "value must be a non-blank string."}}
              (mt/client :post 400 "session/reset_password" {})))
      (is (=? {:errors {:password "password is too common."}}
              (mt/client :post 400 "session/reset_password" {:token "anything"}))))

    (testing "Test that malformed token returns 400"
      (is (=? {:errors {:password "Invalid reset token"}}
              (mt/client :post 400 "session/reset_password" {:token    "not-found"
                                                             :password "whateverUP12!!"}))))

    (testing "Test that invalid token returns 400"
      (is (=? {:errors {:password "Invalid reset token"}}
              (mt/client :post 400 "session/reset_password" {:token    "1_not-found"
                                                             :password "whateverUP12!!"}))))

    (testing "Test that an expired token doesn't work"
      (let [token (str (mt/user->id :rasta) "_" (random-uuid))]
        (t2/update! User (mt/user->id :rasta) {:reset_token token, :reset_triggered 0})
        (is (=? {:errors {:password "Invalid reset token"}}
                (mt/client :post 400 "session/reset_password" {:token    token
                                                               :password "whateverUP12!!"})))))))

(deftest check-reset-token-valid-test
  (reset-throttlers!)
  (testing "GET /session/password_reset_token_valid"
    (testing "Check that a valid, unexpired token returns true"
      (let [token (str (mt/user->id :rasta) "_" (random-uuid))]
        (t2/update! User (mt/user->id :rasta) {:reset_token token, :reset_triggered (dec (System/currentTimeMillis))})
        (is (= {:valid true}
               (mt/client :get 200 "session/password_reset_token_valid", :token token)))))

    (testing "Check than an made-up token returns false"
      (is (= {:valid false}
             (mt/client :get 200 "session/password_reset_token_valid", :token "ABCDEFG"))))

    (testing "Check that an expired but valid token returns false"
      (let [token (str (mt/user->id :rasta) "_" (random-uuid))]
        (t2/update! User (mt/user->id :rasta) {:reset_token token, :reset_triggered 0})
        (is (= {:valid false}
               (mt/client :get 200 "session/password_reset_token_valid", :token token)))))))

(deftest reset-token-ttl-hours-test
  (testing "Test reset-token-ttl-hours-test"
    (testing "reset-token-ttl-hours-test is reset to default when not set"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours nil]
        (is (= 48 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to positive value"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours 36]
        (is (= 36 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to large positive value"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours (+ Integer/MAX_VALUE 1)]
        (is (= (+ Integer/MAX_VALUE 1) (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to zero"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours 0]
        (is (= 0 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to negative value"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours -1]
        (is (= -1 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))))

(deftest properties-test
  (reset-throttlers!)
  (testing "GET /session/properties"
    (testing "Unauthenticated"
      (is (= (set (keys (setting/user-readable-values-map #{:public})))
             (set (keys (mt/client :get 200 "session/properties"))))))

    (testing "Authenticated normal user"
      (mt/with-test-user :lucky
       (is (= (set (keys (setting/user-readable-values-map #{:public :authenticated})))
              (set (keys (mt/user-http-request :lucky :get 200 "session/properties")))))))

    (testing "Authenticated settings manager"
      (mt/with-test-user :lucky
       (with-redefs [setting/has-advanced-setting-access? (constantly true)]
         (is (= (set (keys (setting/user-readable-values-map #{:public :authenticated :settings-manager})))
                (set (keys (mt/user-http-request :lucky :get 200 "session/properties"))))))))

    (testing "Authenticated super user"
      (mt/with-test-user :crowberto
        (is (= (set (keys (setting/user-readable-values-map #{:public :authenticated :settings-manager :admin})))
               (set (keys (mt/user-http-request :crowberto :get 200 "session/properties")))))))

    (testing "Includes user-local settings"
      (defsetting test-session-api-setting
        "test setting"
        :user-local :only
        :type       :string
        :default    "FOO")

      (mt/with-test-user :lucky
        (is (= "FOO"
               (-> (mt/user-http-request :crowberto :get 200 "session/properties")
                   :test-session-api-setting)))))))

(deftest properties-i18n-test
  (reset-throttlers!)
  (testing "GET /session/properties"
    (testing "Setting the X-Metabase-Locale header should result give you properties in that locale"
      (mt/with-mock-i18n-bundles {"es" {:messages {"Connection String" "Cadena de conexión !"}}}
        (is (= "Cadena de conexión !"
               (-> (mt/client :get 200 "session/properties" {:request-options {:headers {"x-metabase-locale" "es"}}})
                   :engines :h2 :details-fields first :display-name)))))))

;;; ------------------------------------------- TESTS FOR GOOGLE SIGN-IN ---------------------------------------------

(deftest google-auth-test
  (reset-throttlers!)
  (testing "POST /google_auth"
    (mt/with-temporary-setting-values [google-auth-client-id "pretend-client-id.apps.googleusercontent.com"]
      (testing "Google auth works with an active account"
        (t2.with-temp/with-temp [User _ {:email "test@metabase.com" :is_active true}]
          (with-redefs [http/post (constantly
                                   {:status 200
                                    :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                 "\"email_verified\":\"true\","
                                                 "\"first_name\":\"test\","
                                                 "\"last_name\":\"user\","
                                                 "\"email\":\"test@metabase.com\"}")})]
            (is (malli= SessionResponse
                        (mt/client :post 200 "session/google_auth" {:token "foo"}))))))
      (testing "Google auth throws exception for a disabled account"
        (t2.with-temp/with-temp [User _ {:email "test@metabase.com" :is_active false}]
          (with-redefs [http/post (constantly
                                   {:status 200
                                    :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                 "\"email_verified\":\"true\","
                                                 "\"first_name\":\"test\","
                                                 "\"last_name\":\"user\","
                                                 "\"email\":\"test@metabase.com\"}")})]
            (is (= {:errors {:account "Your account is disabled."}}
                   (mt/client :post 401 "session/google_auth" {:token "foo"})))))))))

;;; ------------------------------------------- TESTS FOR LDAP AUTH STUFF --------------------------------------------

(deftest ldap-login-test
  (reset-throttlers!)
  (ldap.test/with-ldap-server
    (testing "Test that we can login with LDAP"
      (t2.with-temp/with-temp [User _ {:email    "ngoc@metabase.com"
                                       :password "securedpassword"}]
        (is (malli= SessionResponse
                    (mt/client :post 200 "session" {:username "ngoc@metabase.com"
                                                    :password "securedpassword"})))))

    (testing "Test that login will fallback to local for users not in LDAP"
      (mt/with-temporary-setting-values [enable-password-login true]
        (is (malli= SessionResponse
                    (mt/client :post 200 "session" (mt/user->credentials :crowberto)))))
      (testing "...but not if password login is disabled"
        (mt/with-premium-features #{:disable-password-login}
          (mt/with-temporary-setting-values [enable-password-login false]
            (is (= "Password login is disabled for this instance."
                   (mt/client :post 401 "session" (mt/user->credentials :crowberto))))))))

    (testing "Test that login will NOT fallback for users in LDAP but with an invalid password"
      ;; NOTE: there's a different password in LDAP for Lucky
      (is (= {:errors {:password "did not match stored password"}}
             (mt/client :post 401 "session" (mt/user->credentials :lucky)))))

    (testing "Test that a deactivated user cannot login with LDAP"
      (t2.with-temp/with-temp [User _ {:email    "ngoc@metabase.com"
                                       :password "securedpassword"
                                       :is_active false}]
        (is (= {:errors {:_error "Your account is disabled."}}
               (mt/client :post 401 "session" {:username "ngoc@metabase.com"
                                               :password "securedpassword"})))))

    (testing "Test that login will fallback to local for broken LDAP settings"
      (mt/with-temporary-setting-values [ldap-user-base "cn=wrong,cn=com"]
        (t2.with-temp/with-temp [User _ {:email    "ngoc@metabase.com"
                                         :password "securedpassword"}]
          (is (malli= SessionResponse
                      (mt/client :post 200 "session" {:username "ngoc@metabase.com"
                                                      :password "securedpassword"}))))))

    (testing "Test that we can login with LDAP with new user"
      (try
        (is (malli= SessionResponse
                    (mt/client :post 200 "session" {:username "sbrown20", :password "1234"})))
        (finally
          (t2/delete! User :email "sally.brown@metabase.com"))))

    (testing "Test that we can login with LDAP multiple times if the email stored in LDAP contains upper-case
             characters (#13739)"
      (try
        (is (malli=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (is (malli=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (finally
          (t2/delete! User :email "John.Smith@metabase.com"))))

    (testing "test that group sync works even if ldap doesn't return uid (#22014)"
      (t2.with-temp/with-temp [PermissionsGroup group {:name "Accounting"}]
        (mt/with-temporary-raw-setting-values
          [ldap-group-mappings (json/generate-string {"cn=Accounting,ou=Groups,dc=metabase,dc=com" [(:id group)]})]
          (is (malli= SessionResponse
                      (mt/client :post 200 "session" {:username "fred.taylor@metabase.com", :password "pa$$word"})))
          (testing "PermissionsGroupMembership should exist"
            (let [user-id (t2/select-one-pk User :email "fred.taylor@metabase.com")]
              (is (t2/exists? PermissionsGroupMembership :group_id (u/the-id group) :user_id (u/the-id user-id))))))))))

(deftest no-password-no-login-test
  (reset-throttlers!)
  (testing "A user with no password should not be able to do password-based login"
    (t2.with-temp/with-temp [User user]
      (t2/update! User (u/the-id user) {:password nil, :password_salt nil})
      (let [device-info {:device_id          "Cam's Computer"
                         :device_description "The computer where Cam wrote this test"
                         :ip_address         "192.168.1.1"}]
        (is (= nil
               (#'api.session/email-login (:email user) nil device-info)))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Password did not match stored password"
             (#'api.session/login (:email user) "password" device-info)))))))

;;; ------------------------------------------- TESTS FOR UNSUBSCRIBING NONUSERS STUFF --------------------------------------------

(deftest unsubscribe-hash-test
  (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url "08534993-94c6-4bac-a1ad-86c9668ee8f5"]
    (let [email         "rasta@pasta.com"
          pulse-id      12345678
          expected-hash "37bc76b4a24279eb90a71c129a629fb8626ad0089f119d6d095bc5135377f2e2884ad80b037495f1962a283cf57cdbad031fd1f06a21d86a40bba7fe674802dd"]
      (testing "We generate a cryptographic hash to validate unsubscribe URLs"
        (is (= expected-hash (messages/generate-pulse-unsubscribe-hash pulse-id email))))

      (testing "The hash value depends on the pulse-id, email, and site-uuid"
        (let [alternate-site-uuid "aa147515-ade9-4298-ac5f-c7e42b69286d"
              alternate-hashes    [(messages/generate-pulse-unsubscribe-hash 87654321 email)
                                   (messages/generate-pulse-unsubscribe-hash pulse-id "hasta@lavista.com")
                                   (mt/with-temporary-setting-values [site-uuid-for-unsubscribing-url alternate-site-uuid]
                                     (messages/generate-pulse-unsubscribe-hash pulse-id email))]]
          (is (= 3 (count (distinct (remove #{expected-hash} alternate-hashes))))))))))

(deftest unsubscribe-test
  (reset-throttlers!)
  (testing "POST /pulse/unsubscribe"
    (let [email "test@metabase.com"]
      (testing "Invalid hash"
        (is (= "Invalid hash."
               (mt/client :post 400 "session/pulse/unsubscribe" {:pulse-id 1
                                                                 :email    email
                                                                 :hash     "fake-hash"}))))

      (testing "Valid hash but not email"
        (mt/with-temp [Pulse        {pulse-id :id} {}
                       PulseChannel _              {:pulse_id pulse-id}]
          (is (= "Email for pulse-id doesnt exist."
                 (mt/client :post 400 "session/pulse/unsubscribe" {:pulse-id pulse-id
                                                                   :email    email
                                                                   :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)})))))

      (testing "Valid hash and email"
        (mt/with-temp [Pulse        {pulse-id :id} {:name "title"}
                       PulseChannel _              {:pulse_id     pulse-id
                                                    :channel_type "email"
                                                    :details      {:emails [email]}}]
          (is (= {:status "success" :title "title"}
                 (mt/client :post 200 "session/pulse/unsubscribe" {:pulse-id pulse-id
                                                                   :email    email
                                                                   :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)}))))))))

(deftest unsubscribe-event-test
  (reset-throttlers!)
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/User]
      (testing "Valid hash and email returns event."
        (t2.with-temp/with-temp [Pulse        {pulse-id :id} {}
                                 PulseChannel _              {:pulse_id     pulse-id
                                                              :channel_type "email"
                                                              :details      {:emails ["test@metabase.com"]}}]
          (mt/client :post 200 "session/pulse/unsubscribe" {:pulse-id pulse-id
                                                            :email    "test@metabase.com"
                                                            :hash     (messages/generate-pulse-unsubscribe-hash pulse-id "test@metabase.com")})
          (is (= {:topic    :subscription-unsubscribe
                  :user_id  nil
                  :model    "Pulse"
                  :model_id nil
                  :details  {:email "test@metabase.com"}}
                 (mt/latest-audit-log-entry :subscription-unsubscribe))))))))

(deftest unsubscribe-undo-test
  (reset-throttlers!)
  (testing "POST /pulse/unsubscribe/undo"
    (let [email "test@metabase.com"]
      (testing "Invalid hash"
        (is (= "Invalid hash."
               (mt/client :post 400 "session/pulse/unsubscribe/undo" {:pulse-id 1
                                                                      :email    email
                                                                      :hash     "fake-hash"}))))

      (testing "Valid hash and email doesn't exist"
        (mt/with-temp [Pulse        {pulse-id :id} {:name "title"}
                       PulseChannel _              {:pulse_id pulse-id}]
          (is (= {:status "success" :title "title"}
                 (mt/client :post 200 "session/pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                                        :email    email
                                                                        :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)})))))

      (testing "Valid hash and email already exists"
        (mt/with-temp [Pulse        {pulse-id :id} {}
                       PulseChannel _              {:pulse_id     pulse-id
                                                    :channel_type "email"
                                                    :details      {:emails [email]}}]
          (is (= "Email for pulse-id already exists."
                 (mt/client :post 400 "session/pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                                        :email    email
                                                                        :hash     (messages/generate-pulse-unsubscribe-hash pulse-id email)}))))))))

(deftest unsubscribe-undo-event-test
  (reset-throttlers!)
  (mt/with-premium-features #{:audit-app}
    (mt/with-model-cleanup [:model/User]
      (testing "Undoing valid hash and email returns event"
        (t2.with-temp/with-temp [Pulse        {pulse-id :id} {}
                                 PulseChannel _              {:pulse_id pulse-id}]
          (mt/client :post 200 "session/pulse/unsubscribe/undo" {:pulse-id pulse-id
                                                                 :email    "test@metabase.com"
                                                                 :hash     (messages/generate-pulse-unsubscribe-hash pulse-id "test@metabase.com")})
          (is (= {:topic    :subscription-unsubscribe-undo
                  :user_id  nil
                  :model    "Pulse"
                  :model_id nil
                  :details  {:email "test@metabase.com"}}
                 (mt/latest-audit-log-entry :subscription-unsubscribe-undo))))))))
