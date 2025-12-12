(ns metabase.session.api-test
  "Tests for /api/session"
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver.h2 :as h2]
   [metabase.request.core :as request]
   [metabase.request.settings :as request.settings]
   [metabase.session.api :as api.session]
   [metabase.session.models.session :as session]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.settings.models.setting]
   [metabase.sso.ldap-test-util :as ldap.test]
   [metabase.sso.ldap.default-implementation]
   [metabase.test :as mt]
   [metabase.test.data.users :as test.users]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli.schema :as ms]
   [metabase.util.string :as string]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; one of the tests below compares the way properties for the H2 driver are translated, so we need to make sure it's
;; loaded
(comment h2/keep-me)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(defn- reset-throttlers []
  (doseq [throttler (vals @#'api.session/login-throttlers)]
    (reset! (:attempts throttler) nil))
  (reset! (:attempts (var-get #'api.session/reset-password-throttler)) nil))

(use-fixtures :each (fn [f] (reset-throttlers) (f)))

(def ^:private SessionResponse
  [:map
   [:id ms/UUIDString]])

(def ^:private session-cookie request/metabase-session-cookie)

(deftest login-basic-test
  (testing "POST /api/session - basic login works"
    (is (malli= SessionResponse
                (mt/client :post 200 "session" (mt/user->credentials :rasta))))))

(deftest login-mixed-case-email-test
  (testing "POST /api/session - login with email of mixed case"
    (let [creds    (update (mt/user->credentials :rasta) :username u/upper-case-en)
          response (mt/client :post 200 "session" creds)]
      (is (malli= SessionResponse
                  response)))))

(deftest login-records-history-test
  (testing "POST /api/session - login records a LoginHistory item"
    (let [creds    (update (mt/user->credentials :rasta) :username u/upper-case-en)
          response (mt/client :post 200 "session" creds)]
      (is (malli= [:map
                   [:id                 ms/PositiveInt]
                   [:timestamp          (ms/InstanceOfClass java.time.OffsetDateTime)]
                   [:user_id            [:= (mt/user->id :rasta)]]
                   [:device_id          ms/UUIDString]
                   [:device_description ms/NonBlankString]
                   [:ip_address         ms/NonBlankString]
                   [:active             [:= true]]]
                  (t2/select-one :model/LoginHistory :user_id (mt/user->id :rasta), :session_id (t2/select-one-fn :id :model/Session :key_hashed (session/hash-session-key (:id response)))))))))

(deftest login-remember-me-sets-max-age-test
  (testing "POST /api/session - 'remember me' checkbox sets Max-Age attribute on session cookie"
    (let [body (assoc (mt/user->credentials :rasta) :remember true)
          response (mt/client-real-response :post 200 "session" body)]
      (is (get-in response [:cookies session-cookie :expires])))))

(deftest login-remember-me-false-no-max-age-test
  (testing "POST /api/session - 'remember me' false does not set Max-Age attribute"
    (let [body (assoc (mt/user->credentials :rasta) :remember false)
          response (mt/client-real-response :post 200 "session" body)]
      (is (nil? (get-in response [:cookies session-cookie :expires]))))))

(deftest login-failure-logging-test
  (testing "POST /api/session failure should log an error (#14317)"
    (mt/with-temp [:model/User user]
      (mt/with-log-messages-for-level [messages :error]
        (is (=? {:specific-errors {:username ["missing required key, received: nil"]}}
                (mt/client :post 400 "session" {:email (:email user), :password "wooo"})))
        (is (=? {:level :error, :e clojure.lang.ExceptionInfo, :message "Authentication endpoint error"}
                (or (->> (messages)
                         ;; geojson can throw errors and we want the authentication error
                         ;;
                         ;; TODO -- huh? geojson???? -- Cam
                         (m/find-first #(= (:message %) "Authentication endpoint error")))
                    ["no matching message:" (messages)])))))))

(deftest login-validation-username-required-test
  (testing "POST /api/session - username is required"
    (is (=? {:errors {:username "value must be a non-blank string."}}
            (mt/client :post 400 "session" {})))))

(deftest login-validation-password-required-test
  (testing "POST /api/session - password is required"
    (is (=? {:errors {:password "value must be a non-blank string."}}
            (mt/client :post 400 "session" {:username "anything@metabase.com"})))))

(deftest login-validation-inactive-user-test
  (testing "POST /api/session - inactive user cannot login"
    (is (=? {:errors {:_error "Your account is disabled."}}
            (mt/client :post 401 "session" (mt/user->credentials :trashbird))))))

(deftest login-validation-password-check-test
  (testing "POST /api/session - incorrect password fails"
    (is (=? {:errors {:password "did not match stored password"}}
            (mt/client :post 401 "session" (-> (mt/user->credentials :rasta)
                                               (assoc :password "something else")))))))

(deftest login-throttling-test
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
        (mt/with-log-messages-for-level [messages :error]
          (login)
          (is (=? {:level :error, :e clojure.lang.ExceptionInfo, :message "Authentication endpoint error"}
                  (first (messages))))))
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
  (testing "Test that source based throttling kicks in after the login failure threshold (50) has been reached"
    (with-redefs [api.session/login-throttlers          (cleaned-throttlers #'api.session/login-throttlers
                                                                            [:username :ip-address])
                  request.settings/source-address-header (constantly "x-forwarded-for")]
      (dotimes [n 50]
        (let [response    (send-login-request (format "user-%d" n)
                                              {"x-forwarded-for" "10.1.2.3"})
              status-code (:status response)]
          (assert (= status-code 401) (str "Unexpected response status code:" status-code))))
      (let [error (fn []
                    (-> (send-login-request "last-user" {"x-forwarded-for" "10.1.2.3"})
                        :body
                        json/decode
                        (get-in ["errors" "username"])))]
        (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
                 (error)))
        (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
                 (error)))))))

(deftest failure-threshold-per-request-source
  (testing "The same as above, but ensure that throttling is done on a per request source basis."
    (with-redefs [api.session/login-throttlers          (cleaned-throttlers #'api.session/login-throttlers
                                                                            [:username :ip-address])
                  request.settings/source-address-header (constantly "x-forwarded-for")]
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
                        json/decode
                        (get-in ["errors" "username"])))]
        (is (re= #"^Too many attempts! You must wait 1\d seconds before trying again\.$"
                 (error)))
        (is (re= #"^Too many attempts! You must wait 4\d seconds before trying again\.$"
                 (error)))))))

(deftest logout-test
  (testing "DELETE /api/session"
    (testing "Test that logout 404s if there is no session key supplied"
      (client/client :delete 404 "session"))
    (testing "Test that we can logout"
      ;; clear out cached session tokens so next time we make an API request it log in & we'll know we have a valid
      ;; Session
      (test.users/clear-cached-session-tokens!)
      (let [session-key        (client/authenticate (test.users/user->credentials :rasta))
            session-key-hashed (session/hash-session-key session-key)
            login-history-id (t2/select-one-pk :model/LoginHistory :session_id (t2/select-one-pk :model/Session :key_hashed session-key-hashed))]
        (testing "LoginHistory should have been recorded"
          (is (integer? login-history-id)))
        ;; Ok, calling the logout endpoint should delete the Session in the DB. Don't worry, `test-users` will log back
        ;; in on the next API call
        (client/client session-key :delete 204 "session")
        ;; check whether it's still there -- should be GONE
        (is (= nil
               (t2/select-one :model/Session :key_hashed session-key-hashed)))
        (testing "LoginHistory item should still exist, but session_id should be set to nil (active = false)"
          (is (malli= [:map
                       [:id                 ms/PositiveInt]
                       [:timestamp          (ms/InstanceOfClass java.time.OffsetDateTime)]
                       [:user_id            [:= (mt/user->id :rasta)]]
                       [:device_id          ms/UUIDString]
                       [:device_description ms/NonBlankString]
                       [:ip_address         ms/NonBlankString]
                       [:active             [:= false]]]
                      (t2/select-one :model/LoginHistory :id login-history-id))))))))

(deftest forgot-password-initiate-reset-test
  (testing "POST /api/session/forgot_password - initiate password reset"
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-fake-inbox
        (letfn [(reset-fields-set? []
                  (let [{:keys [reset_token reset_triggered]} (t2/select-one [:model/User :reset_token :reset_triggered]
                                                                             :id (mt/user->id :rasta))]
                    (boolean (and reset_token reset_triggered))))]
          (t2/update! :model/User (mt/user->id :rasta) {:reset_token nil, :reset_triggered nil})
          (assert (not (reset-fields-set?)))
          (is (= nil
                 (mt/user-http-request :rasta :post 204 "session/forgot_password"
                                       {:email (:username (mt/user->credentials :rasta))}))
              "Request should return no content")
          (is (true?
               (reset-fields-set?))
              "User `:reset_token` and `:reset_triggered` should be updated")
          (is (mt/received-email-subject? :rasta #"Password Reset")))))))

(deftest forgot-password-uses-site-url-test
  (testing "POST /api/session/forgot_password - uses site-url in email"
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (let [my-url "abcdefghij"]
        (mt/with-temporary-setting-values [site-url my-url]
          (mt/with-fake-inbox
            (mt/user-http-request :rasta :post 204 "session/forgot_password"
                                  {:email (:username (mt/user->credentials :rasta))})
            (is (mt/received-email-body? :rasta (re-pattern my-url)))))))))

(deftest forgot-password-email-required-test
  (testing "POST /api/session/forgot_password - email is required"
    (is (=? {:errors {:email "value must be a valid email address."}}
            (mt/client :post 400 "session/forgot_password" {})))))

(deftest forgot-password-email-not-found-test
  (testing "POST /api/session/forgot_password - email not found returns 204"
    (is (= nil
           (mt/client :post 204 "session/forgot_password" {:email "not-found@metabase.com"})))))

(deftest forgot-password-google-sso-enabled-test
  (testing "POST /api/session/forgot_password - Google SSO user cannot reset when Google SSO enabled"
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-temp [:model/User g-user {:first_name "g"
                                         :last_name "user"
                                         :email "g-user@gmail.com"
                                         :sso_source :google}]
        (let [my-url "abcdefghij"]
          (mt/with-temporary-setting-values [site-url my-url
                                             google-auth-client-id "pretend-client-id.apps.googleusercontent.com"
                                             google-auth-enabled true]
            (mt/with-fake-inbox
              (mt/user-http-request g-user :post 204 "session/forgot_password"
                                    {:email (:email g-user)})
              (is (mt/received-email-body?
                   (:email g-user)
                   (re-pattern "You're using Google to log in to"))))))))))

(deftest forgot-password-google-sso-disabled-test
  (testing "POST /api/session/forgot_password - Google SSO user can reset when Google SSO disabled"
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-temp [:model/User g-user {:first_name "g"
                                         :last_name "user"
                                         :email "g-user@gmail.com"
                                         :sso_source :google}]
        (let [my-url "abcdefghij"]
          (mt/with-temporary-setting-values [site-url my-url
                                             google-auth-client-id "pretend-client-id.apps.googleusercontent.com"
                                             google-auth-enabled false]
            (mt/with-fake-inbox
              (mt/user-http-request g-user :post 204 "session/forgot_password"
                                    {:email (:email g-user)})
              (is (mt/received-email-body?
                   (:email g-user)
                   (re-pattern "Click the button below to reset the password"))))))))))

(deftest forgot-password-event-test
  (mt/with-premium-features #{:audit-app}
    (with-redefs [api.session/forgot-password-impl
                  (let [orig @#'api.session/forgot-password-impl]
                    (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (mt/with-model-cleanup [:model/User]
        (testing "Test that forgot password event is logged."
          (mt/client :post 204 "session/forgot_password"
                     {:email (:username (mt/user->credentials :rasta))})
          (let [rasta-id (mt/user->id :rasta)]
            (is (=? {:topic    :password-reset-initiated
                     :model_id rasta-id
                     :model    "User"
                     :details  {:token (t2/select-one-fn :reset_token :model/User :id rasta-id)}}
                    (mt/latest-audit-log-entry :password-reset-initiated rasta-id)))))))))

(deftest forgot-password-throttling-test
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

(deftest reset-password-with-token-test
  (testing "POST /api/session/reset_password - reset password from token and verify token removed"
    (mt/with-fake-inbox
      (let [password {:old "password"
                      :new "whateverUP12!!"}]
        (mt/with-temp [:model/User {:keys [email id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
          (let [token (u/prog1 (str id "_" (random-uuid))
                        (t2/update! :model/User id {:reset_token <>}))
                creds {:old {:password (:old password)
                             :username email}
                       :new {:password (:new password)
                             :username email}}]
            (mt/client :post 200 "session" (:old creds))
            (is (=? {:session_id string/valid-uuid?
                     :success    true}
                    (mt/client :post 200 "session/reset_password" {:token    token
                                                                   :password (:new password)})))
            (is (= {:errors {:password "did not match stored password"}}
                   (mt/client :post 401 "session" (:old creds))))
            (is (malli= SessionResponse
                        (mt/client :post 200 "session" (:new creds))))
            (is (= {:reset_token     nil
                    :reset_triggered nil}
                   (mt/derecordize (t2/select-one [:model/User :reset_token :reset_triggered], :id id))))))))))

(deftest reset-password-throttling-test
  (testing "POST /api/session/reset_password - endpoint is throttled"
    (let [try!      (fn []
                      (try
                        (http/post (client/build-url "session/reset_password" {})
                                   {:form-params {"token" (str (random-uuid))
                                                  "password" (str (random-uuid))}
                                    :content-type :json})
                        ::succeeded
                        (catch Exception e
                          (or (some-> (ex-data e) :body json/decode+kw)
                              ::unknown-error))))
          responses (into [] (repeatedly 30 try!))]
      (is (nil? (some #{::succeeded ::unknown-error} responses)))
      (is (every? (comp :password :errors) responses))
      (is (some (comp #(re-find #"Invalid reset token" %) :password :errors) responses))
      (is (some (comp #(re-find #"Too many attempts!" %) :password :errors) responses)))))

(deftest reset-password-successful-event-test
  (mt/with-premium-features #{:audit-app}
    (testing "Test that a successful password reset creates the correct event"
      (mt/with-model-cleanup [:model/AuditLog :model/User]
        (mt/with-fake-inbox
          (let [password {:old "password"
                          :new "whateverUP12!!"}]
            (mt/with-temp [:model/User {:keys [id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
              (let [token       (u/prog1 (str id "_" (random-uuid))
                                  (t2/update! :model/User id {:reset_token <> :last_login :%now}))
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
        (t2/update! :model/User (mt/user->id :rasta) {:reset_token token, :reset_triggered 0})
        (is (=? {:errors {:password "Invalid reset token"}}
                (mt/client :post 400 "session/reset_password" {:token    token
                                                               :password "whateverUP12!!"})))))))

(deftest check-reset-token-valid-test
  (testing "GET /session/password_reset_token_valid"
    (testing "Check that a valid, unexpired token returns true"
      (let [token (str (mt/user->id :rasta) "_" (random-uuid))]
        (t2/update! :model/User (mt/user->id :rasta) {:reset_token token, :reset_triggered (dec (System/currentTimeMillis))})
        (is (= {:valid true}
               (mt/client :get 200 "session/password_reset_token_valid", :token token)))))

    (testing "Check than an made-up token returns false"
      (is (= {:valid false}
             (mt/client :get 200 "session/password_reset_token_valid", :token "ABCDEFG"))))

    (testing "Check that an expired but valid token returns false"
      (let [token (str (mt/user->id :rasta) "_" (random-uuid))]
        (t2/update! :model/User (mt/user->id :rasta) {:reset_token token, :reset_triggered 0})
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
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours (inc Integer/MAX_VALUE)]
        (is (= (inc Integer/MAX_VALUE) (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to zero"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours 0]
        (is (= 0 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))

    (testing "reset-token-ttl-hours-test is set to negative value"
      (mt/with-temp-env-var-value! [mb-reset-token-ttl-hours -1]
        (is (= -1 (setting/get-value-of-type :integer :reset-token-ttl-hours)))))))

(deftest properties-test
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
        (with-redefs [metabase.settings.models.setting/has-advanced-setting-access? (constantly true)]
          (is (= (set (keys (setting/user-readable-values-map #{:public :authenticated :settings-manager})))
                 (set (keys (mt/user-http-request :lucky :get 200 "session/properties"))))))))

    (testing "Authenticated super user"
      (mt/with-test-user :crowberto
        (is (= (set (keys (setting/user-readable-values-map #{:public :authenticated :settings-manager :admin})))
               (set (keys (mt/user-http-request :crowberto :get 200 "session/properties")))))))

    (testing "Includes user-local settings"
      (defsetting test-session-api-setting
        "test setting"
        :encryption :no
        :user-local :only
        :type       :string
        :default    "FOO")

      (mt/with-test-user :lucky
        (is (= "FOO"
               (-> (mt/user-http-request :crowberto :get 200 "session/properties")
                   :test-session-api-setting)))))))

(deftest properties-i18n-test
  (testing "GET /session/properties"
    (testing "Setting the X-Metabase-Locale header should result give you properties in that locale"
      (mt/with-mock-i18n-bundles! {"es" {:messages {"Connection String" "Cadena de conexión !"}}}
        (is (= "Cadena de conexión !"
               (-> (mt/client :get 200 "session/properties" {:request-options {:headers {"x-metabase-locale" "es"}}})
                   :engines :h2 :details-fields first :display-name)))))))

(deftest properties-skip-sensitive-test
  (testing "GET /session/properties"
    (testing "don't return the token for admins"
      (is (= nil
             (-> (mt/client :get 200 "session/properties" (mt/user->credentials :crowberto))
                 keys #{:premium-embedding-token}))))
    (testing "don't return the token for non-admins"
      (is (= nil
             (-> (mt/client :get 200 "session/properties" (mt/user->credentials :rasta))
                 keys #{:premium-embedding-token}))))))

(deftest properties-skip-include-in-list?=false
  (testing "GET /session/properties"
    (testing "don't return the version-info property"
      (is (= nil
             (-> (mt/client :get 200 "session/properties" (mt/user->credentials :crowberto))
                 keys #{:version-info}))))))

;;; ------------------------------------------- TESTS FOR GOOGLE SIGN-IN ---------------------------------------------

(deftest google-auth-remember-test
  (testing "POST /google_auth"
    (mt/with-temporary-setting-values [google-auth-client-id "pretend-client-id.apps.googleusercontent.com"]
      (mt/with-model-cleanup [:model/User]
        (t2/insert! :model/User (merge  (mt/with-temp-defaults :model/User) {:email "test@metabase.com" :is_active true}))
        (testing "Google auth works with remember me and rasta"
          (with-redefs [http/post (constantly
                                   {:status 200
                                    :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                 "\"email_verified\":\"true\","
                                                 "\"given_name\":\"test\","
                                                 "\"family_name\":\"user\","
                                                 "\"email\":\"test@metabase.com\"}")})]
            (testing "Test that 'remember me' checkbox sets expiration on session"
              (let [response (mt/client-real-response :post 200 "session/google_auth" {:token "foo" :remember true})]
                (is (some? (get-in response [:cookies session-cookie :expires])) "Session should have expiration set when remember=true"))
              (let [response (mt/client-real-response :post 200 "session/google_auth" {:token "foo" :remember false})]
                (is (nil? (get-in response [:cookies session-cookie :expires])) "Session should not have expiration set when remember=false")))))))))

(deftest google-auth-test
  (testing "POST /google_auth"
    (mt/with-temporary-setting-values [google-auth-client-id "pretend-client-id.apps.googleusercontent.com"]
      (testing "Google auth works with an active account"
        (mt/with-temp [:model/User {user-id :id} {:email "test@metabase.com"
                                                  :is_active true
                                                  :first_name "last"
                                                  :last_name "luser"}]
          (with-redefs [http/post (constantly
                                   {:status 200
                                    :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                 "\"email_verified\":\"true\","
                                                 "\"given_name\":\"test\","
                                                 "\"family_name\":\"user\","
                                                 "\"email\":\"test@metabase.com\"}")})]
            (testing "with throttling enabled"
              (is (malli= SessionResponse
                          (mt/client :post 200 "session/google_auth" {:token "foo"})))
              (is (=? {:first_name "test"
                       :last_name "user"}
                      (t2/select-one :model/User user-id))))
            (testing "with throttling disabled"
              (with-redefs [api.session/throttling-disabled? true]
                (is (malli= SessionResponse
                            (mt/client :post 200 "session/google_auth" {:token "foo"}))))))))
      (testing "Google auth throws exception for a disabled account"
        (mt/with-temp [:model/User _ {:email "test@metabase.com" :is_active false}]
          (with-redefs [http/post (constantly
                                   {:status 200
                                    :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                 "\"email_verified\":\"true\","
                                                 "\"given_name\":\"test\","
                                                 "\"family_name\":\"user\","
                                                 "\"email\":\"test@metabase.com\"}")})]
            (is (= {:errors {:_error "Your account is disabled."}}
                   (mt/client :post 401 "session/google_auth" {:token "foo"})))))))))

;;; ------------------------------------------- TESTS FOR LDAP AUTH STUFF --------------------------------------------

(deftest ldap-login-fallback-to-local-test
  (testing "LDAP login - fallback to local for users not in LDAP"
    (ldap.test/with-ldap-server!
      (mt/with-temporary-setting-values [enable-password-login true]
        (is (malli= SessionResponse
                    (mt/client :post 200 "session" (mt/user->credentials :crowberto))))))))

(deftest ldap-login-fallback-disabled-when-password-disabled-test
  (testing "LDAP login - no fallback when password login disabled"
    (ldap.test/with-ldap-server!
      (mt/with-premium-features #{:disable-password-login}
        (mt/with-temporary-setting-values [enable-password-login false]
          (is (= "Password login is disabled for this instance."
                 (mt/client :post 401 "session" (mt/user->credentials :crowberto)))))))))

(deftest ldap-login-no-fallback-for-invalid-ldap-password-test
  (testing "LDAP login - no fallback for users in LDAP with invalid password"
    (ldap.test/with-ldap-server!
      (is (= {:errors {:password "did not match stored password"}}
             (mt/client :post 401 "session" (mt/user->credentials :lucky)))))))

(deftest ldap-login-deactivated-user-test
  (testing "LDAP login - deactivated user cannot login"
    (ldap.test/with-ldap-server!
      (mt/with-temp [:model/User _ {:email    "sally.brown@metabase.com"
                                    :is_active false}]
        (is (= {:errors {:_error "Your account is disabled."}}
               (mt/client :post 401 "session" {:username "sally.brown@metabase.com"
                                               :password "1234"})))))))

(deftest ldap-login-fallback-for-broken-settings-test
  (testing "LDAP login - fallback to local for broken LDAP settings"
    (ldap.test/with-ldap-server!
      (mt/with-temporary-setting-values [ldap-user-base "cn=wrong,cn=com"]
        (mt/with-temp [:model/User _ {:email    "sally.brown@metabase.com"
                                      :password "1234"}]
          (is (malli= SessionResponse
                      (mt/client :post 200 "session" {:username "sally.brown@metabase.com"
                                                      :password "1234"}))))))))

(deftest ldap-login-fallback-for-slow-ldap-test
  (testing "LDAP login - fallback to local for slow LDAP"
    (ldap.test/with-ldap-server!
      (mt/with-temporary-setting-values [ldap-timeout-seconds 0.01]
        (mt/with-dynamic-fn-redefs [metabase.sso.ldap.default-implementation/search (fn [& _args]
                                                                                      (Thread/sleep 500))]
          (mt/with-temp [:model/User _ {:email    "sally.brown@metabase.com"
                                        :password "1234"}]
            (is (malli= SessionResponse
                        (mt/client :post 200 "session" {:username "sally.brown@metabase.com"
                                                        :password "1234"})))))))))

(deftest ldap-login-new-user-test
  (testing "LDAP login - can login with new user"
    (ldap.test/with-ldap-server!
      (try
        (is (malli= SessionResponse
                    (mt/client :post 200 "session" {:username "sbrown20", :password "1234"})))
        (finally
          (t2/delete! :model/User :email "sally.brown@metabase.com"))))))

(deftest ldap-login-uppercase-email-test
  (testing "LDAP login - can login multiple times with uppercase email (#13739)"
    (ldap.test/with-ldap-server!
      (try
        (is (malli=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (is (malli=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (finally
          (t2/delete! :model/User :email "john.smith@metabase.com"))))))

(deftest ldap-login-group-sync-without-uid-test
  (testing "LDAP login - group sync works even if ldap doesn't return uid (#22014)"
    (ldap.test/with-ldap-server!
      (mt/with-temp [:model/PermissionsGroup group {:name "Accounting"}]
        (mt/with-temporary-raw-setting-values
          [ldap-group-mappings (json/encode {"cn=Accounting,ou=Groups,dc=metabase,dc=com" [(:id group)]})]
          (is (malli= SessionResponse
                      (mt/client :post 200 "session" {:username "fred.taylor@metabase.com", :password "pa$$word"})))
          (let [user-id (t2/select-one-pk :model/User :email "fred.taylor@metabase.com")]
            (is (t2/exists? :model/PermissionsGroupMembership :group_id (u/the-id group) :user_id (u/the-id user-id)))))))))

(deftest no-password-no-login-test
  (testing "A user with no password should not be able to do password-based login"
    (mt/with-temp [:model/User user]
      (t2/update! :model/User (u/the-id user) {:password nil, :password_salt nil})
      (let [device-info {:device_id          "Cam's Computer"
                         :device_description "The computer where Cam wrote this test"
                         :embedded            false
                         :ip_address         "192.168.1.1"}]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Password did not match stored password"
             (#'api.session/login (:email user) "password" device-info)))))))

(deftest ^:parallel password-check-test
  (testing "POST /api/session/password-check"
    (testing "Test for required params"
      (is (=? {:errors {:password "password is too common."}}
              (mt/client :post 400 "session/password-check" {}))))))

(deftest ^:parallel password-check-test-2
  (testing "POST /api/session/password-check"
    (testing "Test complexity check"
      (is (=? {:errors {:password "password is too common."}}
              (mt/client :post 400 "session/password-check" {:password "blah"}))))))

(deftest ^:parallel password-check-test-3
  (testing "POST /api/session/password-check"
    (testing "Should be a valid password"
      (is (= {:valid true}
             (mt/client :post 200 "session/password-check" {:password "something123"}))))))
