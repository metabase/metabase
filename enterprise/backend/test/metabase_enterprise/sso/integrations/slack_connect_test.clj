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
     jwt-enabled  false]
    (thunk)))

(def ^:private default-redirect-uri "/")
(def ^:private default-client-id "test-slack-client-id")
(def ^:private default-client-secret "test-slack-client-secret")

(defn- call-with-default-slack-config! [f]
  (let [current-features (token-check/*token-features*)]
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled                       true
         slack-connect-client-id                     default-client-id
         slack-connect-client-secret                 default-client-secret
         slack-connect-authentication-mode           "sso"
         slack-connect-user-provisioning-enabled?    true
         site-url                                    (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
        (mt/with-premium-features current-features
          (f))))))

(defmacro with-default-slack-config! [& body]
  `(call-with-default-slack-config!
    (fn []
      ~@body)))

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
           [slack-connect-enabled                       false
            slack-connect-client-id                     nil
            slack-connect-client-secret                 nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect"))))

         (testing "SSO requests fail if they don't have a valid premium-features token"
           (with-default-slack-config!
             (mt/with-premium-features #{}
               (is
                (partial=
                 {:cause   "SSO has not been enabled and/or configured",
                  :data    {:status "error-sso-disabled", :status-code 400},
                  :message "SSO has not been enabled and/or configured",
                  :status  "error-sso-disabled"}
                 (client/client :get 400 "/auth/sso"
                                {:request-options {:redirect-strategy :none}}
                                :preferred_method "slack-connect")))))))

       (testing "SSO requests fail if Slack Connect is enabled but hasn't been configured"
         (mt/with-temporary-setting-values
           [slack-connect-enabled                       true
            slack-connect-client-id                     nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect")))))

       (testing "SSO requests fail if Slack Connect is configured but hasn't been enabled"
         (mt/with-temporary-setting-values
           [slack-connect-enabled                       false
            slack-connect-client-id                     default-client-id
            slack-connect-client-secret                 default-client-secret]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect")))))

       (testing "The client secret must also be included for SSO to be configured"
         (mt/with-temporary-setting-values
           [slack-connect-enabled true
            slack-connect-client-id default-client-id
            slack-connect-client-secret nil]
           (is
            (partial=
             {:cause   "SSO has not been enabled and/or configured",
              :data    {:status "error-sso-disabled", :status-code 400},
              :message "SSO has not been enabled and/or configured",
              :status  "error-sso-disabled"}
             (client/client :get 400 "/auth/sso"
                            {:request-options {:redirect-strategy :none}}
                            :preferred_method "slack-connect")))))))))

;;; -------------------------------------------------- Redirect Tests --------------------------------------------------

(deftest redirect-test
  (testing "with Slack Connect configured, a GET request should result in a redirect to Slack"
    (with-slack-default-setup!
      (with-redefs [auth-identity/authenticate
                    (fn [_provider _request]
                      {:success? :redirect
                       :redirect-url "https://slack.com/oauth/v2/authorize?client_id=test&state=test-state&nonce=test-nonce"
                       :state "test-state"
                       :nonce "test-nonce"})]
        (let [result       (client/client-full-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :preferred_method "slack-connect"
                                                        :redirect default-redirect-uri)
              redirect-url (get-in result [:headers "Location"])]
          (is (str/starts-with? redirect-url "https://slack.com/oauth/v2/authorize"))
          (testing "state and nonce are stored in session"
            (is (= "test-state" (get-in result [:session :slack-oauth-state])))
            (is (= "test-nonce" (get-in result [:session :slack-oauth-nonce])))
            (is (= default-redirect-uri (get-in result [:session :slack-redirect])))))))))

(deftest multiple-sso-methods-test
  (testing "with SAML and Slack Connect configured, a GET request with preferred_method=slack-connect should redirect to Slack"
    (with-slack-default-setup!
      (mt/with-temporary-setting-values
        [saml-enabled true
         saml-identity-provider-uri "http://test.idp.metabase.com"
         saml-identity-provider-certificate (slurp "test_resources/sso/auth0-public-idp.cert")]
        (with-redefs [auth-identity/authenticate
                      (fn [_provider _request]
                        {:success? :redirect
                         :redirect-url "https://slack.com/oauth/v2/authorize?client_id=test&state=test-state&nonce=test-nonce"
                         :state "test-state"
                         :nonce "test-nonce"})]
          (let [result       (client/client-full-response :get 302 "/auth/sso"
                                                          {:request-options {:redirect-strategy :none}}
                                                          :preferred_method "slack-connect"
                                                          :redirect default-redirect-uri)
                redirect-url (get-in result [:headers "Location"])]
            (is (str/starts-with? redirect-url "https://slack.com/oauth/v2/authorize"))))))))

;;; -------------------------------------------------- POST Not Allowed Tests --------------------------------------------------

(deftest post-not-allowed-test
  (testing "POST requests should return 405 Method Not Allowed for OIDC"
    (with-slack-default-setup!
      (let [response (client/client-full-response :post 405 "/auth/sso"
                                                  {:request-options {:content-type :x-www-form-urlencoded
                                                                     :form-params {:preferred_method "slack-connect"}}})]
        (is (= 405 (:status response)))
        (is (= "GET" (get-in response [:headers "Allow"])))))))

;;; -------------------------------------------------- Callback Tests --------------------------------------------------

(deftest callback-state-validation-test
  (testing "callback should fail if state doesn't match"
    (with-slack-default-setup!
      (let [response (client/client-full-response :get 400 "/auth/sso"
                                                  {:request-options {:redirect-strategy :none}}
                                                  :code "test-code"
                                                  :state "wrong-state")]
        (is (= 400 (:status response)))
        (is (str/includes? (get-in response [:body :message]) "Invalid state"))))))

(deftest callback-state-validation-csrf-test
  (testing "callback with mismatched state should indicate possible CSRF attack"
    (with-slack-default-setup!
      (binding [client/*additional-session-keys* (conj client/*additional-session-keys*
                                                       :slack-oauth-state
                                                       :slack-oauth-nonce)]
        (with-redefs [auth-identity/authenticate
                      (fn [_provider _request]
                        {:success? :redirect
                         :redirect-url "https://slack.com/oauth/v2/authorize?state=correct-state"
                         :state "correct-state"
                         :nonce "test-nonce"})]
          ;; First, initiate auth to set session
          (let [init-response (client/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :preferred_method "slack-connect"
                                                           :redirect default-redirect-uri)
                session (:session init-response)]
            ;; Then try callback with wrong state
            (let [response (client/client-full-response :get 400 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :session session
                                                        :code "test-code"
                                                        :state "wrong-state")]
              (is (= 400 (:status response)))
              (is (str/includes? (str (get-in response [:body :message])) "CSRF")))))))))

(deftest happy-path-callback-test
  (testing "successful callback with valid code and state"
    (with-slack-default-setup!
      (binding [client/*additional-session-keys* (conj client/*additional-session-keys*
                                                       :slack-oauth-state
                                                       :slack-oauth-nonce
                                                       :slack-redirect)]
        (with-redefs [auth-identity/authenticate
                      (fn [_provider _request]
                        {:success? :redirect
                         :redirect-url "https://slack.com/oauth/v2/authorize?state=test-state"
                         :state "test-state"
                         :nonce "test-nonce"})
                      auth-identity/login!
                      (fn [_provider _request]
                        {:success? true
                         :user {:id 1 :email "rasta@metabase.com"}
                         :session {:metabase-user-id 1}
                         :redirect-url "/"})]
          ;; First, initiate auth to set session
          (let [init-response (client/client-full-response :get 302 "/auth/sso"
                                                           {:request-options {:redirect-strategy :none}}
                                                           :preferred_method "slack-connect"
                                                           :redirect default-redirect-uri)
                session (:session init-response)]
            ;; Then complete callback
            (let [response (client/client-real-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :session session
                                                        :code "test-code"
                                                        :state "test-state")]
              (is (saml-test/successful-login? response))
              (is (= default-redirect-uri (get-in response [:headers "Location"]))))))))))

;;; -------------------------------------------------- Link-Only Mode Tests --------------------------------------------------

(deftest link-only-mode-requires-session-test
  (testing "link-only mode should require authenticated session for initial request"
    (with-slack-default-setup!
      (mt/with-temporary-setting-values
        [slack-connect-authentication-mode "link-only"]
        (let [response (client/client-full-response :get 401 "/auth/sso"
                                                    {:request-options {:redirect-strategy :none}}
                                                    :preferred_method "slack-connect"
                                                    :redirect default-redirect-uri)]
          (is (= 401 (:status response)))
          (is (str/includes? (str (get-in response [:body :message])) "authenticated session")))))))

(deftest link-only-mode-with-session-test
  (testing "link-only mode should work with authenticated session"
    (with-slack-default-setup!
      (mt/with-temporary-setting-values
        [slack-connect-authentication-mode "link-only"]
        (binding [client/*additional-session-keys* (conj client/*additional-session-keys*
                                                         :metabase-user-id)]
          (with-redefs [auth-identity/authenticate
                        (fn [_provider _request]
                          {:success? :redirect
                           :redirect-url "https://slack.com/oauth/v2/authorize?state=test-state"
                           :state "test-state"
                           :nonce "test-nonce"})]
            (let [response (client/client-full-response :get 302 "/auth/sso"
                                                        {:request-options {:redirect-strategy :none}}
                                                        :session {:metabase-user-id 1}
                                                        :preferred_method "slack-connect"
                                                        :redirect default-redirect-uri)]
              (is (= 302 (:status response)))
              (is (str/starts-with? (get-in response [:headers "Location"]) "https://slack.com/oauth/v2/authorize")))))))))

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
             (client/client
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
        (binding [client/*additional-session-keys* (conj client/*additional-session-keys*
                                                         :slack-oauth-state
                                                         :slack-oauth-nonce
                                                         :slack-redirect)]
          (with-redefs [auth-identity/authenticate
                        (fn [_provider _request]
                          {:success? :redirect
                           :redirect-url "https://slack.com/oauth/v2/authorize?state=test-state"
                           :state "test-state"
                           :nonce "test-nonce"})
                        auth-identity/login!
                        (fn [_provider _request]
                          (let [user (t2/insert-returning-instance!
                                      :model/User
                                      {:email      "newuser@metabase.com"
                                       :first_name "New"
                                       :last_name  "User"
                                       :sso_source :slack})]
                            {:success? true
                             :user user
                             :new-user? true
                             :session {:metabase-user-id (:id user)}
                             :redirect-url "/"}))]
            (letfn [(new-user-exists? []
                      (boolean (seq (t2/select :model/User :%lower.email "newuser@metabase.com"))))]
              (is (false? (new-user-exists?)))
              ;; Initiate auth
              (let [init-response (client/client-full-response :get 302 "/auth/sso"
                                                               {:request-options {:redirect-strategy :none}}
                                                               :preferred_method "slack-connect"
                                                               :redirect default-redirect-uri)
                    session (:session init-response)]
                ;; Complete callback
                (let [response (client/client-real-response :get 302 "/auth/sso"
                                                            {:request-options {:redirect-strategy :none}}
                                                            :session session
                                                            :code "test-code"
                                                            :state "test-state")]
                  (is (saml-test/successful-login? response))
                  (let [new-user (t2/select-one :model/User :email "newuser@metabase.com")]
                    (testing "new user"
                      (is
                       (=
                        {:email        "newuser@metabase.com"
                         :first_name   "New"
                         :is_qbnewb    true
                         :is_superuser false
                         :id           true
                         :last_name    "User"
                         :date_joined  true
                         :common_name  "New User"
                         :tenant_id    false}
                        (-> (mt/boolean-ids-and-timestamps [new-user])
                            first
                            (dissoc :last_login)))))
                    (testing "User Invite Event is logged."
                      (is
                       (= "newuser@metabase.com"
                          (get-in (mt/latest-audit-log-entry :user-invited (:id new-user))
                                  [:details :email]))))))))))))))

(deftest create-new-slack-user-no-user-provisioning-test
  (testing "When user provisioning is disabled, throw an error if we attempt to create a new user."
    (with-slack-default-setup!
      (with-redefs [sso-settings/slack-connect-user-provisioning-enabled? (constantly false)
                    appearance.settings/site-name                          (constantly "test")]
        (binding [client/*additional-session-keys* (conj client/*additional-session-keys*
                                                         :slack-oauth-state
                                                         :slack-oauth-nonce
                                                         :slack-redirect)]
          (with-redefs [auth-identity/authenticate
                        (fn [_provider _request]
                          {:success? :redirect
                           :redirect-url "https://slack.com/oauth/v2/authorize?state=test-state"
                           :state "test-state"
                           :nonce "test-nonce"})
                        auth-identity/login!
                        (fn [_provider _request]
                          {:success? false
                           :error :user-provisioning-disabled
                           :message "Sorry, but you'll need a test account to view this page. Please contact your administrator."})]
            ;; Initiate auth
            (let [init-response (client/client-full-response :get 302 "/auth/sso"
                                                             {:request-options {:redirect-strategy :none}}
                                                             :preferred_method "slack-connect"
                                                             :redirect default-redirect-uri)
                  session (:session init-response)]
              ;; Try callback - should fail
              (is (=? {:status 401}
                      (client/client-real-response :get 401 "/auth/sso"
                                                   {:request-options {:redirect-strategy :none}}
                                                   :session session
                                                   :code "test-code"
                                                   :state "test-state"))))))))))

;;; -------------------------------------------------- Authentication Mode Validation Tests --------------------------------------------------

(deftest authentication-mode-validation-test
  (testing "authentication mode setting only accepts valid values"
    (with-slack-default-setup!
      (testing "valid values are accepted"
        (is (nil? (sso-settings/slack-connect-authentication-mode! "sso")))
        (is (= "sso" (sso-settings/slack-connect-authentication-mode)))
        (is (nil? (sso-settings/slack-connect-authentication-mode! "link-only")))
        (is (= "link-only" (sso-settings/slack-connect-authentication-mode))))

      (testing "invalid values are rejected"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Invalid authentication mode"
             (sso-settings/slack-connect-authentication-mode! "invalid")))))))
