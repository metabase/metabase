(ns metabase.sso.oidc.discovery-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.sso.oidc.discovery :as oidc.discovery]))

(deftest ^:parallel get-authorization-endpoint-test
  (testing "Gets authorization endpoint from discovery document"
    (let [config {:discovery-document {:authorization_endpoint "https://provider.com/authorize"}}
          endpoint (oidc.discovery/get-authorization-endpoint config)]
      (is (= "https://provider.com/authorize" endpoint))))

  (testing "Gets authorization endpoint from manual config"
    (let [config {:authorization-endpoint "https://provider.com/manual/authorize"}
          endpoint (oidc.discovery/get-authorization-endpoint config)]
      (is (= "https://provider.com/manual/authorize" endpoint))))

  (testing "Prefers discovery document over manual config"
    (let [config {:discovery-document {:authorization_endpoint "https://provider.com/discovery/authorize"}
                  :authorization-endpoint "https://provider.com/manual/authorize"}
          endpoint (oidc.discovery/get-authorization-endpoint config)]
      (is (= "https://provider.com/discovery/authorize" endpoint))))

  (testing "Returns nil when not found"
    (let [config {}
          endpoint (oidc.discovery/get-authorization-endpoint config)]
      (is (nil? endpoint)))))

(deftest ^:parallel get-token-endpoint-test
  (testing "Gets token endpoint from discovery document"
    (let [config {:discovery-document {:token_endpoint "https://provider.com/token"}}
          endpoint (oidc.discovery/get-token-endpoint config)]
      (is (= "https://provider.com/token" endpoint))))

  (testing "Gets token endpoint from manual config"
    (let [config {:token-endpoint "https://provider.com/manual/token"}
          endpoint (oidc.discovery/get-token-endpoint config)]
      (is (= "https://provider.com/manual/token" endpoint))))

  (testing "Prefers discovery document over manual config"
    (let [config {:discovery-document {:token_endpoint "https://provider.com/discovery/token"}
                  :token-endpoint "https://provider.com/manual/token"}
          endpoint (oidc.discovery/get-token-endpoint config)]
      (is (= "https://provider.com/discovery/token" endpoint))))

  (testing "Returns nil when not found"
    (let [config {}
          endpoint (oidc.discovery/get-token-endpoint config)]
      (is (nil? endpoint)))))

(deftest ^:parallel get-jwks-uri-test
  (testing "Gets JWKS URI from discovery document"
    (let [config {:discovery-document {:jwks_uri "https://provider.com/jwks"}}
          uri (oidc.discovery/get-jwks-uri config)]
      (is (= "https://provider.com/jwks" uri))))

  (testing "Gets JWKS URI from manual config"
    (let [config {:jwks-uri "https://provider.com/manual/jwks"}
          uri (oidc.discovery/get-jwks-uri config)]
      (is (= "https://provider.com/manual/jwks" uri))))

  (testing "Prefers discovery document over manual config"
    (let [config {:discovery-document {:jwks_uri "https://provider.com/discovery/jwks"}
                  :jwks-uri "https://provider.com/manual/jwks"}
          uri (oidc.discovery/get-jwks-uri config)]
      (is (= "https://provider.com/discovery/jwks" uri))))

  (testing "Returns nil when not found"
    (let [config {}
          uri (oidc.discovery/get-jwks-uri config)]
      (is (nil? uri)))))

(deftest ^:parallel get-userinfo-endpoint-test
  (testing "Gets userinfo endpoint from discovery document"
    (let [config {:discovery-document {:userinfo_endpoint "https://provider.com/userinfo"}}
          endpoint (oidc.discovery/get-userinfo-endpoint config)]
      (is (= "https://provider.com/userinfo" endpoint))))

  (testing "Gets userinfo endpoint from manual config"
    (let [config {:userinfo-endpoint "https://provider.com/manual/userinfo"}
          endpoint (oidc.discovery/get-userinfo-endpoint config)]
      (is (= "https://provider.com/manual/userinfo" endpoint))))

  (testing "Prefers discovery document over manual config"
    (let [config {:discovery-document {:userinfo_endpoint "https://provider.com/discovery/userinfo"}
                  :userinfo-endpoint "https://provider.com/manual/userinfo"}
          endpoint (oidc.discovery/get-userinfo-endpoint config)]
      (is (= "https://provider.com/discovery/userinfo" endpoint))))

  (testing "Returns nil when not found"
    (let [config {}
          endpoint (oidc.discovery/get-userinfo-endpoint config)]
      (is (nil? endpoint)))))

(deftest discover-oidc-configuration-success-test
  (testing "Successfully discovers OIDC configuration"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [url _opts]
                             (is (= "https://provider.com/.well-known/openid-configuration" url))
                             {:status 200
                              :body {:issuer "https://provider.com"
                                     :authorization_endpoint "https://provider.com/authorize"
                                     :token_endpoint "https://provider.com/token"
                                     :jwks_uri "https://provider.com/jwks"
                                     :userinfo_endpoint "https://provider.com/userinfo"}})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://provider.com")]
        (is (some? config))
        (is (= "https://provider.com" (:issuer config)))
        (is (= "https://provider.com/authorize" (:authorization_endpoint config)))
        (is (= "https://provider.com/token" (:token_endpoint config)))
        (is (= "https://provider.com/jwks" (:jwks_uri config)))))))

(deftest discover-oidc-configuration-http-error-test
  (testing "Handles HTTP errors gracefully"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [_url _opts]
                             {:status 404
                              :body "Not Found"})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://error-provider.com")]
        (is (nil? config))))))

(deftest discover-oidc-configuration-exception-test
  (testing "Handles exceptions gracefully"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [_url _opts]
                             (throw (ex-info "Connection timeout" {})))]
      (let [config (oidc.discovery/discover-oidc-configuration "https://exception-provider.com")]
        (is (nil? config))))))

(deftest discover-oidc-configuration-trailing-slash-test
  (testing "Strips trailing slash from issuer URI"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [url _opts]
                             (is (= "https://slash-provider.com/.well-known/openid-configuration" url))
                             {:status 200
                              :body {:issuer "https://slash-provider.com"
                                     :authorization_endpoint "https://slash-provider.com/authorize"}})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://slash-provider.com/")]
        (is (some? config))))))
