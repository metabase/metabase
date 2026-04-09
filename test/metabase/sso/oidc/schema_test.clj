(ns metabase.sso.oidc.schema-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.oidc.schema :as oidc.schema]))

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
