(ns metabase.sso.oidc.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.oidc.schema :as oidc.schema]))

(deftest ^:parallel validate-configuration-test
  (testing "Valid configuration with all required fields"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (true? (:valid? result)))
      (is (nil? (:errors result)))))

  (testing "Valid configuration with manual endpoints"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :authorization-endpoint "https://example.com/authorize"
                  :token-endpoint "https://example.com/token"
                  :jwks-uri "https://example.com/jwks"}
          result (oidc.schema/validate-configuration config)]
      (is (true? (:valid? result)))))

  (testing "Valid configuration with custom scopes"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :scopes ["openid" "email" "profile" "groups"]}
          result (oidc.schema/validate-configuration config)]
      (is (true? (:valid? result)))))

  (testing "Invalid configuration - missing client-id"
    (let [config {:client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid configuration - missing client-secret"
    (let [config {:client-id "test-client-id"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid configuration - missing issuer-uri"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid configuration - missing redirect-uri"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid configuration - empty client-id"
    (let [config {:client-id ""
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))))

  (testing "Invalid configuration - invalid URI format"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "not a valid uri!!!"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result)))))

  (testing "Invalid configuration - empty scopes array"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :scopes []}
          result (oidc.schema/validate-configuration config)]
      (is (false? (:valid? result))))))

(deftest ^:parallel validate-id-token-claims-test
  (testing "Valid ID token claims"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :aud "test-client-id"
                  :exp 1234567890
                  :iat 1234567800
                  :email "user@example.com"
                  :given_name "John"
                  :family_name "Doe"}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (true? (:valid? result)))
      (is (nil? (:errors result)))))

  (testing "Valid ID token claims with minimal fields"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :aud "test-client-id"
                  :exp 1234567890
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (true? (:valid? result)))))

  (testing "Valid ID token claims with audience as array"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :aud ["test-client-id" "other-client"]
                  :exp 1234567890
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (true? (:valid? result)))))

  (testing "Invalid claims - missing sub"
    (let [claims {:iss "https://example.com"
                  :aud "test-client-id"
                  :exp 1234567890
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid claims - missing iss"
    (let [claims {:sub "user123"
                  :aud "test-client-id"
                  :exp 1234567890
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid claims - missing aud"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :exp 1234567890
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid claims - missing exp"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :aud "test-client-id"
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (false? (:valid? result)))
      (is (some? (:errors result)))))

  (testing "Invalid claims - exp is string not int"
    (let [claims {:sub "user123"
                  :iss "https://example.com"
                  :aud "test-client-id"
                  :exp "1234567890"
                  :iat 1234567800}
          result (oidc.schema/validate-id-token-claims claims)]
      (is (false? (:valid? result))))))

(deftest ^:parallel discovery-based?-test
  (testing "Configuration is discovery-based when no manual endpoints"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}]
      (is (true? (oidc.schema/discovery-based? config)))))

  (testing "Configuration is NOT discovery-based when authorization-endpoint present"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :authorization-endpoint "https://example.com/authorize"}]
      (is (false? (oidc.schema/discovery-based? config)))))

  (testing "Configuration is NOT discovery-based when token-endpoint present"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :token-endpoint "https://example.com/token"}]
      (is (false? (oidc.schema/discovery-based? config)))))

  (testing "Configuration is NOT discovery-based when jwks-uri present"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :jwks-uri "https://example.com/jwks"}]
      (is (false? (oidc.schema/discovery-based? config)))))

  (testing "Configuration is NOT discovery-based when userinfo-endpoint present"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :userinfo-endpoint "https://example.com/userinfo"}]
      (is (false? (oidc.schema/discovery-based? config))))))

(deftest ^:parallel manual-configuration?-test
  (testing "Configuration is NOT manual when no endpoints specified"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"}]
      (is (false? (oidc.schema/manual-configuration? config)))))

  (testing "Configuration is manual when authorization-endpoint present"
    (let [config {:client-id "test-client-id"
                  :client-secret "test-client-secret"
                  :issuer-uri "https://example.com"
                  :redirect-uri "https://metabase.example.com/auth/oidc/callback"
                  :authorization-endpoint "https://example.com/authorize"}]
      (is (true? (oidc.schema/manual-configuration? config))))))
