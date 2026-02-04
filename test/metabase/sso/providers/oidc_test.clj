(ns metabase.sso.providers.oidc-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.auth-identity.provider :as provider]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.sso.oidc.tokens :as oidc.tokens]
   [metabase.sso.providers.oidc]))

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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
                  (fn [_issuer] test-discovery-doc)]
      (let [config (assoc test-config :scopes ["openid" "email" "profile" "groups"])
            request {:oidc-config config}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result)))
        (is (str/includes? (:redirect-url result) "scope=openid%20email%20profile%20groups")))))

  (testing "Returns error when authorization endpoint not found"
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
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

(deftest authenticate-custom-attribute-mapping-test
  (testing "Uses custom attribute mappings when provided"
    (with-redefs [oidc.discovery/discover-oidc-configuration
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
    (with-redefs [oidc.discovery/discover-oidc-configuration
                  (fn [_issuer] test-discovery-doc)]
      (let [request {:oidc-config test-config}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result))))))

  (testing "Extracts config from :auth-identity metadata"
    (with-redefs [oidc.discovery/discover-oidc-configuration
                  (fn [_issuer] test-discovery-doc)]
      (let [request {:auth-identity {:metadata test-config}}
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result))))))

  (testing "Extracts config from direct request keys"
    (with-redefs [oidc.discovery/discover-oidc-configuration
                  (fn [_issuer] test-discovery-doc)]
      (let [request (merge test-config {:other-key "ignored"})
            result (provider/authenticate :provider/oidc request)]
        (is (= :redirect (:success? result)))))))

(deftest provider-hierarchy-test
  (testing "OIDC provider derives from base provider"
    (is (isa? :provider/oidc ::provider/provider)))

  (testing "OIDC provider derives from create-user-if-not-exists"
    (is (isa? :provider/oidc ::provider/create-user-if-not-exists))))
