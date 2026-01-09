(ns metabase-enterprise.sso.providers.slack-connect-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase-enterprise.sso.providers.slack-connect]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.auth-identity.provider :as provider]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.sso.oidc.tokens :as oidc.tokens]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db :test-users))
(use-fixtures :each (fn [f] (mt/with-premium-features #{:sso-slack} (f))))

(def ^:private slack-discovery-doc
  {:authorization_endpoint "https://slack.com/oauth/v2/authorize"
   :token_endpoint "https://slack.com/api/openid.connect.token"
   :jwks_uri "https://slack.com/openid/connect/keys"
   :userinfo_endpoint "https://slack.com/api/openid.connect.userInfo"})

;;; -------------------------------------------------- Provider Hierarchy Tests --------------------------------------------------

(deftest ^:parallel provider-hierarchy-test
  (testing "Slack Connect provider derives from OIDC provider"
    (is (isa? :provider/slack-connect :provider/oidc)))

  (testing "Slack Connect provider derives from create-user-if-not-exists"
    (is (isa? :provider/slack-connect ::provider/create-user-if-not-exists))))

;;; -------------------------------------------------- Configuration Tests --------------------------------------------------

(deftest build-slack-oidc-config-test
  (testing "Builds OIDC configuration from Slack settings"
    (mt/with-temporary-setting-values
      [slack-connect-client-id "test-client-id"
       slack-connect-client-secret "test-secret"]
      (let [request {:redirect-uri "https://metabase.example.com/auth/sso"}
            config (#'metabase-enterprise.sso.providers.slack-connect/build-slack-oidc-config request)]
        (is (= "test-client-id" (:client-id config)))
        (is (= "test-secret" (:client-secret config)))
        (is (= "https://slack.com" (:issuer-uri config)))
        (is (= ["openid" "profile" "email"] (:scopes config)))
        (is (= "https://metabase.example.com/auth/sso" (:redirect-uri config))))))

  (testing "Returns nil when client ID is missing"
    (mt/with-temporary-setting-values
      [slack-connect-client-id nil
       slack-connect-client-secret "test-secret"]
      (let [request {:redirect-uri "https://metabase.example.com/auth/sso"}
            config (#'metabase-enterprise.sso.providers.slack-connect/build-slack-oidc-config request)]
        (is (nil? config)))))

  (testing "Returns nil when client secret is missing"
    (mt/with-temporary-setting-values
      [slack-connect-client-id "test-client-id"
       slack-connect-client-secret nil]
      (let [request {:redirect-uri "https://metabase.example.com/auth/sso"}
            config (#'metabase-enterprise.sso.providers.slack-connect/build-slack-oidc-config request)]
        (is (nil? config))))))

;;; -------------------------------------------------- Claim Extraction Tests --------------------------------------------------

(deftest extract-slack-claims-test
  (testing "Extracts Slack-specific claims from ID token"
    (mt/with-temporary-setting-values
      [slack-connect-attribute-team-id "https://slack.com/team_id"]
      (let [id-token-claims {:sub "U12345678"
                             "https://slack.com/team_id" "T12345678"
                             "https://slack.com/team_image_230" "https://example.com/team.png"
                             :email_verified true
                             :locale "en-US"}
            slack-attrs (#'metabase-enterprise.sso.providers.slack-connect/extract-slack-claims id-token-claims)]
        (is (= "U12345678" (get slack-attrs "slack-user-id")))
        (is (= "T12345678" (get slack-attrs "slack-team-id")))
        (is (= "https://example.com/team.png" (get slack-attrs "slack-team-image")))
        (is (= "true" (get slack-attrs "slack-email-verified")))
        (is (= "en-US" (get slack-attrs "slack-locale"))))))

  (testing "Handles missing optional claims gracefully"
    (mt/with-temporary-setting-values
      [slack-connect-attribute-team-id "https://slack.com/team_id"]
      (let [id-token-claims {:sub "U12345678"}
            slack-attrs (#'metabase-enterprise.sso.providers.slack-connect/extract-slack-claims id-token-claims)]
        (is (= "U12345678" (get slack-attrs "slack-user-id")))
        (is (nil? (get slack-attrs "slack-team-id")))
        (is (nil? (get slack-attrs "slack-team-image")))
        (is (nil? (get slack-attrs "slack-email-verified")))
        (is (nil? (get slack-attrs "slack-locale")))))))

;;; -------------------------------------------------- Authentication Tests --------------------------------------------------

(deftest authenticate-missing-premium-feature-test
  (testing "Returns error when premium feature is not available"
    (mt/with-premium-features #{}
      (let [request {}
            result (auth-identity/authenticate :provider/slack-connect request)]
        (is (false? (:success? result)))
        (is (= :feature-not-available (:error result)))
        (is (some? (:message result)))))))

(deftest authenticate-not-enabled-test
  (testing "Returns error when Slack Connect is not enabled"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled false]
        (let [request {}
              result (auth-identity/authenticate :provider/slack-connect request)]
          (is (false? (:success? result)))
          (is (= :slack-connect-not-enabled (:error result)))
          (is (some? (:message result))))))))

(deftest authenticate-not-configured-test
  (testing "Returns error when Slack Connect is not configured"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id nil
         slack-connect-client-secret nil]
        (let [request {}
              result (auth-identity/authenticate :provider/slack-connect request)]
          (is (false? (:success? result)))
          (is (= :slack-connect-not-enabled (:error result)))
          (is (some? (:message result))))))))

(deftest authenticate-link-only-requires-session-test
  (testing "Returns error in link-only mode when no authenticated session"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-authentication-mode "link-only"]
        (let [request {:authenticated-user (delay nil)}
              result (auth-identity/authenticate :provider/slack-connect request)]
          (is (false? (:success? result)))
          (is (= :authentication-required (:error result)))
          (is (some? (:message result))))))))

(deftest authenticate-link-only-allows-callback-test
  (testing "Does not require session for callback in link-only mode"
    (mt/with-temporary-setting-values
      [slack-connect-enabled true
       slack-connect-client-id "test-client-id"
       slack-connect-client-secret "test-secret"
       slack-connect-authentication-mode "link-only"]
      (with-redefs [oidc.discovery/discover-oidc-configuration
                    (fn [_issuer] slack-discovery-doc)
                    http/post
                    (fn [_url _opts]
                      {:status 200
                       :body {:id_token "valid-token"
                              :access_token "access-token-123"}})
                    oidc.tokens/validate-id-token
                    (fn [_token _config _nonce]
                      {:valid? true
                       :claims {:sub "U12345678"
                                :iss "https://slack.com"
                                :aud "test-client-id"
                                :email "test@example.com"}})]
        (let [request {:code "test-code"
                       :state "test-state"
                       :oidc-nonce "test-nonce"
                       :redirect-uri "https://metabase.example.com/auth/sso"
                       :authenticated-user (delay nil)}
              result (auth-identity/authenticate :provider/slack-connect request)]
          ;; The presence of :code indicates callback, so should not error even without authenticated-user
          (is (true? (:success? result)))
          (is (= "test@example.com" (get-in result [:user-data :email]))))))))

(deftest authenticate-enhances-with-slack-data-test
  (testing "Enhances successful auth result with Slack-specific data"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-attribute-team-id "https://slack.com/team_id"]
        (with-redefs [oidc.discovery/discover-oidc-configuration
                      (fn [_issuer] slack-discovery-doc)
                      http/post
                      (fn [_url _opts]
                        {:status 200
                         :body {:id_token "valid-token"
                                :access_token "access-token-123"}})
                      oidc.tokens/validate-id-token
                      (fn [_token _config _nonce]
                        {:valid? true
                         :claims {:sub "U12345678"
                                  :iss "https://slack.com"
                                  :aud "test-client-id"
                                  :email "test@example.com"
                                  "https://slack.com/team_id" "T12345678"
                                  :email_verified true}})]
          (let [request {:code "test-code"
                         :state "test-state"
                         :oidc-nonce "test-nonce"
                         :redirect-uri "https://metabase.example.com/auth/sso"}
                result (auth-identity/authenticate :provider/slack-connect request)]
            (is (= :slack (get-in result [:user-data :sso_source])))
            (is (= "U12345678" (get-in result [:user-data :login_attributes "slack-user-id"])))
            (is (= "T12345678" (get-in result [:user-data :login_attributes "slack-team-id"])))
            (is (= "true" (get-in result [:user-data :login_attributes "slack-email-verified"])))
            (is (some? (:slack-data result)))))))))

;;; -------------------------------------------------- Login Tests --------------------------------------------------

(deftest link-only-mode-no-session-creation-test
  (testing "No session is created when authentication mode is link-only"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-authentication-mode "link-only"
         slack-connect-user-provisioning-enabled false]
        (mt/with-temp [:model/User user {:email "link-only-no-session@example.com"}]
          (with-redefs [oidc.discovery/discover-oidc-configuration
                        (fn [_issuer] slack-discovery-doc)
                        oidc.state/validate-oidc-callback
                        (fn [_request _state _provider & _opts]
                          {:valid? true
                           :nonce "test-nonce"
                           :redirect "/"})
                        http/post
                        (fn [_url _opts]
                          {:status 200
                           :body {:id_token "valid-token"
                                  :access_token "access-token-123"}})
                        oidc.tokens/validate-id-token
                        (fn [_token _config _nonce]
                          {:valid? true
                           :claims {:sub "U12345678"
                                    :iss "https://slack.com"
                                    :aud "test-client-id"
                                    :email "link-only-no-session@example.com"}})]
            (let [initial-session-count (t2/count :model/Session :user_id (:id user))
                  request {:code "test-code"
                           :state "test-state"
                           :redirect-uri "https://metabase.example.com/auth/sso"
                           :authenticated-user (delay user)
                           :device-info {:device_id "test-device" :device_description "Test Device" :ip_address "127.0.0.1" :embedded false}}
                  result (auth-identity/login! :provider/slack-connect request)]
              (is (true? (:success? result)) "Login should succeed")
              (is (nil? (:session result)) "Result should not contain a session")
              (is (nil? (:user result)) "Result should not contain a user (dissoc'd by :after method)")
              (is (= initial-session-count (t2/count :model/Session :user_id (:id user)))
                  "No new session should be created in the database"))))))))

;;; -------------------------------------------------- AuthIdentity Creation Tests --------------------------------------------------

(deftest sso-mode-creates-auth-identity-for-new-user-test
  (testing "SSO mode creates AuthIdentity when a new user logs in via Slack"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-authentication-mode "sso"
         slack-connect-user-provisioning-enabled true]
        (let [test-email "newuser-slack@example.com"
              slack-user-id "U_NEW_12345"]
          ;; Ensure user doesn't exist
          (t2/delete! :model/User :email test-email)
          (with-redefs [oidc.discovery/discover-oidc-configuration
                        (fn [_issuer] slack-discovery-doc)
                        oidc.state/validate-oidc-callback
                        (fn [_request _state _provider & _opts]
                          {:valid? true
                           :nonce "test-nonce"
                           :redirect "/"})
                        http/post
                        (fn [_url _opts]
                          {:status 200
                           :body {:id_token "valid-token"
                                  :access_token "access-token-123"}})
                        oidc.tokens/validate-id-token
                        (fn [_token _config _nonce]
                          {:valid? true
                           :claims {:sub slack-user-id
                                    :iss "https://slack.com"
                                    :aud "test-client-id"
                                    :email test-email
                                    :given_name "New"
                                    :family_name "User"}})]
            (try
              (let [request {:code "test-code"
                             :state "test-state"
                             :redirect-uri "https://metabase.example.com/auth/sso"
                             :device-info {:device_id "test-device" :device_description "Test Device" :ip_address "127.0.0.1" :embedded false}}
                    result (auth-identity/login! :provider/slack-connect request)]
                (is (true? (:success? result)) "Login should succeed")
                (is (some? (:user result)) "Result should contain a user")
                ;; Verify AuthIdentity was created
                (let [user (t2/select-one :model/User :email test-email)
                      auth-identity (t2/select-one :model/AuthIdentity
                                                   :user_id (:id user)
                                                   :provider "slack-connect")]
                  (is (some? user) "User should be created")
                  (is (some? auth-identity) "AuthIdentity should be created")
                  (is (= slack-user-id (:provider_id auth-identity))
                      "AuthIdentity should have correct provider_id")))
              (finally
                (t2/delete! :model/User :email test-email)))))))))

(deftest sso-mode-creates-auth-identity-for-existing-user-test
  (testing "SSO mode creates AuthIdentity when an existing user logs in via Slack"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-authentication-mode "sso"]
        (let [slack-user-id "U_EXISTING_789"]
          (mt/with-temp [:model/User user {:email "existing-slack@example.com"
                                           :first_name "Existing"
                                           :last_name "User"}]
            ;; Ensure no AuthIdentity exists for this user
            (t2/delete! :model/AuthIdentity :user_id (:id user) :provider "slack-connect")
            (with-redefs [oidc.discovery/discover-oidc-configuration
                          (fn [_issuer] slack-discovery-doc)
                          oidc.state/validate-oidc-callback
                          (fn [_request _state _provider & _opts]
                            {:valid? true
                             :nonce "test-nonce"
                             :redirect "/"})
                          http/post
                          (fn [_url _opts]
                            {:status 200
                             :body {:id_token "valid-token"
                                    :access_token "access-token-123"}})
                          oidc.tokens/validate-id-token
                          (fn [_token _config _nonce]
                            {:valid? true
                             :claims {:sub slack-user-id
                                      :iss "https://slack.com"
                                      :aud "test-client-id"
                                      :email "existing-slack@example.com"}})]
              (let [request {:code "test-code"
                             :state "test-state"
                             :redirect-uri "https://metabase.example.com/auth/sso"
                             :device-info {:device_id "test-device" :device_description "Test Device" :ip_address "127.0.0.1" :embedded false}}
                    result (auth-identity/login! :provider/slack-connect request)]
                (is (true? (:success? result)) "Login should succeed")
                ;; Verify AuthIdentity was created
                (let [auth-identity (t2/select-one :model/AuthIdentity
                                                   :user_id (:id user)
                                                   :provider "slack-connect")]
                  (is (some? auth-identity) "AuthIdentity should be created for existing user")
                  (is (= slack-user-id (:provider_id auth-identity))
                      "AuthIdentity should have correct provider_id"))))))))))

(deftest link-only-mode-creates-auth-identity-test
  (testing "Link-only mode creates AuthIdentity for the authenticated user"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-enabled true
         slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-authentication-mode "link-only"]
        (let [slack-user-id "U_LINK_456"]
          (mt/with-temp [:model/User user {:email "linkuser@example.com"
                                           :first_name "Link"
                                           :last_name "User"}]
            ;; Ensure no AuthIdentity exists for this user
            (t2/delete! :model/AuthIdentity :user_id (:id user) :provider "slack-connect")
            (with-redefs [oidc.discovery/discover-oidc-configuration
                          (fn [_issuer] slack-discovery-doc)
                          oidc.state/validate-oidc-callback
                          (fn [_request _state _provider & _opts]
                            {:valid? true
                             :nonce "test-nonce"
                             :redirect "/"})
                          http/post
                          (fn [_url _opts]
                            {:status 200
                             :body {:id_token "valid-token"
                                    :access_token "access-token-123"}})
                          oidc.tokens/validate-id-token
                          (fn [_token _config _nonce]
                            {:valid? true
                             :claims {:sub slack-user-id
                                      :iss "https://slack.com"
                                      :aud "test-client-id"
                                      :email "linkuser@example.com"}})]
              (let [initial-session-count (t2/count :model/Session :user_id (:id user))
                    request {:code "test-code"
                             :state "test-state"
                             :redirect-uri "https://metabase.example.com/auth/sso"
                             :authenticated-user (delay user)
                             :device-info {:device_id "test-device" :device_description "Test Device" :ip_address "127.0.0.1" :embedded false}}
                    result (auth-identity/login! :provider/slack-connect request)]
                (is (true? (:success? result)) "Login should succeed")
                (is (nil? (:session result)) "No session should be created in link-only mode")
                ;; Verify AuthIdentity was created
                (let [auth-identity (t2/select-one :model/AuthIdentity
                                                   :user_id (:id user)
                                                   :provider "slack-connect")]
                  (is (some? auth-identity) "AuthIdentity should be created in link-only mode")
                  (is (= slack-user-id (:provider_id auth-identity))
                      "AuthIdentity should have correct provider_id"))
                ;; Verify no new session was created
                (is (= initial-session-count (t2/count :model/Session :user_id (:id user)))
                    "No new session should be created")))))))))

;;; -------------------------------------------------- Settings Validation Tests --------------------------------------------------

(deftest slack-connect-configured-test
  (testing "Returns true when client ID and secret are configured"
    (mt/with-temporary-setting-values
      [slack-connect-client-id "test-client-id"
       slack-connect-client-secret "test-secret"]
      (is (true? (sso-settings/slack-connect-configured)))))

  (testing "Returns false when client ID is missing"
    (mt/with-temporary-setting-values
      [slack-connect-client-id nil
       slack-connect-client-secret "test-secret"]
      (is (false? (sso-settings/slack-connect-configured)))))

  (testing "Returns false when client secret is missing"
    (mt/with-temporary-setting-values
      [slack-connect-client-id "test-client-id"
       slack-connect-client-secret nil]
      (is (false? (sso-settings/slack-connect-configured))))))

(deftest slack-connect-enabled-test
  (testing "Returns true when configured and enabled"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-enabled true]
        (is (true? (sso-settings/slack-connect-enabled))))))

  (testing "Returns false when configured but not enabled"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-client-id "test-client-id"
         slack-connect-client-secret "test-secret"
         slack-connect-enabled false]
        (is (false? (sso-settings/slack-connect-enabled))))))

  (testing "Returns false when not configured even if enabled is true"
    (mt/with-additional-premium-features #{:sso-slack}
      (mt/with-temporary-setting-values
        [slack-connect-client-id nil
         slack-connect-client-secret nil
         slack-connect-enabled true]
        (is (false? (sso-settings/slack-connect-enabled)))))))

(deftest slack-connect-authentication-mode-validation-test
  (testing "Accepts valid authentication modes"
    (mt/with-temporary-setting-values
      [slack-connect-authentication-mode nil]
      (sso-settings/slack-connect-authentication-mode! "sso")
      (is (= "sso" (sso-settings/slack-connect-authentication-mode)))
      (sso-settings/slack-connect-authentication-mode! "link-only")
      (is (= "link-only" (sso-settings/slack-connect-authentication-mode)))))

  (testing "Rejects invalid authentication modes"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid authentication mode"
         (sso-settings/slack-connect-authentication-mode! "invalid")))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid authentication mode"
         (sso-settings/slack-connect-authentication-mode! "SSO")))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"Invalid authentication mode"
         (sso-settings/slack-connect-authentication-mode! "")))))
