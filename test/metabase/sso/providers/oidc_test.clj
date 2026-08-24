(ns metabase.sso.providers.oidc-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-identity.provider :as provider]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.sso.oidc.tokens :as oidc.tokens]
   [metabase.sso.providers.oidc]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private test-config
  {:client-id "test-client-id"
   :client-secret "test-client-secret"
   :issuer-uri "https://provider.example.com"
   :redirect-uri "https://metabase.example.com/auth/oidc/callback"
   :scopes ["openid" "email" "profile"]})

(def ^:private test-discovery-doc
  {:authorization_endpoint "https://provider.example.com/authorize"
   :token_endpoint "https://provider.example.com/token"
   :jwks_uri "https://provider.example.com/jwks"
   :userinfo_endpoint "https://provider.example.com/userinfo"})

(deftest ^:parallel authenticate-missing-config-test
  (testing "Returns error when configuration is missing"
    (let [request {}
          result (provider/authenticate :provider/oidc request)]
      (is (false? (:success? result)))
      (is (= :configuration-error (:error result)))
      (is (some? (:message result))))))

(deftest authenticate-initiate-flow-test
  (testing "Initiates authorization flow when no code present"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)]
      (let [request {:oidc-config test-config}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result)))
        (is (some? (:redirect-url result)))
        (is (some? (:state result)))
        (is (some? (:nonce result)))
        (is (str/includes? (:redirect-url result) "https://provider.example.com/authorize"))
        (is (str/includes? (:redirect-url result) "client_id=test-client-id"))
        (is (str/includes? (:redirect-url result) "response_type=code")))))
  (testing "Uses manual endpoints when provided"
    (let [config (assoc test-config
                        :authorization-endpoint "https://provider.example.com/manual/authorize")
          request {:oidc-config config}
          result (provider/authenticate :provider/oidc request)]
      (is (= :redirect (:success? result)))
      (is (str/includes? (:redirect-url result) "https://provider.example.com/manual/authorize"))))
  (testing "Includes custom scopes in authorization URL"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)]
      (let [config (assoc test-config :scopes ["openid" "email" "profile" "groups"])
            request {:oidc-config config}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result)))
        (is (str/includes? (:redirect-url result) "scope=openid%20email%20profile%20groups")))))
  (testing "Returns error when authorization endpoint not found"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] nil)]
      (let [request {:oidc-config test-config}
            result (provider/authenticate :provider/oidc request)]
        (is (false? (:success? result)))
        (is (= :configuration-error (:error result)))))))

(deftest ^:parallel authenticate-callback-validation-test
  (testing "Returns error for invalid callback params"
    (let [request {:oidc-config test-config
                   :error "access_denied"
                   :error_description "User denied access"}
          result (provider/authenticate :provider/oidc request)]
      (is (false? (:success? result)))
      (is (= :invalid-callback (:error result)))))
  (testing "Returns error when code is missing"
    (let [request {:oidc-config test-config
                   :state "some-state"}
          result (provider/authenticate :provider/oidc request)]
      (is (false? (:success? result)))
      (is (= :invalid-callback (:error result)))))
  (testing "Returns error when state is missing"
    (let [request {:oidc-config test-config
                   :code "some-code"}
          result (provider/authenticate :provider/oidc request)]
      (is (false? (:success? result)))
      (is (= :invalid-callback (:error result))))))

(deftest authenticate-token-exchange-test
  (testing "Returns error when token exchange fails"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 400
                                   :body {:error "invalid_grant"}})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"}
            result (provider/authenticate :provider/oidc request)]
        (is (false? (:success? result)))
        (is (= :token-exchange-failed (:error result))))))
  (testing "Returns error when token response missing id_token"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:access_token "access-token-123"}})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"}
            result (provider/authenticate :provider/oidc request)]
        (is (false? (:success? result)))
        (is (= :token-exchange-failed (:error result)))))))

(deftest authenticate-token-validation-test
  (testing "Returns error when token validation fails"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:id_token "invalid-token"
                                          :access_token "access-token-123"}})
                                oidc.tokens/validate-id-token
                                (fn [_token _config _nonce]
                                  {:valid? false
                                   :error "Invalid signature"})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"
                     :nonce "test-nonce"}
            result (provider/authenticate :provider/oidc request)]
        (is (false? (:success? result)))
        (is (= :invalid-token (:error result)))))))

(deftest authenticate-user-data-extraction-test
  (testing "Returns error when email not in claims"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:id_token "valid-token"
                                          :access_token "access-token-123"}})
                                oidc.tokens/validate-id-token
                                (fn [_token _config _nonce]
                                  {:valid? true
                                   :claims {:sub "user123"
                                            :iss "https://provider.example.com"
                                            :aud "test-client-id"}})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"
                     :nonce "test-nonce"}
            result (provider/authenticate :provider/oidc request)]
        (is (false? (:success? result)))
        (is (= :user-data-extraction-failed (:error result)))))))

(deftest authenticate-success-test
  (testing "Successfully authenticates user with valid token"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:id_token "valid-token"
                                          :access_token "access-token-123"}})
                                oidc.tokens/validate-id-token
                                (fn [_token _config _nonce]
                                  {:valid? true
                                   :claims {:sub "user123"
                                            :iss "https://provider.example.com"
                                            :aud "test-client-id"
                                            :email "user@example.com"
                                            :given_name "John"
                                            :family_name "Doe"}})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"
                     :nonce "test-nonce"}
            result (provider/authenticate :provider/oidc request)]
        (is (true? (:success? result)))
        (is (= "user@example.com" (get-in result [:user-data :email])))
        (is (= "John" (get-in result [:user-data :first_name])))
        (is (= "Doe" (get-in result [:user-data :last_name])))
        (is (= "user123" (get-in result [:user-data :provider-id])))
        (is (= :oidc (get-in result [:user-data :sso_source])))
        (is (= "user123" (:provider-id result))))))
  (testing "Successfully authenticates with minimal claims"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:id_token "valid-token"
                                          :access_token "access-token-123"}})
                                oidc.tokens/validate-id-token
                                (fn [_token _config _nonce]
                                  {:valid? true
                                   :claims {:sub "user456"
                                            :iss "https://provider.example.com"
                                            :aud "test-client-id"
                                            :email "minimal@example.com"}})]
      (let [request {:oidc-config test-config
                     :code "auth-code-123"
                     :state "state-token-456"
                     :nonce "test-nonce"}
            result (provider/authenticate :provider/oidc request)]
        (is (true? (:success? result)))
        (is (= "minimal@example.com" (get-in result [:user-data :email])))
        (is (nil? (get-in result [:user-data :first_name])))
        (is (nil? (get-in result [:user-data :last_name])))
        (is (= "user456" (get-in result [:user-data :provider-id])))))))

(defn- authenticate-with-claims
  "Run the OIDC callback flow with mocked token exchange/validation returning `claims`."
  [claims config]
  (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                              (fn [_issuer] test-discovery-doc)
                              http/post
                              (fn [_url _opts]
                                {:status 200
                                 :body {:id_token "valid-token"
                                        :access_token "access-token-123"}})
                              oidc.tokens/validate-id-token
                              (fn [_token _config _nonce]
                                {:valid? true
                                 :claims claims})]
    (provider/authenticate :provider/oidc {:oidc-config config
                                           :code "auth-code-123"
                                           :state "state-token-456"
                                           :nonce "test-nonce"})))

(def ^:private base-claims
  {:sub "user123"
   :iss "https://provider.example.com"
   :aud "test-client-id"
   :email "user@example.com"})

(deftest authenticate-email-verified-test
  (testing "Rejects token when email_verified is explicitly false"
    (let [result (authenticate-with-claims (assoc base-claims :email_verified false) test-config)]
      (is (false? (:success? result)))
      (is (= :email-not-verified (:error result)))
      (is (nil? (:user-data result)))))
  (testing "Rejects token when email_verified is the string \"false\""
    (let [result (authenticate-with-claims (assoc base-claims :email_verified "false") test-config)]
      (is (false? (:success? result)))
      (is (= :email-not-verified (:error result)))))
  (testing "Rejects token with email_verified false even with a custom email attribute mapping"
    (let [config (assoc test-config :attribute-email "mail")
          claims (assoc base-claims
                        :mail "user@example.com"
                        :email_verified false)
          result (authenticate-with-claims claims config)]
      (is (false? (:success? result)))
      (is (= :email-not-verified (:error result)))))
  (testing "Accepts token when email_verified is true"
    (let [result (authenticate-with-claims (assoc base-claims :email_verified true) test-config)]
      (is (true? (:success? result)))
      (is (= "user@example.com" (get-in result [:user-data :email])))))
  (testing "Accepts token when email_verified is the string \"true\""
    (let [result (authenticate-with-claims (assoc base-claims :email_verified "true") test-config)]
      (is (true? (:success? result)))))
  (testing "Accepts token without an email_verified claim (claim is optional per OIDC Core)"
    (let [result (authenticate-with-claims base-claims test-config)]
      (is (true? (:success? result))))))

;;; -------------------------------------------------- Identity Linking Tests --------------------------------------------------

(defn- login-with-claims!
  "Run the full OIDC login! flow with mocked state validation and token exchange/validation returning `claims`."
  [claims config]
  (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                              (fn [_issuer] test-discovery-doc)
                              oidc.state/validate-oidc-callback
                              (fn [_request _state _provider & _opts]
                                {:valid? true :nonce "test-nonce" :redirect "/"})
                              http/post
                              (fn [_url _opts]
                                {:status 200
                                 :body {:id_token "valid-token"
                                        :access_token "access-token-123"}})
                              oidc.tokens/validate-id-token
                              (fn [_token _config _nonce]
                                {:valid? true
                                 :claims claims})]
    (provider/login! :provider/oidc {:oidc-config config
                                     :code "auth-code-123"
                                     :state "state-token-456"
                                     :device-info {:device_id "test-device"
                                                   :device_description "Test Device"
                                                   :ip_address "127.0.0.1"
                                                   :embedded false
                                                   :token_exchange false}})))

(deftest login-auto-link-verified-email-test
  (testing "First OIDC login with a verified email links the (iss, sub) identity to the existing user"
    (mt/with-temp [:model/User user {:email "linkme@example.com"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "linkme@example.com"
                                              :email_verified true)
                                       test-config)]
        (is (true? (:success? result)))
        (let [auth-identity (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "oidc")]
          (is (= "user123" (:provider_id auth-identity)))
          (is (= "https://provider.example.com" (get-in auth-identity [:metadata :iss]))))))))

(deftest login-linking-required-test
  (testing "Existing user without a linked identity is rejected when the email is not verified"
    (mt/with-temp [:model/User user {:email "unlinked@example.com"}]
      (let [result (login-with-claims! (assoc base-claims :email "unlinked@example.com") test-config)]
        (is (false? (:success? result)))
        (is (= :account-linking-required (:error result)))
        (is (nil? (:session result)))
        (is (not (t2/exists? :model/AuthIdentity :user_id (:id user) :provider "oidc"))))))
  (testing "Verified email does not auto-link when auto-link-verified-email is disabled"
    (mt/with-temp [:model/User _user {:email "strict@example.com"}]
      (let [config (assoc test-config :auto-link-verified-email false)
            result (login-with-claims! (assoc base-claims
                                              :email "strict@example.com"
                                              :email_verified true)
                                       config)]
        (is (false? (:success? result)))
        (is (= :account-linking-required (:error result)))))))

(deftest login-trusted-email-domains-test
  (testing "Unverified email links when its domain is trusted"
    (mt/with-temp [:model/User user {:email "trusted@example.com"}]
      (let [config (assoc test-config :trusted-email-domains ["example.com"])
            result (login-with-claims! (assoc base-claims :email "trusted@example.com") config)]
        (is (true? (:success? result)))
        (is (= "user123" (t2/select-one-fn :provider_id :model/AuthIdentity
                                           :user_id (:id user) :provider "oidc"))))))
  (testing "\"*\" trusts every domain"
    (mt/with-temp [:model/User _user {:email "any@other.org"}]
      (let [config (assoc test-config :trusted-email-domains ["*"])
            result (login-with-claims! (assoc base-claims :email "any@other.org") config)]
        (is (true? (:success? result))))))
  (testing "Domains not in the list do not link"
    (mt/with-temp [:model/User _user {:email "who@other.org"}]
      (let [config (assoc test-config :trusted-email-domains ["example.com"])
            result (login-with-claims! (assoc base-claims :email "who@other.org") config)]
        (is (false? (:success? result)))
        (is (= :account-linking-required (:error result)))))))

(deftest login-identity-mismatch-test
  (testing "Linked user logging in with a different sub from the same issuer is rejected, even with a verified email"
    (mt/with-temp [:model/User user {:email "linked@example.com"}
                   :model/AuthIdentity _ {:user_id (:id user)
                                          :provider "oidc"
                                          :provider_id "original-sub"
                                          :metadata {:iss "https://provider.example.com"}}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "linked@example.com"
                                              :sub "different-sub"
                                              :email_verified true)
                                       test-config)]
        (is (false? (:success? result)))
        (is (= :identity-mismatch (:error result)))
        (is (nil? (:session result))))))
  (testing "Matching (iss, sub) is accepted"
    (mt/with-temp [:model/User user {:email "linked2@example.com"}
                   :model/AuthIdentity _ {:user_id (:id user)
                                          :provider "oidc"
                                          :provider_id "user123"
                                          :metadata {:iss "https://provider.example.com"}}]
      (let [result (login-with-claims! (assoc base-claims :email "linked2@example.com") test-config)]
        (is (true? (:success? result)))))))

(deftest login-legacy-identity-backfills-iss-test
  (testing "A linked identity without iss metadata matches on sub and gets the iss backfilled"
    (mt/with-temp [:model/User user {:email "legacy@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "user123"}]
      (let [result (login-with-claims! (assoc base-claims :email "legacy@example.com") test-config)]
        (is (true? (:success? result)))
        (is (= "https://provider.example.com"
               (get-in (t2/select-one :model/AuthIdentity :id ai-id) [:metadata :iss])))))))

(deftest login-second-issuer-test
  (testing "A user linked to one issuer gets relinked to a new issuer per the linking policy"
    (mt/with-temp [:model/User user {:email "multi@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "other-sub"
                                                    :metadata {:iss "https://other-idp.example.com"}}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "multi@example.com"
                                              :email_verified true)
                                       test-config)
            auth-identity (t2/select-one :model/AuthIdentity :id ai-id)]
        (is (true? (:success? result)))
        (is (= "user123" (:provider_id auth-identity)))
        (is (= "https://provider.example.com" (get-in auth-identity [:metadata :iss])))))))

(deftest login-new-user-provisioning-stores-iss-test
  (testing "JIT-provisioned users get an AuthIdentity linked to (iss, sub)"
    (let [email "fresh-oidc-user@example.com"]
      (t2/delete! :model/User :email email)
      (try
        (let [result (login-with-claims! (assoc base-claims
                                                :email email
                                                :email_verified true)
                                         test-config)]
          (is (true? (:success? result)))
          (let [user          (t2/select-one :model/User :email email)
                auth-identity (t2/select-one :model/AuthIdentity :user_id (:id user) :provider "oidc")]
            (is (= "user123" (:provider_id auth-identity)))
            (is (= "https://provider.example.com" (get-in auth-identity [:metadata :iss])))))
        (finally
          (t2/delete! :model/User :email email))))))

(deftest authenticate-custom-attribute-mapping-test
  (testing "Uses custom attribute mappings when provided"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)
                                http/post
                                (fn [_url _opts]
                                  {:status 200
                                   :body {:id_token "valid-token"
                                          :access_token "access-token-123"}})
                                oidc.tokens/validate-id-token
                                (fn [_token _config _nonce]
                                  {:valid? true
                                   :claims {:sub "user789"
                                            :iss "https://provider.example.com"
                                            :aud "test-client-id"
                                            :mail "custom@example.com"
                                            :first "Jane"
                                            :last "Smith"}})]
      (let [config (assoc test-config
                          :attribute-email "mail"
                          :attribute-firstname "first"
                          :attribute-lastname "last")
            request {:oidc-config config
                     :code "auth-code-123"
                     :state "state-token-456"
                     :nonce "test-nonce"}
            result (provider/authenticate :provider/oidc request)]
        (is (true? (:success? result)))
        (is (= "custom@example.com" (get-in result [:user-data :email])))
        (is (= "Jane" (get-in result [:user-data :first_name])))
        (is (= "Smith" (get-in result [:user-data :last_name])))))))

(deftest authenticate-config-extraction-test
  (testing "Extracts config from :oidc-config key"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)]
      (let [request {:oidc-config test-config}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result))))))
  (testing "Extracts config from :auth-identity metadata"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)]
      (let [request {:auth-identity {:metadata test-config}}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result))))))
  (testing "Extracts config from direct request keys"
    (mt/with-dynamic-fn-redefs [oidc.discovery/discover-oidc-configuration
                                (fn [_issuer] test-discovery-doc)]
      (let [request (merge test-config {:other-key "ignored"})
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result)))))))

(deftest provider-hierarchy-test
  (testing "OIDC provider derives from base provider"
    (is (isa? :provider/oidc ::provider/provider)))
  (testing "OIDC provider derives from create-user-if-not-exists"
    (is (isa? :provider/oidc ::provider/create-user-if-not-exists))))
