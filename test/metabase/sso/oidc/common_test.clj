(ns metabase.sso.oidc.common-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sso.oidc.common :as oidc.common]))

(deftest ^:parallel generate-state-test
  (testing "Generates non-empty state token"
    (let [state (oidc.common/generate-state)]
      (is (string? state))
      (is (pos? (count state)))))

  (testing "Generates unique state tokens"
    (let [state1 (oidc.common/generate-state)
          state2 (oidc.common/generate-state)]
      (is (not= state1 state2))))

  (testing "State token is URL-safe (no special characters)"
    (let [state (oidc.common/generate-state)]
      (is (re-matches #"[A-Za-z0-9\-_]+" state)))))

(deftest ^:parallel generate-nonce-test
  (testing "Generates non-empty nonce"
    (let [nonce (oidc.common/generate-nonce)]
      (is (string? nonce))
      (is (pos? (count nonce)))))

  (testing "Generates unique nonces"
    (let [nonce1 (oidc.common/generate-nonce)
          nonce2 (oidc.common/generate-nonce)]
      (is (not= nonce1 nonce2))))

  (testing "Nonce is URL-safe (no special characters)"
    (let [nonce (oidc.common/generate-nonce)]
      (is (re-matches #"[A-Za-z0-9\-_]+" nonce)))))

(deftest ^:parallel build-query-string-test
  (testing "Builds query string from simple params"
    (let [params {:foo "bar" :baz "qux"}
          query-string (oidc.common/build-query-string params)]
      (is (or (= query-string "foo=bar&baz=qux")
              (= query-string "baz=qux&foo=bar")))))

  (testing "URL-encodes parameter values"
    (let [params {:redirect_uri "https://example.com/callback?foo=bar"}
          query-string (oidc.common/build-query-string params)]
      (is (= "redirect_uri=https%3A%2F%2Fexample.com%2Fcallback%3Ffoo%3Dbar" query-string))))

  (testing "URL-encodes parameter names"
    (let [params {:some-param "value"}
          query-string (oidc.common/build-query-string params)]
      (is (= "some-param=value" query-string))))

  (testing "Handles spaces in values"
    (let [params {:scope "openid profile email"}
          query-string (oidc.common/build-query-string params)]
      (is (= "scope=openid%20profile%20email" query-string))))

  (testing "Handles empty params"
    (let [query-string (oidc.common/build-query-string {})]
      (is (= "" query-string)))))

(deftest ^:parallel generate-authorization-url-test
  (testing "Generates authorization URL with all parameters"
    (let [url (oidc.common/generate-authorization-url
               "https://provider.com/authorize"
               "test-client-id"
               "https://metabase.com/callback"
               ["openid" "email" "profile"]
               "test-state"
               "test-nonce")]
      (is (string? url))
      (is (str/starts-with? url "https://provider.com/authorize?"))
      (is (str/includes? url "response_type=code"))
      (is (str/includes? url "client_id=test-client-id"))
      (is (str/includes? url "redirect_uri=https%3A%2F%2Fmetabase.com%2Fcallback"))
      (is (str/includes? url "scope=openid%20email%20profile"))
      (is (str/includes? url "state=test-state"))
      (is (str/includes? url "nonce=test-nonce"))))

  (testing "Properly encodes redirect URI"
    (let [url (oidc.common/generate-authorization-url
               "https://provider.com/authorize"
               "client-id"
               "https://metabase.com/auth/oidc/callback?foo=bar"
               ["openid"]
               "state"
               "nonce")]
      (is (str/includes? url "redirect_uri=https%3A%2F%2Fmetabase.com%2Fauth%2Foidc%2Fcallback%3Ffoo%3Dbar"))))

  (testing "Joins multiple scopes with spaces"
    (let [url (oidc.common/generate-authorization-url
               "https://provider.com/authorize"
               "client-id"
               "https://metabase.com/callback"
               ["openid" "email" "profile" "groups"]
               "state"
               "nonce")]
      (is (str/includes? url "scope=openid%20email%20profile%20groups")))))

(deftest ^:parallel extract-oidc-config-test
  (testing "Extracts config from :oidc-config key"
    (let [config {:client-id "test"
                  :client-secret "secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.com/callback"}
          request {:oidc-config config
                   :other-key "ignored"}
          extracted (oidc.common/extract-oidc-config request)]
      (is (= extracted config))))

  (testing "Extracts config from :auth-identity :metadata"
    (let [config {:client-id "test"
                  :client-secret "secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.com/callback"}
          request {:auth-identity {:metadata config}
                   :other-key "ignored"}
          extracted (oidc.common/extract-oidc-config request)]
      (is (= extracted config))))

  (testing "Extracts config from direct request keys"
    (let [request {:client-id "test"
                   :client-secret "secret"
                   :issuer-uri "https://example.com"
                   :redirect-uri "https://metabase.com/callback"
                   :other-key "ignored"}
          extracted (oidc.common/extract-oidc-config request)]
      (is (= {:client-id "test"
              :client-secret "secret"
              :issuer-uri "https://example.com"
              :redirect-uri "https://metabase.com/callback"}
             extracted))))

  (testing "Prefers :oidc-config over :auth-identity"
    (let [oidc-config {:client-id "from-oidc-config"}
          auth-identity-config {:client-id "from-auth-identity"}
          request {:oidc-config oidc-config
                   :auth-identity {:metadata auth-identity-config}}
          extracted (oidc.common/extract-oidc-config request)]
      (is (= "from-oidc-config" (:client-id extracted)))))

  (testing "Prefers :auth-identity over direct keys"
    (let [auth-identity-config {:client-id "from-auth-identity"}
          request {:auth-identity {:metadata auth-identity-config}
                   :client-id "from-direct-keys"}
          extracted (oidc.common/extract-oidc-config request)]
      (is (= "from-auth-identity" (:client-id extracted)))))

  (testing "Returns nil when no config found"
    (let [request {:other-key "value"}
          extracted (oidc.common/extract-oidc-config request)]
      (is (nil? extracted)))))

(deftest ^:parallel parse-token-response-test
  (testing "Parses token response with all fields"
    (let [response-body {:id_token "eyJhbGciOiJSUzI1NiJ9..."
                         :access_token "access-token-123"
                         :refresh_token "refresh-token-456"
                         :expires_in 3600}
          parsed (oidc.common/parse-token-response response-body)]
      (is (= "eyJhbGciOiJSUzI1NiJ9..." (:id-token parsed)))
      (is (= "access-token-123" (:access-token parsed)))
      (is (= "refresh-token-456" (:refresh-token parsed)))
      (is (= 3600 (:expires-in parsed)))))

  (testing "Parses token response with missing optional fields"
    (let [response-body {:id_token "eyJhbGciOiJSUzI1NiJ9..."
                         :access_token "access-token-123"}
          parsed (oidc.common/parse-token-response response-body)]
      (is (= "eyJhbGciOiJSUzI1NiJ9..." (:id-token parsed)))
      (is (= "access-token-123" (:access-token parsed)))
      (is (nil? (:refresh-token parsed)))
      (is (nil? (:expires-in parsed))))))

(deftest ^:parallel validate-callback-params-test
  (testing "Valid callback with code and state"
    (let [params {:code "auth-code-123"
                  :state "state-token-456"}
          result (oidc.common/validate-callback-params params)]
      (is (true? (:valid? result)))
      (is (= "auth-code-123" (:code result)))
      (is (= "state-token-456" (:state result)))
      (is (nil? (:error result)))))

  (testing "Error response from provider"
    (let [params {:error "access_denied"
                  :error_description "User denied access"}
          result (oidc.common/validate-callback-params params)]
      (is (false? (:valid? result)))
      (is (= "access_denied" (get-in result [:error :code])))
      (is (= "User denied access" (get-in result [:error :description])))))

  (testing "Missing authorization code"
    (let [params {:state "state-token"}
          result (oidc.common/validate-callback-params params)]
      (is (false? (:valid? result)))
      (is (= :missing_code (get-in result [:error :code])))))

  (testing "Missing state parameter"
    (let [params {:code "auth-code"}
          result (oidc.common/validate-callback-params params)]
      (is (false? (:valid? result)))
      (is (= :missing_state (get-in result [:error :code])))))

  (testing "Empty params map"
    (let [params {}
          result (oidc.common/validate-callback-params params)]
      (is (false? (:valid? result))))))
