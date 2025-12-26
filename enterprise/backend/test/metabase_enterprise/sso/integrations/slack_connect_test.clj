(ns metabase-enterprise.sso.integrations.slack-connect-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.saml-test :as saml-test]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.appearance.settings :as appearance.settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.config.core :as config]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- disable-api-url-prefix
  [thunk]
  (binding [client/*url-prefix* ""]
    (thunk)))

(use-fixtures :each disable-api-url-prefix)

(defn- do-with-other-sso-types-disabled! [thunk]
  (mt/with-temporary-setting-values
    [ldap-enabled false
     saml-enabled false
     jwt-enabled false]
    (thunk)))

(def ^:private default-redirect-uri "/")
(def ^:private default-client-id "test-slack-client-id")
(def ^:private default-client-secret "test-slack-client-secret")

(defn- call-with-default-slack-config! [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id default-client-id
         slack-connect-client-secret default-client-secret
         slack-connect-authentication-mode "sso"
         slack-connect-user-provisioning-enabled? true
         site-url (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-default-slack-config! [& body]
  `(call-with-default-slack-config!
    (fn []
      ~@body)))

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

(defmacro ^:private with-slack-default-setup! [& body]
  `(mt/test-helpers-set-global-values!
     (mt/with-premium-features #{:audit-app}
       (do-with-other-sso-types-disabled!
        (fn []
          (mt/with-additional-premium-features #{:sso-slack}
            (saml-test/call-with-login-attributes-cleared!
             (fn []
               (call-with-default-slack-config!
                (fn []
                  ~@body))))))))))

;;; -------------------------------------------------- Prerequisites Tests --------------------------------------------------

(deftest sso-prereqs-test
  (do-with-other-sso-types-disabled!
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
           (with-default-slack-config!
             (mt/with-premium-features #{}
               (is
                (partial=
                 {:cause "SSO has not been enabled and/or configured",
                  :data {:status "error-sso-disabled", :status-code 400},
                  :message "SSO has not been enabled and/or configured",
                  :status "error-sso-disabled"}
                 (mt/client :get 400 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect")))))))

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
            slack-connect-client-id default-client-id
            slack-connect-client-secret default-client-secret]
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
            slack-connect-client-id default-client-id
            slack-connect-client-secret nil]
           (is
            (partial=
             {:cause "SSO has not been enabled and/or configured",
              :data {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status "error-sso-disabled"}
             (mt/client :get 400 "/auth/sso"
                        {:request-options {:redirect-strategy :none}}
                        :preferred_method "slack-connect")))))))))

;;; -------------------------------------------------- Redirect Tests --------------------------------------------------

(deftest redirect-test
  (testing "with Slack Connect configured, a GET request should result in a redirect to Slack"
    (with-slack-default-setup!
      (with-successful-oidc!
        (let [result (mt/client-full-response :get 302 "/auth/sso"
                                              {:request-options {:redirect-strategy :none}}
                                              :preferred_method "slack-connect"
                                              :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])
              connect-headers (->> (get-in result [:headers "Set-Cookie"])
                                   (filter #(str/includes? % "SLACK_CONNECT"))
                                   set)]
          (is (str/starts-with? redirect-url "http://example.com/slack"))
          (testing "state and nonce are stored in cookies"
            (is (= #{"metabase.SLACK_CONNECT_STATE=test-state"
                     "metabase.SLACK_CONNECT_NONCE=test-nonce"
                     "metabase.SLACK_CONNECT_REDIRECT=%2F"} connect-headers))))))))

(deftest multiple-sso-methods-test
  (testing "with SAML and Slack Connect configured, a GET request with preferred_method=slack-connect should redirect to Slack"
    (with-slack-default-setup!
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
            (is (str/starts-with? redirect-url "http://example.com/slack"))))))))

;;; -------------------------------------------------- POST Not Allowed Tests --------------------------------------------------

(deftest post-not-allowed-test
  (testing "POST requests should return 405 Method Not Allowed for OIDC"
    (with-slack-default-setup!
      (let [response (mt/client-full-response :post 405 "/auth/sso"
                                              {:request-options {:content-type :x-www-form-urlencoded
                                                                 :form-params {:preferred_method "slack-connect"}}})]
        (is (= "GET" (get-in response [:headers "Allow"])))))))

;;; -------------------------------------------------- Callback Tests --------------------------------------------------

(deftest callback-state-validation-test
  (testing "callback should fail if state doesn't match"
    (with-slack-default-setup!
      (let [response (mt/client-full-response :get 400 "/auth/sso"
                                              {:request-options {:redirect-strategy :none}}
                                              :code "test-code"
                                              :state "wrong-state")]
        (is (str/includes? (:body response) "Invalid state"))))))

(deftest callback-state-validation-csrf-test
  (testing "callback with mismatched state should indicate possible CSRF attack"
    (with-slack-default-setup!
      (with-successful-oidc!
        ;; First, initiate auth to set session
        (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                     {:request-options {:redirect-strategy :none}}
                                                     :preferred_method "slack-connect"
                                                     :redirect default-redirect-uri)
              cookies (get-in init-response [:headers "Set-Cookie"])]
          ;; Then try callback with wrong state
          (let [response (mt/client-full-response :get 400 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none
                                                                     :header {"Cookie" cookies}}}
                                                  :code "test-code"
                                                  :state "wrong-state")]
            (is (str/includes? (str (:body response)) "CSRF"))))))))

(deftest happy-path-callback-test
  (testing "successful callback with valid code and state"
    (with-slack-default-setup!
      (with-successful-oidc!
        ;; First, initiate auth to set session
        (let [init-response (mt/client-full-response :get 302 "/auth/sso"
                                                     {:request-options {:redirect-strategy :none}}
                                                     :preferred_method "slack-connect"
                                                     :redirect default-redirect-uri)
              cookies (get-in init-response [:headers "Set-Cookie"])]
          ;; Then complete callback
          (let [response #p (mt/client-real-response :get 302 "/auth/sso"
                                                     {:request-options {:redirect-strategy :none
                                                                        :headers {"Cookie" cookies}}}
                                                     :code "test-code"
                                                     :state "test-state")]
            (is (saml-test/successful-login? response))
            (is (= default-redirect-uri (get-in response [:headers "Location"])))))))))

;;; -------------------------------------------------- Link-Only Mode Tests --------------------------------------------------

(deftest link-only-mode-requires-session-test
  (testing "link-only mode should require authenticated session for initial request"
    (with-slack-default-setup!
      (mt/with-temporary-setting-values
        [slack-connect-authentication-mode "link-only"]
        (let [response (mt/client-full-response :get 401 "/auth/sso"
                                                {:request-options {:redirect-strategy :none}}
                                                :preferred_method "slack-connect"
                                                :redirect default-redirect-uri)]
          (is (str/includes? (str (get response :body)) "authenticated session")))))))

(deftest link-only-mode-with-session-test
  (testing "link-only mode should work with authenticated session"
    (with-slack-default-setup!
      (mt/with-temporary-setting-values
        [slack-connect-authentication-mode "link-only"]
        (with-successful-oidc!
          (let [response #p (mt/user-http-request-full-response
                             :rasta :get 302 "/auth/sso"
                             {:request-options {:redirect-strategy :none}}
                             :preferred_method "slack-connect"
                             :redirect default-redirect-uri)]
            (is (str/starts-with? (get-in response [:headers "Location"]) "http://example.com/slack"))))))))

;;; -------------------------------------------------- Open Redirect Protection Tests --------------------------------------------------

(deftest no-open-redirect-test
  (testing "Check that we prevent open redirects to untrusted sites"
    (with-slack-default-setup!
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
    (with-slack-default-setup!
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
                  cookies (get-in init-response [:headers "Set-Cookie"])
                  response (mt/client-real-response :get 302 "/auth/sso"
                                                    {:request-options {:redirect-strategy :none
                                                                       :headers {"Cookie" cookies}}}
                                                    :code "test-code"
                                                    :state "test-state")]
              ;; Complete callback
              (is (saml-test/successful-login? response))
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
                     :tenant_id false}
                    (-> (mt/boolean-ids-and-timestamps [new-user])
                        first
                        (dissoc :last_login)))))
                (testing "User Invite Event is logged."
                  (is
                   (= "example@slack.com"
                      (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                              [:details :email]))))))))))))

(deftest create-new-slack-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-slack-default-setup!
      (with-redefs [sso-settings/slack-connect-user-provisioning-enabled? (constantly false)
                    appearance.settings/site-name (constantly "test")]
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
                  session (:session init-response)]
              ;; Try callback - should fail
              (mt/client-real-response :get 400 "/auth/sso"
                                       {:request-options {:redirect-strategy :none}}
                                       :session session
                                       :code "test-code"
                                       :state "test-state"))))))))

;;; -------------------------------------------------- Authentication Mode Validation Tests --------------------------------------------------

(deftest authentication-mode-validation-test
  (testing "authentication mode setting only accepts valid values"
    (with-slack-default-setup!
      (testing "valid values are accepted"
        (sso-settings/slack-connect-authentication-mode! "sso")
        (is (= "sso" (sso-settings/slack-connect-authentication-mode)))
        (sso-settings/slack-connect-authentication-mode! "link-only")
        (is (= "link-only" (sso-settings/slack-connect-authentication-mode))))

      (testing "invalid values are rejected"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid authentication mode"
             (sso-settings/slack-connect-authentication-mode! "invalid")))))))
