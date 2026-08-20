(ns metabase.auth-identity.provider-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.auth-identity.provider :as provider]
   [metabase.test :as mt]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;; Set up test providers for testing the hierarchy
(derive :provider/test-password ::provider/provider)
(derive :provider/test-ldap ::provider/provider)
(derive :provider/test-ldap ::provider/create-user-if-not-exists)

(deftest ^:parallel provider-hierarchy-test
  (testing "Provider hierarchy works correctly"
    (testing "Providers can derive from ::provider/provider"
      (is (isa? :provider/test-password ::provider/provider))
      (is (isa? :provider/test-ldap ::provider/provider)))

    (testing "SSO providers can derive from ::provider/create-user-if-not-exists"
      (is (isa? :provider/test-ldap ::provider/create-user-if-not-exists)))

    (testing "Password providers do NOT derive from create-user-if-not-exists"
      (is (not (isa? :provider/test-password ::provider/create-user-if-not-exists))))))

(deftest ^:parallel validate-multimethod-test
  (testing "validate multimethod has default implementation"
    (testing "Default validate returns nil (no-op)"
      (is (nil? (provider/validate :provider/test-password {:credentials {:password_hash "hash"}})))
      (is (nil? (provider/validate :provider/test-ldap {:metadata {:email "test@example.com"}}))))))

(deftest ^:parallel authenticate-multimethod-test
  (testing "authenticate multimethod"
    (testing "Default implementation throws for unimplemented providers"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Authentication not implemented"
           (provider/authenticate :provider/test-password {:email "test@example.com" :password "secret"}))))))

(deftest ^:parallel provider-string-conversion-test
  (testing "provider-string->keyword converts strings to provider keywords"
    (is (= :provider/password (provider/provider-string->keyword "password")))
    (is (= :provider/emailed-secret (provider/provider-string->keyword "emailed-secret")))
    (is (= :provider/ldap (provider/provider-string->keyword "ldap")))
    (is (= :provider/google (provider/provider-string->keyword "google")))
    (is (= :provider/jwt (provider/provider-string->keyword "jwt")))
    (is (= :provider/saml (provider/provider-string->keyword "saml"))))

  (testing "provider-keyword->string converts keywords to strings"
    (is (= "password" (provider/provider-keyword->string :provider/password)))
    (is (= "emailed-secret" (provider/provider-keyword->string :provider/emailed-secret)))
    (is (= "ldap" (provider/provider-keyword->string :provider/ldap)))
    (is (= "google" (provider/provider-keyword->string :provider/google)))
    (is (= "jwt" (provider/provider-keyword->string :provider/jwt)))
    (is (= "saml" (provider/provider-keyword->string :provider/saml))))

  (testing "Round-trip conversion works"
    (doseq [provider-str ["password" "emailed-secret" "ldap" "google" "jwt" "saml"]]
      (is (= provider-str
             (-> provider-str
                 provider/provider-string->keyword
                 provider/provider-keyword->string))))))

(deftest login!-default-implementation-test
  (testing "login! default implementation handles redirect responses"
    (testing "Returns redirect response unchanged when authenticate returns :redirect"
      ;; Create a test provider that returns redirect
      (derive :provider/test-redirect ::provider/provider)
      (methodical/defmethod provider/authenticate :provider/test-redirect
        [_provider _request]
        {:success? :redirect
         :redirect-url "https://example.com/oauth"
         :message "Redirecting to provider"})

      (let [result (provider/login! :provider/test-redirect
                                    {:device-info {:device_id "test" :ip_address "127.0.0.1"}})]
        (is (= :redirect (:success? result)))
        (is (= "https://example.com/oauth" (:redirect-url result)))
        (is (= "Redirecting to provider" (:message result)))
        (is (nil? (:session result)))
        (is (nil? (:user result))))))

  (testing "login! default implementation handles failure responses"
    (testing "Returns error response unchanged when authenticate fails"
      ;; Create a test provider that returns error
      (derive :provider/test-error ::provider/provider)
      (methodical/defmethod provider/authenticate :provider/test-error
        [_provider _request]
        {:success? false
         :error :invalid-credentials
         :message "Invalid credentials"})

      (let [result (provider/login! :provider/test-error
                                    {:email "test@example.com"
                                     :password "wrong"
                                     :device-info {:device_id "test" :ip_address "127.0.0.1"}})]
        (is (false? (:success? result)))
        (is (= :invalid-credentials (:error result)))
        (is (= "Invalid credentials" (:message result)))
        (is (nil? (:session result)))
        (is (nil? (:user result)))))))

(deftest create-user!-refuses-to-strip-tenant-id-test
  (testing (str "UXW-4898: when user-data carries :tenant_id but the sso-user-fields field list would strip it "
                "(e.g. a premium-feature check disagrees with the upstream tenant flow that stamped it), "
                "create-user! must throw rather than silently create a non-tenant user — such a user could "
                "never log in with its tenant claim again")
    (mt/with-premium-features #{:sso-jwt}
      (is (thrown-with-msg? clojure.lang.ExceptionInfo
                            #"tenant assignment could not be applied"
                            (#'provider/create-user! {:email      "uxw-4898-invariant@metabase.com"
                                                      :sso_source :jwt
                                                      :tenant_id  1}
                                                     :jwt))))))

(deftest ^:parallel ^:parallel three-valued-success-state-test
  (testing "Success states work correctly"
    (testing "Success state: true"
      (is (true? (:success? {:success? true :user-id 123}))))

    (testing "Success state: :redirect"
      (is (= :redirect (:success? {:success? :redirect :redirect-url "https://example.com"}))))

    (testing "Success state: false"
      (is (false? (:success? {:success? false :error :invalid-credentials}))))))

(deftest ^:parallel ^:parallel multimethod-dispatch-test
  (testing "Multimethod dispatch works with provider hierarchy"
    ;; Create a test provider that inherits from ::provider/provider
    (derive :provider/test-custom ::provider/provider)

    (testing "Custom provider inherits default validate implementation"
      (is (nil? (provider/validate :provider/test-custom {:credentials {:foo "bar"}}))))

    (testing "Custom provider inherits default authenticate implementation"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Authentication not implemented"
           (provider/authenticate :provider/test-custom {:token "test"}))))))

(deftest ^:parallel provider-id-in-authenticate-response-test
  (testing "authenticate method returns :provider-id in success response"
    (testing "Provider returns :provider-id for successful authentication"
      (derive :provider/test-with-provider-id ::provider/provider)
      (methodical/defmethod provider/authenticate :provider/test-with-provider-id
        [_provider {:keys [email] :as _request}]
        {:success? true
         :user-id 123
         :provider-id email})

      (let [result (provider/authenticate :provider/test-with-provider-id {:email "user@example.com" :password "secret"})]
        (is (true? (:success? result)))
        (is (= 123 (:user-id result)))
        (is (= "user@example.com" (:provider-id result))))))

  (testing "authenticate docstring documents :provider-id return value"
    (let [docstring (-> #'provider/authenticate meta :doc)]
      (is (string? docstring))
      (is (re-find #":provider-id" docstring)))))

(deftest ^:parallel provider-id-flow-in-login-test
  (testing "login! :around flows :provider-id to user-data"
    (testing "When authenticate returns :provider-id and :user-data, it gets merged into :user-data"
      (derive :provider/test-provider-id-flow ::provider/provider)
      (methodical/defmethod provider/authenticate :provider/test-provider-id-flow
        [_provider _request]
        {:success? true
         :user-data {:email "newuser@example.com"
                     :first_name "Test"
                     :last_name "User"
                     :sso_source :test}
         :provider-id "newuser@example.com"})

      ;; Test that the :around method merges :provider-id into :user-data
      (let [auth-result (provider/authenticate :provider/test-provider-id-flow {:token "test"})]
        (is (true? (:success? auth-result)))
        (is (= "newuser@example.com" (:provider-id auth-result)))
        (is (contains? (:user-data auth-result) :email))
        (is (not (contains? (:user-data auth-result) :provider-id)))

        ;; Simulate what login! :around does
        (let [merged-request (cond-> auth-result
                               (and (:provider-id auth-result) (:user-data auth-result))
                               (assoc-in [:user-data :provider-id] (:provider-id auth-result)))]
          (is (= "newuser@example.com" (get-in merged-request [:user-data :provider-id]))))))))

(deftest ^:parallel authenticate-expired-auth-identity-test
  (testing "Authentication fails when auth-identity has expired"
    (derive :provider/test-expired ::provider/provider)
    (methodical/defmethod provider/authenticate :provider/test-expired
      [_provider _request]
      {:success? true
       :user-id 123
       :auth-identity {:id 1
                       :user_id 123
                       :provider "test-expired"
                       :expires_at (t/minus (t/offset-date-time) (t/hours 1))}})

    (let [result (provider/authenticate :provider/test-expired {:email "test@example.com"})]
      (is (false? (:success? result))
          "Authentication should fail for expired auth-identity")
      (is (= :authentication-expired (:error result))
          "Error should be :authentication-expired")
      (is (some? (:message result))
          "Should have error message"))))

(deftest ^:parallel authenticate-not-expired-auth-identity-test
  (testing "Authentication succeeds when auth-identity has not expired"
    (derive :provider/test-not-expired ::provider/provider)
    (methodical/defmethod provider/authenticate :provider/test-not-expired
      [_provider _request]
      {:success? true
       :user-id 123
       :auth-identity {:id 1
                       :user_id 123
                       :provider "test-not-expired"
                       :expires_at (t/plus (t/offset-date-time) (t/hours 24))}})

    (let [result (provider/authenticate :provider/test-not-expired {:email "test@example.com"})]
      (is (true? (:success? result))
          "Authentication should succeed for non-expired auth-identity")
      (is (nil? (:error result))
          "Should not have error")
      (is (= 123 (:user-id result))
          "Should return user-id"))))

(deftest ^:parallel authenticate-no-expiration-test
  (testing "Authentication succeeds when auth-identity has no expiration (nil expires_at)"
    (derive :provider/test-no-expiration ::provider/provider)
    (methodical/defmethod provider/authenticate :provider/test-no-expiration
      [_provider _request]
      {:success? true
       :user-id 123
       :auth-identity {:id 1
                       :user_id 123
                       :provider "test-no-expiration"
                       :expires_at nil}})

    (let [result (provider/authenticate :provider/test-no-expiration {:email "test@example.com"})]
      (is (true? (:success? result))
          "Authentication should succeed when no expiration set")
      (is (nil? (:error result))
          "Should not have error")
      (is (= 123 (:user-id result))
          "Should return user-id"))))

(deftest ^:parallel authenticate-no-auth-identity-test
  (testing "Authentication with no auth-identity bypasses expiration check"
    (derive :provider/test-no-auth-identity ::provider/provider)
    (methodical/defmethod provider/authenticate :provider/test-no-auth-identity
      [_provider _request]
      {:success? true
       :user-data {:email "newuser@example.com"
                   :first_name "New"
                   :last_name "User"}})

    (let [result (provider/authenticate :provider/test-no-auth-identity {:token "abc123"})]
      (is (true? (:success? result))
          "Authentication should succeed without auth-identity")
      (is (nil? (:error result))
          "Should not have error")
      (is (some? (:user-data result))
          "Should have user-data for new user creation"))))

;;; -------------------------------------- Session forgery regression tests --------------------------------------

;; These providers read the account to log in from `:token`, which is legitimately caller-supplied, so
;; the tests can name a temp user without redefining a method inside a `with-temp` body.

(derive :provider/test-forgery-failure ::provider/provider)

(methodical/defmethod provider/authenticate :provider/test-forgery-failure
  [_provider _request]
  ;; every failure branch of every real provider returns exactly this shape: no :user-id
  {:success? false
   :error :invalid-credentials
   :message "Invalid credentials"})

(derive :provider/test-forgery-success ::provider/provider)

(methodical/defmethod provider/authenticate :provider/test-forgery-success
  [_provider {:keys [token]}]
  {:success? true :user-id (parse-long token)})

(derive :provider/test-forgery-redirect ::provider/provider)

(methodical/defmethod provider/authenticate :provider/test-forgery-redirect
  [_provider {:keys [token]}]
  {:success? :redirect
   :redirect-url "https://example.com/oauth"
   :user-id (parse-long token)})

;; SSO shape (JWT/SAML/Google): identity comes from the email in `:user-data`, and no `:user-id` is
;; returned — the shape where dropping caller-owned keys is load-bearing, since resolution reads
;; `:user-id` before the email branch. Takes the email from `:token` so a temp user can be named
;; without redefining a method inside `with-temp`.
(derive :provider/test-forgery-sso ::provider/provider)

(methodical/defmethod provider/authenticate :provider/test-forgery-sso
  [_provider {:keys [token]}]
  {:success? true
   :user-data {:email token}})

;; Stands in for a provider whose `authenticate` hands back a non-scalar `:user-id` instead of the
;; positive int it owes, so resolution can be shown to fail closed.
(derive :provider/test-forgery-nonscalar-id ::provider/provider)

(methodical/defmethod provider/authenticate :provider/test-forgery-nonscalar-id
  [_provider {:keys [token]}]
  {:success? true :user-id {:raw token}})

;; `request/DeviceInfo` is a closed map, so this literal must match its key set exactly.
(def ^:private test-device-info
  {:device_id          "test-device"
   :device_description "Test Browser"
   :ip_address         "127.0.0.1"
   :embedded           false})

(deftest login!-ignores-caller-supplied-user-id-on-failed-authenticate-test
  (testing "a caller-injected :user-id does not survive a failed authenticate"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [result (provider/login! :provider/test-forgery-failure
                                    {:token "garbage"
                                     :user-id user-id
                                     :device-info test-device-info})]
        (is (false? (:success? result))
            "a failed authenticate must still report failure")
        (is (nil? (:user result))
            "the injected :user-id must not resolve a user")
        (is (nil? (:session result))
            "no session may be returned")
        (is (zero? (t2/count :model/Session :user_id user-id))
            "no session row may be written for the injected user")))))

(deftest login!-ignores-caller-supplied-success-and-session-test
  (testing "A caller may not assert its own :success?, :user or :session into a failed login"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [result (provider/login! :provider/test-forgery-failure
                                    {:token "garbage"
                                     :success? true
                                     :user {:id user-id :is_active true}
                                     :session {:key "forged"}
                                     :device-info test-device-info})]
        (is (false? (:success? result)))
        (is (nil? (:user result)))
        (is (nil? (:session result)))
        (is (zero? (t2/count :model/Session :user_id user-id)))))))

(deftest login!-does-not-create-session-for-redirect-test
  ;; `:success?` is `:redirect` while an OAuth/OIDC flow is being initiated — truthy, but not a login.
  (testing "a :redirect result mints no session"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [result (provider/login! :provider/test-forgery-redirect
                                    {:token (str user-id)
                                     :device-info test-device-info})]
        (is (= :redirect (:success? result)))
        (is (nil? (:session result)))
        (is (zero? (t2/count :model/Session :user_id user-id))
            "flow initiation must not write a session row")))))

(deftest login!-still-creates-session-for-genuine-success-test
  (testing "Regression guard: a genuinely successful authenticate still mints a session"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [result (provider/login! :provider/test-forgery-success
                                    {:token (str user-id)
                                     :device-info test-device-info})]
        (is (true? (:success? result)))
        (is (= user-id (get-in result [:user :id])))
        (is (some? (:session result)))
        (is (= 1 (t2/count :model/Session :user_id user-id)))))))

(deftest login!-caller-user-id-cannot-override-authenticated-identity-test
  ;; The SSO shape is where the dissoc earns its keep: authenticate returns no :user-id, so a caller's
  ;; survives the merge, and resolution reads :user-id before the :user-data email branch.
  (testing "a caller-injected :user-id does not override the identity authenticate resolved"
    (mt/with-temp [:model/User {real-id :id, real-email :email} {:is_active true}
                   :model/User {other-id :id}                    {:is_active true, :is_superuser true}]
      (let [result (provider/login! :provider/test-forgery-sso
                                    {:token       real-email
                                     :user-id     other-id
                                     :device-info test-device-info})]
        (is (= real-id (get-in result [:user :id]))
            "the email-resolved identity wins, not the injected :user-id")
        (is (= 1 (t2/count :model/Session :user_id real-id)))
        (is (zero? (t2/count :model/Session :user_id other-id))
            "no session for the injected (superuser) target")))))

(deftest login!-nonscalar-user-id-cannot-reach-query-sink-test
  (testing "a non-scalar :user-id resolves no user instead of reaching the query"
    (mt/with-temp [:model/User {user-id :id} {:is_active true}]
      (let [result (provider/login! :provider/test-forgery-nonscalar-id
                                    {:token       "1) OR (1=1) --"
                                     :device-info test-device-info})]
        (is (nil? (:user result))
            "a non-scalar :user-id resolves no user")
        (is (nil? (:session result))
            "and mints no session")
        (is (zero? (t2/count :model/Session :user_id user-id)))))))

(deftest ^:parallel authenticate-failure-bypasses-expiration-check-test
  (testing "Failed authentication bypasses expiration check"
    (derive :provider/test-auth-failure ::provider/provider)
    (methodical/defmethod provider/authenticate :provider/test-auth-failure
      [_provider _request]
      {:success? false
       :error :invalid-credentials
       :message "Invalid password"})

    (let [result (provider/authenticate :provider/test-auth-failure {:email "test@example.com" :password "wrong"})]
      (is (false? (:success? result))
          "Authentication should fail")
      (is (= :invalid-credentials (:error result))
          "Should have original error, not expiration error"))))
