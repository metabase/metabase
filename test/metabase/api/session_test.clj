(ns metabase.api.session-test
  "Tests for /api/session"
  (:require [cheshire.core :as json]
            [clj-http.client :as http]
            [clojure.test :refer :all]
            [metabase.api.session :as session-api]
            [metabase.driver.h2 :as h2]
            [metabase.email-test :as et]
            [metabase.http-client :as http-client]
            [metabase.models :refer [LoginHistory]]
            [metabase.models.session :refer [Session]]
            [metabase.models.setting :as setting]
            [metabase.models.user :refer [User]]
            [metabase.public-settings :as public-settings]
            [metabase.server.middleware.session :as mw.session]
            [metabase.test :as mt]
            [metabase.test.data.users :as test-users]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.integrations.ldap :as ldap.test]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.util.UUID))

;; one of the tests below compares the way properties for the H2 driver are translated, so we need to make sure it's
;; loaded
(comment h2/keep-me)

(use-fixtures :once (fixtures/initialize :db :web-server :test-users))

(use-fixtures :each (fn [thunk]
                      ;; reset login throtllers
                      (doseq [throttler (vals @#'session-api/login-throttlers)]
                        (reset! (:attempts throttler) nil))
                      (thunk)))

(def ^:private SessionResponse
  {:id (s/pred mt/is-uuid-string? "session")})

(def ^:private session-cookie @#'mw.session/metabase-session-cookie)

(deftest login-test
  (testing "POST /api/session"
    (testing "Test that we can login"
      (is (schema= SessionResponse
                   (mt/client :post 200 "session" (mt/user->credentials :rasta)))))
    (testing "Test that we can login with email of mixed case"
      (let [creds    (update (mt/user->credentials :rasta) :username u/upper-case-en)
            response (mt/client :post 200 "session" creds)]
        (is (schema= SessionResponse
                     response))
        (testing "Login should record a LoginHistory item"
          (is (schema= {:id                 su/IntGreaterThanZero
                        :timestamp          java.time.OffsetDateTime
                        :user_id            (s/eq (mt/user->id :rasta))
                        :device_id          http-client/UUIDString
                        :device_description su/NonBlankString
                        :ip_address         su/NonBlankString
                        :active             (s/eq true)
                        s/Keyword s/Any}
                       (db/select-one LoginHistory :user_id (mt/user->id :rasta), :session_id (:id response)))))))
    (testing "Test that 'remember me' checkbox sets Max-Age attribute on session cookie"
      (let [body (assoc (mt/user->credentials :rasta) :remember true)
            response (mt/client-full-response :post 200 "session" body)]
        ;; clj-http sets :expires key in response when Max-Age attribute is set
        (is (get-in response [:cookies session-cookie :expires])))
      (let [body (assoc (mt/user->credentials :rasta) :remember false)
            response (mt/client-full-response :post 200 "session" body)]
        (is (nil? (get-in response [:cookies session-cookie :expires]))))))
  (testing "failure should log an error(#14317)"
    (mt/with-temp User [user]
      (is (schema= [(s/one (s/eq :error)
                           "log type")
                    (s/one clojure.lang.ExceptionInfo
                           "exception")
                    (s/one (s/eq "Authentication endpoint error")
                           "log message")]
                   (first (mt/with-log-messages-for-level :error
                            (mt/client :post 400 "session" {:email (:email user), :password "wooo"}))))))))

(deftest login-validation-test
  (testing "POST /api/session"
    (testing "Test for required params"
      (is (= {:errors {:username "value must be a non-blank string."}}
             (mt/client :post 400 "session" {})))

      (is (= {:errors {:password "value must be a non-blank string."}}
             (mt/client :post 400 "session" {:username "anything@metabase.com"}))))

    (testing "Test for inactive user (user shouldn't be able to login if :is_active = false)"
      ;; Return same error as incorrect password to avoid leaking existence of user
      (is (= {:errors {:_error "Your account is disabled."}}
             (mt/client :post 401 "session" (mt/user->credentials :trashbird)))))

    (testing "Test for password checking"
      (is (= {:errors {:password "did not match stored password"}}
             (mt/client :post 401 "session" (-> (mt/user->credentials :rasta)
                                             (assoc :password "something else"))))))))

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
        (is (schema= [(s/one (s/eq :error)
                             "log type")
                      (s/one clojure.lang.ExceptionInfo
                             "exception")
                      (s/one (s/eq "Authentication endpoint error")
                             "log message")]
                     (first (mt/with-log-messages-for-level :error
                              (login))))))
      (is (re= #"^Too many attempts! You must wait \d+ seconds before trying again\.$"
               (login))
          "Trying to login immediately again should still return throttling error"))))

(defn- send-login-request [username & [{:or {} :as headers}]]
  (try
    (http/post (http-client/build-url "session" {})
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
    (with-redefs [session-api/login-throttlers          (cleaned-throttlers #'session-api/login-throttlers
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
        (is (re= #"^Too many attempts! You must wait 1\d seconds before trying again\.$"
                 (error)))
        (is (re= #"^Too many attempts! You must wait 4\d seconds before trying again\.$"
                 (error)))))))

(deftest failure-threshold-per-request-source
  (testing "The same as above, but ensure that throttling is done on a per request source basis."
    (with-redefs [session-api/login-throttlers          (cleaned-throttlers #'session-api/login-throttlers
                                                                            [:username :ip-address])
                  public-settings/source-address-header (constantly "x-forwarded-for")]
      (dotimes [n 50]
        (let [response    (send-login-request (format "user-%d" n)
                                              {"x-forwarded-for" "10.1.2.3"})
              status-code (:status response)]
          (assert (= status-code 401) (str "Unexpected response status code:" status-code))))
      (dotimes [n 50]
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
  (testing "DELETE /api/session"
    (testing "Test that we can logout"
      ;; clear out cached session tokens so next time we make an API request it log in & we'll know we have a valid
      ;; Session
      (test-users/clear-cached-session-tokens!)
      (let [session-id       (test-users/username->token :rasta)
            login-history-id (db/select-one-id LoginHistory :session_id session-id)]
        (testing "LoginHistory should have been recorded"
          (is (integer? login-history-id)))
        ;; Ok, calling the logout endpoint should delete the Session in the DB. Don't worry, `test-users` will log back
        ;; in on the next API call
        (mt/user-http-request :rasta :delete 204 "session")
        ;; check whether it's still there -- should be GONE
        (is (= nil
               (Session session-id)))
        (testing "LoginHistory item should still exist, but session_id should be set to nil (active = false)"
          (is (schema= {:id                 (s/eq login-history-id)
                        :timestamp          java.time.OffsetDateTime
                        :user_id            (s/eq (mt/user->id :rasta))
                        :device_id          http-client/UUIDString
                        :device_description su/NonBlankString
                        :ip_address         su/NonBlankString
                        :active             (s/eq false)
                        s/Keyword           s/Any}
                       (LoginHistory login-history-id))))))))

(deftest forgot-password-test
  (testing "POST /api/session/forgot_password"
    ;; deref forgot-password-impl for the tests since it returns a future
    (with-redefs [session-api/forgot-password-impl
                  (let [orig @#'session-api/forgot-password-impl]
                     (fn [& args] (u/deref-with-timeout (apply orig args) 1000)))]
      (testing "Test that we can initiate password reset"
        (et/with-fake-inbox
          (letfn [(reset-fields-set? []
                    (let [{:keys [reset_token reset_triggered]} (db/select-one [User :reset_token :reset_triggered]
                                                                  :id (mt/user->id :rasta))]
                      (boolean (and reset_token reset_triggered))))]
            ;; make sure user is starting with no values
            (db/update! User (mt/user->id :rasta), :reset_token nil, :reset_triggered nil)
            (assert (not (reset-fields-set?)))
            ;; issue reset request (token & timestamp should be saved)
            (is (= nil
                   (mt/user-http-request :rasta :post 204 "session/forgot_password" {:email (:username (mt/user->credentials :rasta))}))
                "Request should return no content")
            (is (= true
                   (reset-fields-set?))
                "User `:reset_token` and `:reset_triggered` should be updated")
            (is (= "[Metabase] Password Reset Request"
                   (-> @et/inbox (get "rasta@metabase.com") first :subject))
                "User should get a password reset email"))))

      (testing "test that email is required"
        (is (= {:errors {:email "value must be a valid email address."}}
               (mt/client :post 400 "session/forgot_password" {}))))

      (testing "Test that email not found also gives 200 as to not leak existence of user"
        (is (= nil
               (mt/client :post 204 "session/forgot_password" {:email "not-found@metabase.com"})))))))

(deftest forgot-password-throttling-test
  (testing "Test that email based throttling kicks in after the login failure threshold (10) has been reached"
    (letfn [(send-password-reset [& [expected-status & more]]
              (mt/client :post (or expected-status 204) "session/forgot_password" {:email "not-found@metabase.com"}))]
      (with-redefs [session-api/forgot-password-throttlers (cleaned-throttlers #'session-api/forgot-password-throttlers
                                                                               [:email :ip-address])]
        (dotimes [n 10]
          (send-password-reset))
        (let [error (fn []
                      (-> (send-password-reset 400)
                          :errors
                          :email))]
          (is (= "Too many attempts! You must wait 15 seconds before trying again."
                 (error)))
          ;;`throttling/check` gives 15 in stead of 42
          (is (= "Too many attempts! You must wait 15 seconds before trying again."
                 (error))))))))

(deftest reset-password-test
  (testing "POST /api/session/reset_password"
    (testing "Test that we can reset password from token (AND after token is used it gets removed)"
      (et/with-fake-inbox
        (let [password {:old "password"
                        :new "whateverUP12!!"}]
          (mt/with-temp User [{:keys [email id]} {:password (:old password), :reset_triggered (System/currentTimeMillis)}]
            (let [token (u/prog1 (str id "_" (UUID/randomUUID))
                          (db/update! User id, :reset_token <>))
                  creds {:old {:password (:old password)
                               :username email}
                         :new {:password (:new password)
                               :username email}}]
              ;; Check that creds work
              (mt/client :post 200 "session" (:old creds))
              ;; Call reset password endpoint to change the PW
              (testing "reset password endpoint should return a valid session token"
                (is (schema= {:session_id (s/pred mt/is-uuid-string? "session")
                              :success    (s/eq true)}
                             (mt/client :post 200 "session/reset_password" {:token    token
                                                                            :password (:new password)}))))
              (testing "Old creds should no longer work"
                (is (= {:errors {:password "did not match stored password"}}
                       (mt/client :post 401 "session" (:old creds)))))
              (testing "New creds *should* work"
                (is (schema= SessionResponse
                             (mt/client :post 200 "session" (:new creds)))))
              (testing "check that reset token was cleared"
                (is (= {:reset_token     nil
                        :reset_triggered nil}
                       (mt/derecordize (db/select-one [User :reset_token :reset_triggered], :id id))))))))))))

(deftest reset-password-validation-test
  (testing "POST /api/session/reset_password"
    (testing "Test that token and password are required"
      (is (= {:errors {:token "value must be a non-blank string."}}
             (mt/client :post 400 "session/reset_password" {})))
      (is (= {:errors {:password "password is too common."}}
             (mt/client :post 400 "session/reset_password" {:token "anything"}))))

    (testing "Test that malformed token returns 400"
      (is (= {:errors {:password "Invalid reset token"}}
             (mt/client :post 400 "session/reset_password" {:token    "not-found"
                                                            :password "whateverUP12!!"}))))

    (testing "Test that invalid token returns 400"
      (is (= {:errors {:password "Invalid reset token"}}
             (mt/client :post 400 "session/reset_password" {:token    "1_not-found"
                                                            :password "whateverUP12!!"}))))

    (testing "Test that an expired token doesn't work"
      (let [token (str (mt/user->id :rasta) "_" (UUID/randomUUID))]
        (db/update! User (mt/user->id :rasta), :reset_token token, :reset_triggered 0)
        (is (= {:errors {:password "Invalid reset token"}}
               (mt/client :post 400 "session/reset_password" {:token    token
                                                              :password "whateverUP12!!"})))))))

(deftest check-reset-token-valid-test
  (testing "GET /session/password_reset_token_valid"
    (testing "Check that a valid, unexpired token returns true"
      (let [token (str (mt/user->id :rasta) "_" (UUID/randomUUID))]
        (db/update! User (mt/user->id :rasta), :reset_token token, :reset_triggered (dec (System/currentTimeMillis)))
        (is (= {:valid true}
               (mt/client :get 200 "session/password_reset_token_valid", :token token)))))

    (testing "Check than an made-up token returns false"
      (is (= {:valid false}
             (mt/client :get 200 "session/password_reset_token_valid", :token "ABCDEFG"))))

    (testing "Check that an expired but valid token returns false"
      (let [token (str (mt/user->id :rasta) "_" (UUID/randomUUID))]
        (db/update! User (mt/user->id :rasta), :reset_token token, :reset_triggered 0)
        (is (= {:valid false}
               (mt/client :get 200 "session/password_reset_token_valid", :token token)))))))

(deftest properties-test
  (testing "GET /session/properties"
    (testing "Unauthenticated"
      (is (= (set (keys (setting/properties :public)))
             (set (keys (mt/client :get 200 "session/properties"))))))

    (testing "Authenticated normal user"
      (is (= (set (keys (merge
                         (setting/properties :public)
                         (setting/properties :authenticated))))
             (set (keys (mt/user-http-request :lucky :get 200 "session/properties"))))))

    (testing "Authenticated super user"
      (is (= (set (keys (merge
                         (setting/properties :public)
                         (setting/properties :authenticated)
                         (setting/properties :admin))))
             (set (keys (mt/user-http-request :crowberto :get 200 "session/properties"))))))))

(deftest properties-i18n-test
  (testing "GET /session/properties"
    (testing "Setting the X-Metabase-Locale header should result give you properties in that locale"
      (mt/with-mock-i18n-bundles {"es" {"Connection String" "Cadena de conexión !"}}
        (is (= "Cadena de conexión !"
               (-> (mt/client :get 200 "session/properties" {:request-options {:headers {"X-Metabase-Locale" "es"}}})
                   :engines :h2 :details-fields first :display-name)))))))


;;; ------------------------------------------- TESTS FOR GOOGLE SIGN-IN ---------------------------------------------

(deftest google-auth-test
  (testing "POST /google_auth"
    (mt/with-temporary-setting-values [google-auth-client-id "PRETEND-GOOD-GOOGLE-CLIENT-ID"]
      (testing "Google auth works with an active account"
        (mt/with-temp User [user {:email "test@metabase.com" :is_active true}]
          (with-redefs [http/post (fn [url] {:status 200
                                             :body   (str "{\"aud\":\"PRETEND-GOOD-GOOGLE-CLIENT-ID\","
                                                          "\"email_verified\":\"true\","
                                                          "\"first_name\":\"test\","
                                                          "\"last_name\":\"user\","
                                                          "\"email\":\"test@metabase.com\"}")})]
            (is (schema= SessionResponse
                         (mt/client :post 200 "session/google_auth" {:token "foo"}))))))
      (testing "Google auth throws exception for a disabled account"
        (mt/with-temp User [user {:email "test@metabase.com" :is_active false}]
          (with-redefs [http/post (fn [url] {:status 200
                                             :body   (str "{\"aud\":\"PRETEND-GOOD-GOOGLE-CLIENT-ID\","
                                                          "\"email_verified\":\"true\","
                                                          "\"first_name\":\"test\","
                                                          "\"last_name\":\"user\","
                                                          "\"email\":\"test@metabase.com\"}")})]
            (is (= {:errors {:account "Your account is disabled."}}
                   (mt/client :post 401 "session/google_auth" {:token "foo"})))))))))

;;; ------------------------------------------- TESTS FOR LDAP AUTH STUFF --------------------------------------------

(deftest ldap-login-test
  (ldap.test/with-ldap-server
    (testing "Test that we can login with LDAP"
      (let [user-id (test-users/user->id :rasta)]
        (try
          (db/simple-delete! Session :user_id user-id)
          (is (schema= SessionResponse
                       (mt/client :post 200 "session" (mt/user->credentials :rasta))))
          (finally
            (db/update! User user-id :login_attributes nil)))))

    (testing "Test that login will fallback to local for users not in LDAP"
      (mt/with-temporary-setting-values [enable-password-login true]
        (is (schema= SessionResponse
                     (mt/client :post 200 "session" (mt/user->credentials :crowberto)))))
      (testing "...but not if password login is disabled"
        (mt/with-temporary-setting-values [enable-password-login false]
          (is (= "Password login is disabled for this instance."
                 (mt/client :post 401 "session" (mt/user->credentials :crowberto)))))))

    (testing "Test that login will NOT fallback for users in LDAP but with an invalid password"
      ;; NOTE: there's a different password in LDAP for Lucky
      (is (= {:errors {:password "did not match stored password"}}
             (mt/client :post 401 "session" (mt/user->credentials :lucky)))))

    (testing "Test that a deactivated user cannot login with LDAP"
      (let [user-id (test-users/user->id :rasta)]
        (try
          (db/update! User user-id :is_active false)
          (is (= {:errors {:_error "Your account is disabled."}}
                 (mt/client :post 401 "session" (mt/user->credentials :rasta))))
          (finally
            (db/update! User user-id :is_active true)))))

    (testing "Test that login will fallback to local for broken LDAP settings"
      (mt/with-temporary-setting-values [ldap-user-base "cn=wrong,cn=com"]
        ;; delete all other sessions for the bird first, otherwise test doesn't seem to work (TODO - why?)
        (let [user-id (test-users/user->id :rasta)]
          (try
            (db/simple-delete! Session :user_id user-id)
            (is (schema= SessionResponse
                         (mt/client :post 200 "session" (mt/user->credentials :rasta))))
            (finally
              (db/update! User user-id :login_attributes nil))))))

    (testing "Test that we can login with LDAP with new user"
      (try
        (is (schema= SessionResponse
                     (mt/client :post 200 "session" {:username "sbrown20", :password "1234"})))
        (finally
          (db/delete! User :email "sally.brown@metabase.com"))))

    (testing "Test that we can login with LDAP multiple times if the email stored in LDAP contains upper-case
             characters (#13739)"
      (try
        (is (schema=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (is (schema=
             SessionResponse
             (mt/client :post 200 "session" {:username "John.Smith@metabase.com", :password "strongpassword"})))
        (finally
          (db/delete! User :email "John.Smith@metabase.com"))))))
