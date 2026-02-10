(ns metabase-enterprise.sso.integrations.slack-connect-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase-enterprise.sso.test-setup :as sso.test-setup]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.encryption :as encryption]
   [methodical.core :as methodical]
   [ring.util.codec :as codec]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-encryption-key
  "Test encryption key for OIDC state encryption."
  "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(def ^:private test-secret
  "Hashed test encryption key."
  (encryption/secret-key->hash test-encryption-key))

(defmacro ^:private with-test-encryption!
  "Wraps body with test encryption key enabled. Use for tests that involve OIDC state cookies."
  [& body]
  `(with-redefs [encryption/default-secret-key test-secret]
     ~@body))

(defn- do-with-url-prefix-disabled
  "Test fixture that disables API URL prefix."
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each do-with-url-prefix-disabled)

(def ^:private default-redirect-uri "/")

(methodical/defmethod auth-identity/authenticate :provider/test-successful-oidc
  [_provider request]
  (if (some #(contains? request %) [:code :error :state])
    {:success? true
     :claims {}
     :user-data {:email "example@slack.com"}
     :provider-id "test-provider-id"}
    {:success? :redirect
     :redirect-url "http://example.com/slack"
     :state "test-state"
     :nonce "test-nonce"}))

(methodical/prefer-method! #'auth-identity/authenticate :provider/test-successful-oidc :provider/oidc)

(defmacro ^:private with-successful-oidc! [& body]
  `(do
     (derive :provider/slack-connect :provider/test-successful-oidc)
     ~@body
     (underive :provider/slack-connect :provider/test-successful-oidc)))

;;; -------------------------------------------------- Prerequisites Tests --------------------------------------------------

(deftest sso-prereqs-test
  (with-test-encryption!
    (sso.test-setup/do-with-other-sso-types-disabled!
     (fn []
       (mt/with-additional-premium-features #{:sso-slack}
         (testing "SSO requests fail if Slack Connect hasn't been configured or enabled"
           (mt/with-temporary-setting-values
             [slack-connect-enabled false
              slack-connect-client-id nil
              slack-connect-client-secret nil]
             (is
              (partial=
               {:cause "SSO has not been enabled and/or configured",
                :data {:status "error-sso-disabled", :status-code 400},
                :message "SSO has not been enabled and/or configured",
                :status "error-sso-disabled"}
               (mt/client :get 400 "/auth/sso"
                          {:request-options {:redirect-strategy :none}}
                          :preferred_method "slack-connect"))))

           (testing "SSO requests fail if they don't have a valid premium-features token"
             (sso.test-setup/call-with-default-slack-config!
              (fn []
                (mt/with-premium-features #{}
                  (is
                   (partial=
                    {:cause "SSO has not been enabled and/or configured",
                     :data {:status "error-sso-disabled", :status-code 400},
                     :message "SSO has not been enabled and/or configured",
                     :status "error-sso-disabled"}
                    (mt/client :get 400 "/auth/sso"
                               {:request-options {:redirect-strategy :none}}
                               :preferred_method "slack-connect"))))))))

         (testing "SSO requests fail if Slack Connect is enabled but hasn't been configured"
           (mt/with-temporary-setting-values
             [slack-connect-enabled true
              slack-connect-client-id nil]
             (is
              (partial=
               {:cause "SSO has not been enabled and/or configured",
                :data {:status "error-sso-disabled", :status-code 400},
                :message "SSO has not been enabled and/or configured",
                :status "error-sso-disabled"}
               (mt/client :get 400 "/auth/sso"
                          {:request-options {:redirect-strategy :none}}
                          :preferred_method "slack-connect")))))

         (testing "SSO requests fail if Slack Connect is configured but hasn't been enabled"
           (mt/with-temporary-setting-values
             [slack-connect-enabled false
              slack-connect-client-id "test-slack-client-id"
              slack-connect-client-secret "test-slack-client-secret"]
             (is
              (partial=
               {:cause "SSO has not been enabled and/or configured",
                :data {:status "error-sso-disabled", :status-code 400},
                :message "SSO has not been enabled and/or configured",
                :status "error-sso-disabled"}
               (mt/client :get 400 "/auth/sso"
                          {:request-options {:redirect-strategy :none}}
                          :preferred_method "slack-connect")))))

         (testing "The client secret must also be included for SSO to be configured"
           (mt/with-temporary-setting-values
             [slack-connect-enabled true
              slack-connect-client-id "test-slack-client-id"
              slack-connect-client-secret nil]
             (is
              (partial=
               {:cause "SSO has not been enabled and/or configured",
                :data {:status "error-sso-disabled", :status-code 400},
                :message "SSO has not been enabled and/or configured",
                :status "error-sso-disabled"}
               (mt/client :get 400 "/auth/sso"
                          {:request-options {:redirect-strategy :none}}
                          :preferred_method "slack-connect"))))))))))

;;; -------------------------------------------------- Redirect Tests --------------------------------------------------

(deftest redirect-test
  (testing "with Slack Connect configured, a GET request should result in a redirect to Slack"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (with-successful-oidc!
          (let [result (mt/client-full-response :get 302 "/auth/sso"
                                                {:request-options {:redirect-strategy :none}}
                                                :preferred_method "slack-connect"
                                                :redirect default-redirect-uri)
                redirect-url (get-in result [:headers "Location"])
                oidc-state-cookie (->> (get-in result [:headers "Set-Cookie"])
                                       (filter #(str/includes? % "metabase.OIDC_STATE"))
                                       first)]
            (is (str/starts-with? redirect-url "http://example.com/slack"))
            (testing "OIDC state is stored in encrypted cookie"
              (is (some? oidc-state-cookie))
              ;; Verify the cookie contains encrypted data (base64-like)
              (let [cookie-value (second (re-find #"metabase\.OIDC_STATE=([^;]+)" oidc-state-cookie))]
                (is (some? cookie-value))
                ;; Decrypt and verify contents (URL-decode since base64 chars +/= are encoded in cookies)
                (let [state-data (oidc.state/decrypt-state (codec/url-decode cookie-value))]
                  (is (= "test-state" (:state state-data)))
                  (is (= "test-nonce" (:nonce state-data)))
                  (is (= "/" (:redirect state-data)))
                  (is (= "slack-connect" (:provider state-data))))))))))))

(deftest multiple-sso-methods-test
  (testing "with SAML and Slack Connect configured, a GET request with preferred_method=slack-connect should redirect to Slack"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (mt/with-temporary-setting-values
          [saml-enabled true
           saml-identity-provider-uri "http://test.idp.metabase.com"
           saml-identity-provider-certificate (slurp "test_resources/sso/auth0-public-idp.cert")]
          (with-successful-oidc!
            (let [result (mt/client-full-response :get 302 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none}}
                                                  :preferred_method "slack-connect"
                                                  :redirect default-redirect-uri)
                  redirect-url (get-in result [:headers "Location"])]
              (is (str/starts-with? redirect-url "http://example.com/slack")))))))))

;;; -------------------------------------------------- POST Not Allowed Tests --------------------------------------------------

(deftest post-not-allowed-test
  (testing "POST requests should return 405 Method Not Allowed for OIDC"
    (sso.test-setup/with-slack-default-setup!
      (let [response (mt/client-full-response :post 405 "/auth/sso"
                                              {:request-options {:content-type :x-www-form-urlencoded
                                                                 :form-params {:preferred_method "slack-connect"}}})]
        (is (= "GET" (get-in response [:headers "Allow"])))))))

;;; -------------------------------------------------- Callback Tests --------------------------------------------------

(deftest callback-state-validation-test
  (testing "callback should fail if state cookie is missing"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (let [response (mt/client-full-response :get 401 "/auth/sso"
                                                {:request-options {:redirect-strategy :none}}
                                                :code "test-code"
                                                :state "some-state")]
        ;; Without a state cookie, the callback fails with invalid/expired state error
          (is (str/includes? (:body response) "OIDC state cookie is invalid, expired, or missing")))))))

(deftest callback-state-validation-csrf-test
  (testing "callback with mismatched state should indicate possible CSRF attack"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (with-successful-oidc!
        ;; First, initiate auth to set state cookie
          (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                       {:request-options {:redirect-strategy :none}}
                                                       :preferred_method "slack-connect"
                                                       :redirect default-redirect-uri)
              ;; Convert Set-Cookie headers to Cookie header format (extract name=value parts)
                set-cookies (get-in init-response [:headers "Set-Cookie"])
                cookie-header (->> set-cookies
                                   (map #(first (str/split % #";"))) ; Extract name=value before first ;
                                   (str/join "; "))
                response (mt/client-real-response :get 401 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none
                                                                     :headers {"Cookie" cookie-header}}}
                                                  :code "test-code"
                                                  :state "wrong-state")]
          ;; State mismatch should indicate possible CSRF attack
            (is (str/includes? (str (:body response)) "CSRF"))))))))

(deftest happy-path-callback-test
  (testing "successful callback with valid code and state"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (with-successful-oidc!
        ;; First, initiate auth to set state cookie
          (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                       {:request-options {:redirect-strategy :none}}
                                                       :preferred_method "slack-connect"
                                                       :redirect default-redirect-uri)
              ;; Convert Set-Cookie headers to Cookie header format
                set-cookies (get-in init-response [:headers "Set-Cookie"])
                cookie-header (->> set-cookies
                                   (map #(first (str/split % #";")))
                                   (str/join "; "))
                response (mt/client-real-response :get 302 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none
                                                                     :headers {"Cookie" cookie-header}}}
                                                  :code "test-code"
                                                  :state "test-state")]
            (is (sso.test-setup/successful-login? response))
            (is (= default-redirect-uri (get-in response [:headers "Location"])))))))))

;;; -------------------------------------------------- Link-Only Mode Tests --------------------------------------------------

(deftest link-only-mode-requires-session-test
  (testing "link-only mode should require authenticated session for initial request"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (mt/with-temporary-setting-values
          [slack-connect-authentication-mode "link-only"]
          (let [response (mt/client-full-response :get 401 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none}}
                                                  :preferred_method "slack-connect"
                                                  :redirect default-redirect-uri)]
            (is (str/includes? (str (get response :body)) "authenticated session"))))))))

(deftest link-only-mode-with-session-test
  (testing "link-only mode should work with authenticated session"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (mt/with-temporary-setting-values
          [slack-connect-authentication-mode "link-only"]
          (with-successful-oidc!
            (let [response (mt/user-http-request-full-response
                            :rasta :get 302 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect"
                            :redirect default-redirect-uri)]
              (is (str/starts-with? (get-in response [:headers "Location"]) "http://example.com/slack")))))))))

;;; -------------------------------------------------- Open Redirect Protection Tests --------------------------------------------------

(deftest no-open-redirect-test
  (testing "Check that we prevent open redirects to untrusted sites"
    (sso.test-setup/with-slack-default-setup!
      (doseq [redirect-uri ["https://badsite.com"
                            "//badsite.com"
                            "https:///badsite.com"]]
        (is
         (= "Invalid redirect URL"
            (->
             (mt/client
              :get 400 "/auth/sso"
              {:request-options {:redirect-strategy :none}}
              :preferred_method "slack-connect"
              :redirect redirect-uri)
             :message)))))))

;;; -------------------------------------------------- User Provisioning Tests --------------------------------------------------

(deftest create-new-account-test
  (testing "A new account will be created for a Slack user we haven't seen before"
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (mt/with-model-cleanup [:model/User]
          (with-successful-oidc!
            (t2/delete! :model/User :email "example@slack.com")
            (letfn [(new-user-exists? []
                      (boolean (seq (t2/select :model/User :%lower.email "example@slack.com"))))]
              (is (false? (new-user-exists?)))
            ;; Initiate auth
              (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :preferred_method "slack-connect"
                                                           :redirect default-redirect-uri)
                  ;; Convert Set-Cookie headers to Cookie header format
                    set-cookies (get-in init-response [:headers "Set-Cookie"])
                    cookie-header (->> set-cookies
                                       (map #(first (str/split % #";")))
                                       (str/join "; "))
                    response (mt/client-real-response :get 302 "/auth/sso"
                                                      {:request-options {:redirect-strategy :none
                                                                         :headers {"Cookie" cookie-header}}}
                                                      :code "test-code"
                                                      :state "test-state")]
              ;; Complete callback
                (is (sso.test-setup/successful-login? response))
                (let [new-user (t2/select-one :model/User :email "example@slack.com")]
                  (testing "new user"
                    (is
                     (=
                      {:email "example@slack.com"
                       :first_name nil
                       :is_qbnewb true
                       :is_superuser false
                       :id true
                       :last_name nil
                       :date_joined true
                       :common_name "example@slack.com"
                       :tenant_id false
                       :is_data_analyst false}
                      (-> (mt/boolean-ids-and-timestamps [new-user])
                          first
                          (dissoc :last_login)))))
                  (testing "User Invite Event is logged."
                    (is
                     (= "example@slack.com"
                        (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                                [:details :email])))))))))))))

(deftest create-new-slack-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-test-encryption!
      (sso.test-setup/with-slack-default-setup!
        (mt/with-temporary-setting-values [slack-connect-user-provisioning-enabled false
                                           site-name "test"]
          (with-successful-oidc!
            (with-redefs [auth-identity/login!
                          (fn [_provider _request]
                            {:success? false
                             :error :user-provisioning-disabled
                             :message "Sorry, but you'll need a test account to view this page. Please contact your administrator."})]
            ;; Initiate auth
              (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :preferred_method "slack-connect"
                                                           :redirect default-redirect-uri)
                    set-cookies (get-in init-response [:headers "Set-Cookie"])
                    cookie-header (->> set-cookies
                                       (map #(first (str/split % #";")))
                                       (str/join "; "))]
              ;; Try callback - should fail
                (mt/client-real-response :get 401 "/auth/sso"
                                         {:request-options {:redirect-strategy :none
                                                            :headers {"Cookie" cookie-header}}}
                                         :code "test-code"
                                         :state "test-state")))))))))

;;; -------------------------------------------------- Authentication Mode Validation Tests --------------------------------------------------

(deftest authentication-mode-validation-test
  (testing "authentication mode setting only accepts valid values"
    ;; Don't use sso.test-setup/with-slack-default-setup! here because it sets env vars
    ;; which take precedence over DB values when reading settings.
    ;; This test only needs to verify the setter validates input correctly.
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-authentication-mode nil]
        (testing "valid values are accepted"
          (sso-settings/slack-connect-authentication-mode! "sso")
          (is (= "sso" (sso-settings/slack-connect-authentication-mode)))
          (sso-settings/slack-connect-authentication-mode! "link-only")
          (is (= "link-only" (sso-settings/slack-connect-authentication-mode))))

        (testing "invalid values are rejected"
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid authentication mode"
               (sso-settings/slack-connect-authentication-mode! "invalid"))))))))
