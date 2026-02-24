(ns metabase.sso.oidc.discovery-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.sso.oidc.discovery :as oidc.discovery]
   [metabase.test :as mt]))

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

(deftest discover-oidc-configuration-success-test
  (testing "Successfully discovers OIDC configuration"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [url _opts]
                             (is (= "https://example.com/.well-known/openid-configuration" url))
                             {:status 200
                              :body {:issuer "https://example.com"
                                     :authorization_endpoint "https://example.com/authorize"
                                     :token_endpoint "https://example.com/token"
                                     :jwks_uri "https://example.com/jwks"
                                     :userinfo_endpoint "https://example.com/userinfo"}})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://example.com")]
        (is (some? config))
        (is (= "https://example.com" (:issuer config)))
        (is (= "https://example.com/authorize" (:authorization_endpoint config)))
        (is (= "https://example.com/token" (:token_endpoint config)))
        (is (= "https://example.com/jwks" (:jwks_uri config)))))))

(deftest discover-oidc-configuration-http-error-test
  (testing "Handles HTTP errors gracefully"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [_url _opts]
                             {:status 404
                              :body "Not Found"})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://example.org")]
        (is (nil? config))))))

(deftest discover-oidc-configuration-exception-test
  (testing "Handles exceptions gracefully"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [_url _opts]
                             (throw (ex-info "Connection timeout" {})))]
      (let [config (oidc.discovery/discover-oidc-configuration "https://example.net")]
        (is (nil? config))))))

(deftest discover-oidc-configuration-trailing-slash-test
  (testing "Strips trailing slash from issuer URI"
    (oidc.discovery/clear-cache!)
    (with-redefs [http/get (fn [url _opts]
                             (is (= "https://example.edu/.well-known/openid-configuration" url))
                             {:status 200
                              :body {:issuer "https://example.edu"
                                     :authorization_endpoint "https://example.edu/authorize"}})]
      (let [config (oidc.discovery/discover-oidc-configuration "https://example.edu/")]
        (is (some? config))))))

;;; ================================================== Cache Expiration Tests ==================================================

(def ^:private test-discovery-doc
  {:issuer "https://google.com"
   :authorization_endpoint "https://google.com/authorize"
   :token_endpoint "https://google.com/token"
   :jwks_uri "https://google.com/jwks"})

(deftest discovery-cache-uses-cached-entry-when-fresh-test
  (testing "Uses cached discovery document when cache is fresh (not expired)"
    (oidc.discovery/clear-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-discovery-doc})]
        ;; First call should fetch
        (let [result1 (oidc.discovery/discover-oidc-configuration "https://google.com")]
          (is (some? result1))
          (is (= 1 @fetch-count)))
        ;; Second call should use cache (no additional fetch)
        (let [result2 (oidc.discovery/discover-oidc-configuration "https://google.com")]
          (is (some? result2))
          (is (= 1 @fetch-count)))))))

(deftest discovery-cache-refetches-when-expired-test
  (testing "Re-fetches discovery document when cache entry is expired"
    (oidc.discovery/clear-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-discovery-doc})]
        ;; First call should fetch
        (oidc.discovery/discover-oidc-configuration "https://github.com")
        (is (= 1 @fetch-count))

        ;; Manually expire the cache entry by setting fetched-at to 25 hours ago (TTL is 24h)
        (let [twenty-five-hours-ago (t/to-millis-from-epoch (t/minus (t/instant) (t/hours 25)))]
          (swap! @#'oidc.discovery/discovery-cache
                 assoc "https://github.com"
                 {:document test-discovery-doc :fetched-at twenty-five-hours-ago}))

        ;; Next call should re-fetch because cache is expired
        (oidc.discovery/discover-oidc-configuration "https://github.com")
        (is (= 2 @fetch-count))))))

(deftest invalidate-discovery-cache-test
  (testing "invalidate-cache! removes cache entry for specific issuer"
    (oidc.discovery/clear-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-discovery-doc})]
        ;; Populate cache
        (oidc.discovery/discover-oidc-configuration "https://microsoft.com")
        (is (= 1 @fetch-count))

        ;; Invalidate the cache entry
        (oidc.discovery/invalidate-cache! "https://microsoft.com")

        ;; Next call should re-fetch
        (oidc.discovery/discover-oidc-configuration "https://microsoft.com")
        (is (= 2 @fetch-count))))))

(deftest invalidate-discovery-cache-with-trailing-slash-test
  (testing "invalidate-cache! normalizes issuer URL"
    (oidc.discovery/clear-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-discovery-doc})]
        ;; Populate cache without trailing slash
        (oidc.discovery/discover-oidc-configuration "https://apple.com")
        (is (= 1 @fetch-count))

        ;; Invalidate with trailing slash (should still work)
        (oidc.discovery/invalidate-cache! "https://apple.com/")

        ;; Next call should re-fetch
        (oidc.discovery/discover-oidc-configuration "https://apple.com")
        (is (= 2 @fetch-count))))))

;;; ================================================== SSRF Protection Tests ==================================================

(deftest discover-oidc-configuration-ssrf-protection-test
  (testing "Respects oidc-allowed-networks if set"
    (oidc.discovery/clear-cache!)
    (mt/with-temporary-setting-values [oidc-allowed-networks :external-only]
      (testing "Rejects internal addresses (localhost)"
        (oidc.discovery/clear-cache!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid issuer URL: address not allowed by network restrictions"
                              (oidc.discovery/discover-oidc-configuration "http://localhost/oidc"))))

      (testing "Rejects internal addresses (127.0.0.1)"
        (oidc.discovery/clear-cache!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid issuer URL: address not allowed by network restrictions"
                              (oidc.discovery/discover-oidc-configuration "http://127.0.0.1/oidc"))))

      (testing "Rejects cloud metadata endpoint"
        (oidc.discovery/clear-cache!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid issuer URL: address not allowed by network restrictions"
                              (oidc.discovery/discover-oidc-configuration "http://169.254.169.254/metadata"))))

      (testing "Rejects private network addresses (192.168.x.x)"
        (oidc.discovery/clear-cache!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid issuer URL: address not allowed by network restrictions"
                              (oidc.discovery/discover-oidc-configuration "http://192.168.1.1/oidc"))))

      (testing "Rejects private network addresses (10.x.x.x)"
        (oidc.discovery/clear-cache!)
        (is (thrown-with-msg? clojure.lang.ExceptionInfo
                              #"Invalid issuer URL: address not allowed by network restrictions"
                              (oidc.discovery/discover-oidc-configuration "http://10.0.0.1/oidc")))))))
