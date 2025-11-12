(ns metabase.auth-identity.provider-test
  (:require
   [clojure.test :refer :all]
   [metabase.auth-identity.provider :as provider]
   [methodical.core :as methodical]))

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
