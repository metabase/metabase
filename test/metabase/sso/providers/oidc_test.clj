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
  (testing "Rejects token when email_verified is any other non-true value"
    (doseq [value ["False" "FALSE" 0 "0" "no"]]
      (let [result (authenticate-with-claims (assoc base-claims :email_verified value) test-config)]
        (is (false? (:success? result)) (pr-str value))
        (is (= :email-not-verified (:error result)) (pr-str value)))))
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
  (testing "Domains are matched case-insensitively and a leading @ is ignored"
    (doseq [domain ["@example.com" "EXAMPLE.COM" " example.com "]]
      (mt/with-temp [:model/User _user {:email "trusted2@Example.com"}]
        (let [config (assoc test-config :trusted-email-domains [domain])
              result (login-with-claims! (assoc base-claims :email "trusted2@Example.com") config)]
          (is (true? (:success? result)) domain)))))
  (testing "A parent domain does not trust subdomains or lookalike suffixes"
    (mt/with-temp [:model/User _user {:email "who@notexample.com"}]
      (let [config (assoc test-config :trusted-email-domains ["example.com"])
            result (login-with-claims! (assoc base-claims :email "who@notexample.com") config)]
        (is (false? (:success? result))))))
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

(deftest login-legacy-identity-different-sub-test
  (testing "A legacy identity (no iss) with a different sub may have come from another issuer, so it is relinked per policy"
    (mt/with-temp [:model/User user {:email "legacy2@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "old-sub"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "legacy2@example.com"
                                              :email_verified true)
                                       test-config)
            auth-identity (t2/select-one :model/AuthIdentity :id ai-id)]
        (is (true? (:success? result)))
        (is (= "user123" (:provider_id auth-identity)))
        (is (= "https://provider.example.com" (get-in auth-identity [:metadata :iss]))))))
  (testing "...and is rejected when the policy does not allow linking"
    (mt/with-temp [:model/User user {:email "legacy3@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "old-sub"}]
      (let [result (login-with-claims! (assoc base-claims :email "legacy3@example.com") test-config)]
        (is (false? (:success? result)))
        (is (= :account-linking-required (:error result)))
        (is (= "old-sub" (t2/select-one-fn :provider_id :model/AuthIdentity :id ai-id)))))))

(deftest login-identity-already-linked-test
  (testing "An (iss, sub) identity already linked to another user cannot be linked to a second account"
    (mt/with-temp [:model/User other {:email "owner@example.com"}
                   :model/AuthIdentity _ {:user_id (:id other)
                                          :provider "oidc"
                                          :provider_id "user123"
                                          :metadata {:iss "https://provider.example.com"}}
                   :model/User user {:email "victim@example.com"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "victim@example.com"
                                              :email_verified true)
                                       test-config)]
        (is (false? (:success? result)))
        (is (= :identity-already-linked (:error result)))
        (is (nil? (:session result)))
        (is (not (t2/exists? :model/AuthIdentity :user_id (:id user) :provider "oidc"))))))
  (testing "The same sub from a different issuer is a different identity"
    (mt/with-temp [:model/User other {:email "owner2@example.com"}
                   :model/AuthIdentity _ {:user_id (:id other)
                                          :provider "oidc"
                                          :provider_id "user123"
                                          :metadata {:iss "https://other-idp.example.com"}}
                   :model/User _user {:email "fine@example.com"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "fine@example.com"
                                              :email_verified true)
                                       test-config)]
        (is (true? (:success? result)))))))

(deftest login-numeric-sub-test
  (testing "A numeric sub claim is stored as a string rather than failing the login"
    (mt/with-temp [:model/User user {:email "numeric@example.com"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :sub 12345
                                              :email "numeric@example.com"
                                              :email_verified true)
                                       test-config)]
        (is (true? (:success? result)))
        (is (= "12345" (t2/select-one-fn :provider_id :model/AuthIdentity
                                         :user_id (:id user) :provider "oidc")))))))

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

(deftest authenticate-missing-sub-test
  (testing "Rejects a token without a sub claim"
    (let [result (authenticate-with-claims (dissoc base-claims :sub) test-config)]
      (is (false? (:success? result)))
      (is (= :invalid-token (:error result)))))
  (testing "Rejects a token with a blank sub claim"
    (let [result (authenticate-with-claims (assoc base-claims :sub "") test-config)]
      (is (false? (:success? result)))
      (is (= :invalid-token (:error result))))))

(deftest login-jit-identity-already-linked-test
  (testing "JIT provisioning is refused when the token's identity is already linked to another account"
    (mt/with-temp [:model/User owner {:email "jit-owner@example.com"}
                   :model/AuthIdentity _ {:user_id (:id owner)
                                          :provider "oidc"
                                          :provider_id "user123"
                                          :metadata {:iss "https://provider.example.com"}}]
      (let [email "jit-victim@example.com"]
        (try
          (let [result (login-with-claims! (assoc base-claims
                                                  :email email
                                                  :email_verified true)
                                           test-config)]
            (is (false? (:success? result)))
            (is (= :identity-already-linked (:error result)))
            (is (nil? (t2/select-one :model/User :email email)) "No account should be provisioned"))
          (finally
            (t2/delete! :model/User :email email)))))))

(deftest login-jit-follows-linking-policy-test
  (testing "JIT provisioning is refused when the token could not have linked an existing account either"
    (let [email "jit-unverified@example.com"]
      (try
        (let [result (login-with-claims! (assoc base-claims :email email) test-config)]
          (is (false? (:success? result)))
          (is (= :account-linking-required (:error result)))
          (is (nil? (t2/select-one :model/User :email email)) "No account should be provisioned"))
        (finally
          (t2/delete! :model/User :email email)))))
  (testing "A trusted email domain allows JIT provisioning without email_verified"
    (let [email "jit-trusted@example.com"]
      (try
        (let [config (assoc test-config :trusted-email-domains ["example.com"])
              result (login-with-claims! (assoc base-claims :email email) config)]
          (is (true? (:success? result)))
          (is (some? (t2/select-one :model/User :email email))))
        (finally
          (t2/delete! :model/User :email email))))))

(deftest login-backfill-checks-other-users-test
  (testing "A legacy nil-iss row cannot claim an iss already held by another user's row for the same sub"
    (mt/with-temp [:model/User owner {:email "iss-owner@example.com"}
                   :model/AuthIdentity _ {:user_id (:id owner)
                                          :provider "oidc"
                                          :provider_id "user123"
                                          :metadata {:iss "https://provider.example.com"}}
                   :model/User user {:email "nil-iss@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "user123"}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "nil-iss@example.com"
                                              :email_verified true)
                                       test-config)]
        (is (false? (:success? result)))
        (is (= :identity-already-linked (:error result)))
        (is (nil? (get-in (t2/select-one :model/AuthIdentity :id ai-id) [:metadata :iss]))
            "The iss must not be backfilled")))))

(deftest login-legacy-rows-visible-to-conflict-checks-test
  (testing "An identity held by another user's unmigrated legacy row cannot be linked or provisioned"
    (mt/with-temp [:model/User owner {:email "legacy-owner@example.com"}
                   :model/AuthIdentity _ {:user_id (:id owner)
                                          :provider "custom-oidc"
                                          :provider_id "user123"}
                   :model/User user {:email "claimant@example.com"}]
      (let [config (assoc test-config
                          :identity-provider-name "oidc-okta"
                          :legacy-provider-name "custom-oidc")]
        (testing "linking to an existing account"
          (let [result (login-with-claims! (assoc base-claims
                                                  :email "claimant@example.com"
                                                  :email_verified true)
                                           config)]
            (is (false? (:success? result)))
            (is (= :identity-already-linked (:error result)))
            (is (not (t2/exists? :model/AuthIdentity :user_id (:id user) :provider "oidc-okta")))))
        (testing "JIT provisioning"
          (let [email "legacy-jit@example.com"]
            (try
              (let [result (login-with-claims! (assoc base-claims
                                                      :email email
                                                      :email_verified true)
                                               config)]
                (is (false? (:success? result)))
                (is (= :identity-already-linked (:error result)))
                (is (nil? (t2/select-one :model/User :email email))))
              (finally
                (t2/delete! :model/User :email email)))))))))

(deftest login-disabled-account-test
  (testing "A disabled account is rejected before any identity (re)link is written"
    (mt/with-temp [:model/User user {:email "disabled@example.com" :is_active false}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc"
                                                    :provider_id "old-sub"
                                                    :metadata {:iss "https://old-idp.example.com"}}]
      (let [result (login-with-claims! (assoc base-claims
                                              :email "disabled@example.com"
                                              :email_verified true)
                                       test-config)
            auth-identity (t2/select-one :model/AuthIdentity :id ai-id)]
        (is (false? (:success? result)))
        (is (= :account-disabled (:error result)))
        (is (= "old-sub" (:provider_id auth-identity)))
        (is (= "https://old-idp.example.com" (get-in auth-identity [:metadata :iss])))))))

(deftest login-assume-email-verified-test
  (testing "With :assume-email-verified, a token without the email_verified claim may auto-link"
    (mt/with-temp [:model/User user {:email "assume@example.com"}]
      (let [config (assoc test-config :assume-email-verified true)
            result (login-with-claims! (assoc base-claims :email "assume@example.com") config)]
        (is (true? (:success? result)))
        (is (= "user123" (t2/select-one-fn :provider_id :model/AuthIdentity
                                           :user_id (:id user) :provider "oidc"))))))
  (testing "...but an explicit email_verified false is still rejected"
    (mt/with-temp [:model/User _user {:email "assume2@example.com"}]
      (let [config (assoc test-config :assume-email-verified true)
            result (login-with-claims! (assoc base-claims
                                              :email "assume2@example.com"
                                              :email_verified false)
                                       config)]
        (is (false? (:success? result)))
        (is (= :email-not-verified (:error result)))))))

(deftest login-identity-provider-name-test
  (testing "With :identity-provider-name, the link lives under the per-IdP provider name"
    (mt/with-temp [:model/User user {:email "peridp@example.com"}]
      (let [config (assoc test-config :identity-provider-name "oidc-okta")
            result (login-with-claims! (assoc base-claims
                                              :email "peridp@example.com"
                                              :email_verified true)
                                       config)]
        (is (true? (:success? result)))
        (is (= "user123" (t2/select-one-fn :provider_id :model/AuthIdentity
                                           :user_id (:id user) :provider "oidc-okta")))
        (is (not (t2/exists? :model/AuthIdentity :user_id (:id user) :provider "oidc"))))))
  (testing "IdPs sharing one dispatch keyword do not touch each other's links"
    (mt/with-temp [:model/User user {:email "multi-idp@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "oidc-a"
                                                    :provider_id "sub-a"
                                                    :metadata {:iss "https://idp-a.example.com"}}]
      (let [config (assoc test-config :identity-provider-name "oidc-b")
            result (login-with-claims! (assoc base-claims
                                              :email "multi-idp@example.com"
                                              :email_verified true)
                                       config)
            row-a  (t2/select-one :model/AuthIdentity :id ai-id)]
        (is (true? (:success? result)))
        (is (= "sub-a" (:provider_id row-a)) "The other IdP's link is untouched")
        (is (= "user123" (t2/select-one-fn :provider_id :model/AuthIdentity
                                           :user_id (:id user) :provider "oidc-b")))))))

(deftest login-legacy-provider-name-migration-test
  (testing "A user's legacy shared-provider row with a matching sub migrates to the per-IdP name"
    (mt/with-temp [:model/User user {:email "migrate@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "custom-oidc"
                                                    :provider_id "user123"}]
      (let [config (assoc test-config
                          :identity-provider-name "oidc-okta"
                          :legacy-provider-name "custom-oidc")
            ;; no email_verified claim: migration backfills an existing link rather than creating one
            result (login-with-claims! (assoc base-claims :email "migrate@example.com") config)
            row    (t2/select-one :model/AuthIdentity :id ai-id)]
        (is (true? (:success? result)))
        (is (= "oidc-okta" (:provider row)))
        (is (= "https://provider.example.com" (get-in row [:metadata :iss]))))))
  (testing "A legacy row with a different sub does not migrate and linking follows policy"
    (mt/with-temp [:model/User user {:email "no-migrate@example.com"}
                   :model/AuthIdentity {ai-id :id} {:user_id (:id user)
                                                    :provider "custom-oidc"
                                                    :provider_id "other-sub"}]
      (let [config (assoc test-config
                          :identity-provider-name "oidc-okta"
                          :legacy-provider-name "custom-oidc")
            result (login-with-claims! (assoc base-claims :email "no-migrate@example.com") config)]
        (is (false? (:success? result)))
        (is (= :account-linking-required (:error result)))
        (is (= "custom-oidc" (t2/select-one-fn :provider :model/AuthIdentity :id ai-id)))))))

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
