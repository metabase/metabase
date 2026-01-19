(ns metabase.sso.oidc.tokens-test
  (:require
   [buddy.core.keys :as buddy.keys]
   [buddy.sign.jwt :as jwt]
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.sso.oidc.tokens :as oidc.tokens]))

(def ^:private test-rsa-private-key-pem
  "Test RSA private key PEM string for signing JWTs"
  "-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCzaoNf/pO3shyj
M5ynvNemVGb2S/KETJi7HCrlLBEkk4qs7gelUUfDXoX4bT2COXCejtcsEwat/4cq
rMecbrnc7F6OEqG2hobVDVHvMoyd51fBjRP9shlu0lj0LvBAkn0EKJj09rc85e7d
kE666tQboZb9f2MzQIZjnWvk1c2L+ruRXvCteX86l7JUychszrDjfRl/FO3cCrya
2G+9HiWr7i3eS8FwC117Xcob8G5L9Dys0wlNvz0WLH81hYDvdklXDB5qhjC+i/he
4Mk0OAEVJAuZLO1tKWpKMQnNZmDAvAvuZCxl6g7jkOg6ilChau50ssooceG4h7An
wdqobhTnAgMBAAECggEAEVepikUNL0jyrAh9oIMdpJDCVmq3RE2JHTEBqR741ecY
alMkfw4xGHPnEZaG8bMEAqI+WfQe2wEjph7cY+/EsdOmkidqj+jyAzRjPUf5aqal
h2p6dQqFmyjkUKTG3rRU4ZWGWiC3oUB9NdfQnGW9ifbf0EduJdKbYD6juBNokm/z
PqnLyz6lXt0fYhKiLrbZaKxtADQr0ueaJ9AHIGVjewnbi7hIPz4fwpXkP4hjos+n
PKnR33TNrn7zyVTRui68wM+oM6gMtI0yP6rUhyMBPosS7llT/fWNZJbAUxA+ujrx
ZJrif9FrForHbmQ3OVJbSLBfddx00EV9rMhOIXqp4QKBgQD799+US2yeCR6JoCgR
4e114oUNtQrhJJECdlbsMsZRO0DbaH4C8mlP0x5E8JORyhRJuf8xcMPvyJP7mYPg
ok1mZcG7JRgwWfxAeeRblchFyhTnwENuu/uO/367MZzhb+TLtdy4IJ/wNMhRWIt2
WstooHco9lJEeUses4S5iDiKxwKBgQC2SXKLoQ3iols1+sdTaZz2ukhPRyO3cgZN
garL7xThNo7zENQ+tWmt4VmjtAyM2SNw5EAJaPW7qxGfZPECCVgMnkhEAcp5rwzr
0m8Z8sDxe6lKaONB+4Hs2gKPn+gAwvFHEZFl3obGSMNuZ1/ZWEsNQLfLbge3nqmp
QIoylecE4QKBgHQCViBS8bl5fWPkJ07EdK5YEuaSumWajmFR1wd9AS4ZV+0tGQeG
UNJ942veUDNJlTm0tzguMShPc0LeFYfxci15IE9n7tEkPS36cRdxyPnI5wMk1GdB
ibr3C4RofVCWUgMwwmTMMJdJ1gkN+XgOqaSMbRChCJOaPOnvwWYiv9W1AoGAbHCX
Ft9xjjA9iIguSb3bZZ994sOUSM4pV7RascUBq9S0B38sdD2hp5IWrF8w1B1ciw0N
10s8XC8xZZw8D5UVbzQ+E07pb6gmTKe79jjGdSG2nRB2mUsQiKFMwrpC3ykZNckK
sQpHLPAearBOgdKXm0Oz0u4a4y4dChXd4KfybaECgYBGG6YQL3JYqPnJFFoxlElJ
6qZ8YxN8UqWG/meMxA25wDyFaWH4mpQzY8s1OP9Br0ZD9snNktKb6RfoJIr6IMOL
FoQyvsf7lfwsO1MqmDEWuTjHfLyAFqhdJOQBdhpaKVaRQI45oyQIH5krTvfrBA2f
C4LNFx/mlSrwtFu9TAtd2A==
-----END PRIVATE KEY-----")

(def ^:private test-rsa-public-key-pem
  "Test RSA public key PEM string corresponding to test-rsa-private-key-pem"
  "-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs2qDX/6Tt7IcozOcp7zX
plRm9kvyhEyYuxwq5SwRJJOKrO4HpVFHw16F+G09gjlwno7XLBMGrf+HKqzHnG65
3OxejhKhtoaG1Q1R7zKMnedXwY0T/bIZbtJY9C7wQJJ9BCiY9Pa3POXu3ZBOuurU
G6GW/X9jM0CGY51r5NXNi/q7kV7wrXl/OpeyVMnIbM6w430ZfxTt3Aq8mthvvR4l
q+4t3kvBcAtde13KG/BuS/Q8rNMJTb89Fix/NYWA73ZJVwweaoYwvov4XuDJNDgB
FSQLmSztbSlqSjEJzWZgwLwL7mQsZeoO45DoOopQoWrudLLKKHHhuIewJ8HaqG4U
5wIDAQAB
-----END PUBLIC KEY-----")

(def ^:private test-rsa-private-key
  "Test RSA private key for signing JWTs"
  (buddy.keys/str->private-key test-rsa-private-key-pem))

(def ^:private test-rsa-public-key
  "Test RSA public key for verifying JWTs"
  (buddy.keys/str->public-key test-rsa-public-key-pem))

(def ^:private test-jwks
  "Test JWKS"
  {:keys [(merge {:kid "test-key-id" :use "sig"} (buddy.keys/public-key->jwk test-rsa-public-key))]})

(defn- create-test-id-token
  "Create a test ID token with the given claims"
  [claims]
  (jwt/sign claims test-rsa-private-key {:alg :rs256 :header {:kid "test-key-id"}}))

(deftest validate-id-token-valid-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Successfully validates a valid ID token"
    (let [now (t/instant)
          exp (t/plus now (t/seconds 3600))
          iat (t/minus now (t/seconds 60))
          claims {:sub "user123"
                  :iss "https://provider.com"
                  :aud "test-client-id"
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "test-nonce"
                  :email "user@example.com"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (true? (:valid? result)))
          (is (some? (:claims result)))
          (is (= "user123" (get-in result [:claims :sub])))
          (is (= "user@example.com" (get-in result [:claims :email])))
          (is (nil? (:error result))))))))

(deftest validate-id-token-invalid-signature-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Rejects token with invalid signature"
    (let [token "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyMTIzIn0.invalid-signature"
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-expired-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Rejects expired token"
    (let [now (t/instant)
          exp (t/minus now (t/seconds 3600))
          iat (t/minus now (t/seconds 7200))
          claims {:sub "user123"
                  :iss "https://provider.com"
                  :aud "test-client-id"
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "test-nonce"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-wrong-issuer-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Rejects token with wrong issuer"
    (let [now (t/instant)
          exp (t/plus now (t/seconds 3600))
          iat (t/minus now (t/seconds 60))
          claims {:sub "user123"
                  :iss "https://wrong-provider.com"
                  :aud "test-client-id"
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "test-nonce"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-wrong-audience-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Rejects token with wrong audience"
    (let [now (t/instant)
          exp (t/plus now (t/seconds 3600))
          iat (t/minus now (t/seconds 60))
          claims {:sub "user123"
                  :iss "https://provider.com"
                  :aud "wrong-client-id"
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "test-nonce"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-wrong-nonce-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Rejects token with wrong nonce"
    (let [now (t/instant)
          exp (t/plus now (t/seconds 3600))
          iat (t/minus now (t/seconds 60))
          claims {:sub "user123"
                  :iss "https://provider.com"
                  :aud "test-client-id"
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "wrong-nonce"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-audience-array-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Accepts token with audience as array"
    (let [now (t/instant)
          exp (t/plus now (t/seconds 3600))
          iat (t/minus now (t/seconds 60))
          claims {:sub "user123"
                  :iss "https://provider.com"
                  :aud ["test-client-id" "other-client-id"]
                  :exp (quot (t/to-millis-from-epoch exp) 1000)
                  :iat (quot (t/to-millis-from-epoch iat) 1000)
                  :nonce "test-nonce"}
          token (create-test-id-token claims)
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (true? (:valid? result))))))))

(deftest validate-id-token-jwks-fetch-failure-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Handles JWKS fetch failure"
    (let [token "some-token"
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               (throw (ex-info "Network error" {})))]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

(deftest validate-id-token-malformed-test
  (oidc.tokens/clear-jwks-cache!)
  (testing "Handles malformed token"
    (let [token "not-a-valid-jwt"
          config {:jwks-uri "https://provider.com/jwks"
                  :issuer-uri "https://provider.com"
                  :client-id "test-client-id"}]
      (with-redefs [http/get (fn [_url _opts]
                               {:status 200
                                :body test-jwks})]
        (let [result (oidc.tokens/validate-id-token token config "test-nonce")]
          (is (false? (:valid? result)))
          (is (some? (:error result))))))))

;;; ================================================== Cache Expiration Tests ==================================================

(deftest jwks-cache-uses-cached-entry-when-fresh-test
  (testing "Uses cached JWKS when cache is fresh (not expired)"
    (oidc.tokens/clear-jwks-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-jwks})]
        ;; First call should fetch
        (let [result1 (oidc.tokens/get-jwks "https://provider.com/jwks")]
          (is (some? result1))
          (is (= 1 @fetch-count)))
        ;; Second call should use cache (no additional fetch)
        (let [result2 (oidc.tokens/get-jwks "https://provider.com/jwks")]
          (is (some? result2))
          (is (= 1 @fetch-count)))))))

(deftest jwks-cache-refetches-when-expired-test
  (testing "Re-fetches JWKS when cache entry is expired"
    (oidc.tokens/clear-jwks-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-jwks})]
        ;; First call should fetch
        (oidc.tokens/get-jwks "https://github.com/jwks")
        (is (= 1 @fetch-count))

        ;; Manually expire the cache entry by setting fetched-at to 2 hours ago
        (let [two-hours-ago (t/to-millis-from-epoch (t/minus (t/instant) (t/hours 2)))]
          (swap! @#'oidc.tokens/jwks-cache
                 assoc "https://github.com/jwks"
                 {:jwks test-jwks :fetched-at two-hours-ago}))

        ;; Next call should re-fetch because cache is expired
        (oidc.tokens/get-jwks "https://github.com/jwks")
        (is (= 2 @fetch-count))))))

(deftest invalidate-jwks-cache-test
  (testing "invalidate-jwks-cache! removes cache entry for specific URI"
    (oidc.tokens/clear-jwks-cache!)
    (let [fetch-count (atom 0)]
      (with-redefs [http/get (fn [_url _opts]
                               (swap! fetch-count inc)
                               {:status 200
                                :body test-jwks})]
        ;; Populate cache
        (oidc.tokens/get-jwks "https://provider.com/jwks")
        (is (= 1 @fetch-count))

        ;; Invalidate the cache entry
        (oidc.tokens/invalidate-jwks-cache! "https://provider.com/jwks")

        ;; Next call should re-fetch
        (oidc.tokens/get-jwks "https://provider.com/jwks")
        (is (= 2 @fetch-count))))))

;;; ================================================== SSRF Protection Tests ==================================================

(deftest get-jwks-ssrf-protection-test
  (testing "Rejects internal addresses (localhost)"
    (oidc.tokens/clear-jwks-cache!)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid JWKS URI: internal addresses not allowed"
                          (oidc.tokens/get-jwks "http://localhost/jwks"))))

  (testing "Rejects internal addresses (127.0.0.1)"
    (oidc.tokens/clear-jwks-cache!)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid JWKS URI: internal addresses not allowed"
                          (oidc.tokens/get-jwks "http://127.0.0.1/jwks"))))

  (testing "Rejects cloud metadata endpoint"
    (oidc.tokens/clear-jwks-cache!)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid JWKS URI: internal addresses not allowed"
                          (oidc.tokens/get-jwks "http://169.254.169.254/jwks"))))

  (testing "Rejects private network addresses (192.168.x.x)"
    (oidc.tokens/clear-jwks-cache!)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid JWKS URI: internal addresses not allowed"
                          (oidc.tokens/get-jwks "http://192.168.1.1/jwks"))))

  (testing "Rejects private network addresses (10.x.x.x)"
    (oidc.tokens/clear-jwks-cache!)
    (is (thrown-with-msg? clojure.lang.ExceptionInfo
                          #"Invalid JWKS URI: internal addresses not allowed"
                          (oidc.tokens/get-jwks "http://10.0.0.1/jwks")))))
