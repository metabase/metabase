(ns metabase.sso.oidc.state-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.oidc.state :as oidc.state]
   [metabase.system.settings :as system.settings]
   [metabase.util.encryption :as encryption])
  (:import
   (java.time Instant)))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Test Helpers --------------------------------------------------

(defn- now-ms
  "Returns the current time in milliseconds using java.time.Instant."
  []
  (.toEpochMilli (Instant/now)))

(def ^:private test-secret-key
  "A test encryption key for unit tests."
  "Orw0AAyzkO/kPTLJRxiyKoBHXa/d6ZcO+p+gpZO/wSQ=")

(def ^:private test-secret
  "Hashed test encryption key."
  (encryption/secret-key->hash test-secret-key))

(defmacro with-test-encryption!
  "Run body with encryption enabled using a test secret key."
  [& body]
  `(with-redefs [encryption/default-secret-key test-secret]
     ~@body))

(defmacro without-encryption!
  "Run body with encryption disabled."
  [& body]
  `(with-redefs [encryption/default-secret-key nil]
     ~@body))

(defmacro with-site-url!
  "Run body with a specific site-url configured."
  [site-url & body]
  `(with-redefs [system.settings/site-url (constantly ~site-url)]
     ~@body))

;;; -------------------------------------------------- Redirect URL Validation Tests --------------------------------------------------

(deftest ^:parallel valid-redirect-url-test
  (testing "relative URLs"
    (testing "accepts valid relative URLs"
      (is (true? (oidc.state/valid-redirect-url? "/" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "/dashboard" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "/dashboard/123" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "/path?query=value" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "/path#fragment" "https://example.com"))))

    (testing "rejects protocol-relative URLs (potential open redirect)"
      (is (false? (oidc.state/valid-redirect-url? "//evil.com" "https://example.com")))
      (is (false? (oidc.state/valid-redirect-url? "//evil.com/path" "https://example.com")))))

  (testing "absolute URLs"
    (testing "accepts same-origin URLs"
      (is (true? (oidc.state/valid-redirect-url? "https://example.com/" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "https://example.com/dashboard" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "https://example.com:443/path" "https://example.com")))
      (is (true? (oidc.state/valid-redirect-url? "http://example.com:80/path" "http://example.com"))))

    (testing "accepts same-origin with explicit default ports"
      (is (true? (oidc.state/valid-redirect-url? "https://example.com:443/" "https://example.com/")))
      (is (true? (oidc.state/valid-redirect-url? "http://example.com:80/" "http://example.com/"))))

    (testing "accepts same-origin with non-default ports"
      (is (true? (oidc.state/valid-redirect-url? "https://example.com:8443/path" "https://example.com:8443")))
      (is (true? (oidc.state/valid-redirect-url? "http://example.com:3000/" "http://example.com:3000/"))))

    (testing "rejects different origins"
      (is (false? (oidc.state/valid-redirect-url? "https://evil.com/" "https://example.com")))
      (is (false? (oidc.state/valid-redirect-url? "https://evil.com/path" "https://example.com")))
      (is (false? (oidc.state/valid-redirect-url? "https://subdomain.example.com/" "https://example.com"))))

    (testing "rejects different schemes"
      (is (false? (oidc.state/valid-redirect-url? "http://example.com/" "https://example.com")))
      (is (false? (oidc.state/valid-redirect-url? "https://example.com/" "http://example.com"))))

    (testing "rejects different ports"
      (is (false? (oidc.state/valid-redirect-url? "https://example.com:8443/" "https://example.com")))
      (is (false? (oidc.state/valid-redirect-url? "https://example.com/" "https://example.com:8443")))))

  (testing "case insensitivity"
    (is (true? (oidc.state/valid-redirect-url? "https://EXAMPLE.COM/path" "https://example.com")))
    (is (true? (oidc.state/valid-redirect-url? "HTTPS://example.com/path" "https://example.com"))))

  (testing "invalid inputs"
    (is (false? (oidc.state/valid-redirect-url? nil "https://example.com")))
    (is (false? (oidc.state/valid-redirect-url? "" "https://example.com")))
    (is (false? (oidc.state/valid-redirect-url? "   " "https://example.com")))
    (is (false? (oidc.state/valid-redirect-url? "not-a-url" "https://example.com")))
    (is (false? (oidc.state/valid-redirect-url? "javascript:alert(1)" "https://example.com")))
    (is (false? (oidc.state/valid-redirect-url? "data:text/html,<script>alert(1)</script>" "https://example.com")))))

(deftest valid-redirect-url-uses-site-url-test
  (testing "uses system site-url when not provided"
    (with-site-url! "https://metabase.example.com"
      (is (true? (oidc.state/valid-redirect-url? "/dashboard")))
      (is (true? (oidc.state/valid-redirect-url? "https://metabase.example.com/dashboard")))
      (is (false? (oidc.state/valid-redirect-url? "https://evil.com/"))))))

;;; -------------------------------------------------- create-oidc-state Tests --------------------------------------------------

(deftest create-oidc-state-test
  (with-site-url! "https://metabase.example.com"
    (testing "creates state with all required fields"
      (let [state-map (oidc.state/create-oidc-state {:state    "csrf-token"
                                                     :nonce    "nonce-value"
                                                     :redirect "/dashboard"
                                                     :provider :slack-connect})]
        (is (= "csrf-token" (:state state-map)))
        (is (= "nonce-value" (:nonce state-map)))
        (is (= "/dashboard" (:redirect state-map)))
        (is (= "slack-connect" (:provider state-map)))
        (is (number? (:created-at state-map)))
        (is (number? (:expires-at state-map)))
        (is (> (:expires-at state-map) (:created-at state-map)))))

    (testing "includes browser-id when provided"
      (let [state-map (oidc.state/create-oidc-state {:state      "csrf-token"
                                                     :nonce      "nonce-value"
                                                     :redirect   "/dashboard"
                                                     :provider   :slack-connect
                                                     :browser-id "device-uuid"})]
        (is (= "device-uuid" (:browser-id state-map)))))

    (testing "omits browser-id when not provided"
      (let [state-map (oidc.state/create-oidc-state {:state    "csrf-token"
                                                     :nonce    "nonce-value"
                                                     :redirect "/dashboard"
                                                     :provider :slack-connect})]
        (is (not (contains? state-map :browser-id)))))

    (testing "uses custom ttl-ms when provided"
      (let [before    (now-ms)
            state-map (oidc.state/create-oidc-state {:state    "csrf-token"
                                                     :nonce    "nonce-value"
                                                     :redirect "/dashboard"
                                                     :provider :slack-connect
                                                     :ttl-ms   300000}) ; 5 min
            after     (now-ms)]
        ;; expires-at should be ~5 minutes from created-at
        (is (>= (:expires-at state-map) (+ before 300000)))
        (is (<= (:expires-at state-map) (+ after 300000)))))

    (testing "converts provider keyword to string"
      (let [state-map (oidc.state/create-oidc-state {:state    "csrf-token"
                                                     :nonce    "nonce-value"
                                                     :redirect "/dashboard"
                                                     :provider :my-provider})]
        (is (= "my-provider" (:provider state-map)))))

    (testing "accepts same-origin absolute redirect URL"
      (let [state-map (oidc.state/create-oidc-state {:state    "csrf-token"
                                                     :nonce    "nonce-value"
                                                     :redirect "https://metabase.example.com/dashboard"
                                                     :provider :slack-connect})]
        (is (= "https://metabase.example.com/dashboard" (:redirect state-map)))))

    (testing "throws on missing required fields"
      (is (thrown? AssertionError
                   (oidc.state/create-oidc-state {:nonce    "nonce"
                                                  :redirect "/"
                                                  :provider :test})))
      (is (thrown? AssertionError
                   (oidc.state/create-oidc-state {:state    "state"
                                                  :redirect "/"
                                                  :provider :test})))
      (is (thrown? AssertionError
                   (oidc.state/create-oidc-state {:state    "state"
                                                  :nonce    "nonce"
                                                  :provider :test})))
      (is (thrown? AssertionError
                   (oidc.state/create-oidc-state {:state    "state"
                                                  :nonce    "nonce"
                                                  :redirect "/"}))))))

(deftest create-oidc-state-rejects-invalid-redirects-test
  (with-site-url! "https://metabase.example.com"
    (testing "throws on external redirect URL (open redirect protection)"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid redirect URL"
           (oidc.state/create-oidc-state {:state    "csrf-token"
                                          :nonce    "nonce-value"
                                          :redirect "https://evil.com/steal-session"
                                          :provider :slack-connect}))))

    (testing "throws on protocol-relative URL"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid redirect URL"
           (oidc.state/create-oidc-state {:state    "csrf-token"
                                          :nonce    "nonce-value"
                                          :redirect "//evil.com/path"
                                          :provider :slack-connect}))))

    (testing "throws on different subdomain"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid redirect URL"
           (oidc.state/create-oidc-state {:state    "csrf-token"
                                          :nonce    "nonce-value"
                                          :redirect "https://other.example.com/path"
                                          :provider :slack-connect}))))

    (testing "throws on javascript: URL"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Invalid redirect URL"
           (oidc.state/create-oidc-state {:state    "csrf-token"
                                          :nonce    "nonce-value"
                                          :redirect "javascript:alert(document.cookie)"
                                          :provider :slack-connect}))))))

;;; -------------------------------------------------- Encryption Tests --------------------------------------------------

(deftest encrypt-decrypt-roundtrip-test
  (with-test-encryption!
    (testing "encrypts and decrypts successfully"
      (let [original   {:state      "csrf-token"
                        :nonce      "nonce-value"
                        :redirect   "/dashboard"
                        :provider   "slack-connect"
                        :created-at 1704412800000
                        :expires-at (+ (now-ms) 600000)}
            encrypted  (oidc.state/encrypt-state original)
            decrypted  (oidc.state/decrypt-state encrypted)]
        (is (string? encrypted))
        (is (not= (pr-str original) encrypted))
        (is (= original decrypted))))

    (testing "encrypted output is URL-safe base64"
      (let [state-map {:state      "csrf-token"
                       :nonce      "nonce-value"
                       :redirect   "/dashboard"
                       :provider   "slack-connect"
                       :created-at 1704412800000
                       :expires-at (+ (now-ms) 600000)}
            encrypted (oidc.state/encrypt-state state-map)]
        ;; Base64 characters only (with possible padding)
        (is (re-matches #"[A-Za-z0-9+/=]+" encrypted))))))

(deftest encrypt-state-requires-encryption-test
  (without-encryption!
   (testing "throws exception when encryption not enabled"
     (is (thrown-with-msg?
          clojure.lang.ExceptionInfo
          #"MB_ENCRYPTION_SECRET_KEY"
          (oidc.state/encrypt-state {:state      "csrf"
                                     :nonce      "nonce"
                                     :redirect   "/"
                                     :provider   "test"
                                     :created-at 1704412800000
                                     :expires-at 1704413400000}))))))

(deftest decrypt-state-expired-test
  (with-test-encryption!
    (testing "returns nil for expired state"
      (let [state-map {:state      "csrf-token"
                       :nonce      "nonce-value"
                       :redirect   "/dashboard"
                       :provider   "slack-connect"
                       :created-at 1704412800000
                       :expires-at (- (now-ms) 1000)}
            encrypted (oidc.state/encrypt-state state-map)]
        (is (nil? (oidc.state/decrypt-state encrypted)))))))

(deftest decrypt-state-tampered-test
  (with-test-encryption!
    (testing "returns nil for tampered ciphertext"
      (let [state-map {:state      "csrf-token"
                       :nonce      "nonce-value"
                       :redirect   "/dashboard"
                       :provider   "slack-connect"
                       :created-at 1704412800000
                       :expires-at (+ (now-ms) 600000)}
            encrypted (oidc.state/encrypt-state state-map)
            ;; Tamper with the middle of the encrypted string
            tampered  (str (subs encrypted 0 10) "XXXXX" (subs encrypted 15))]
        (is (nil? (oidc.state/decrypt-state tampered)))))))

(deftest decrypt-state-nil-input-test
  (with-test-encryption!
    (testing "returns nil for nil input"
      (is (nil? (oidc.state/decrypt-state nil))))))

(deftest decrypt-state-browser-id-validation-test
  (with-test-encryption!
    (testing "validates browser-id when requested"
      (let [state-map {:state      "csrf-token"
                       :nonce      "nonce-value"
                       :redirect   "/dashboard"
                       :provider   "slack-connect"
                       :created-at 1704412800000
                       :expires-at (+ (now-ms) 600000)
                       :browser-id "correct-device"}
            encrypted (oidc.state/encrypt-state state-map)]
        ;; Correct browser-id passes
        (is (some? (oidc.state/decrypt-state encrypted {:validate-browser-id "correct-device"})))
        ;; Wrong browser-id fails
        (is (nil? (oidc.state/decrypt-state encrypted {:validate-browser-id "wrong-device"})))
        ;; No validation passes
        (is (some? (oidc.state/decrypt-state encrypted)))))))

;;; -------------------------------------------------- Cookie Management Tests --------------------------------------------------

(deftest set-and-get-oidc-state-cookie-test
  (with-site-url! "https://metabase.example.com"
    (with-test-encryption!
      (testing "sets and retrieves state via cookies"
        (let [request    {:scheme :https}
              state-data {:state    "csrf-token"
                          :nonce    "nonce-value"
                          :redirect "/dashboard"
                          :provider :slack-connect}
              response   (oidc.state/set-oidc-state-cookie {} request state-data)
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              ;; Simulate the request coming back with the cookie
              callback-request {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}
              retrieved  (oidc.state/get-oidc-state callback-request)]
          (is (string? cookie-val))
          (is (= "csrf-token" (:state retrieved)))
          (is (= "nonce-value" (:nonce retrieved)))
          (is (= "/dashboard" (:redirect retrieved)))
          (is (= "slack-connect" (:provider retrieved))))))

    (with-test-encryption!
      (testing "sets correct cookie attributes for HTTPS"
        (let [request  {:scheme :https}
              response (oidc.state/set-oidc-state-cookie {} request {:state    "s"
                                                                     :nonce    "n"
                                                                     :redirect "/"
                                                                     :provider :test})
              cookie   (get-in response [:cookies "metabase.OIDC_STATE"])]
          (is (true? (:http-only cookie)))
          (is (true? (:secure cookie)))
          (is (= :lax (:same-site cookie)))
          (is (= "/" (:path cookie)))
          (is (= 600 (:max-age cookie)))))) ; Default 10 minutes

    (with-test-encryption!
      (testing "sets correct cookie attributes for HTTP"
        (let [request  {:scheme :http}
              response (oidc.state/set-oidc-state-cookie {} request {:state    "s"
                                                                     :nonce    "n"
                                                                     :redirect "/"
                                                                     :provider :test})
              cookie   (get-in response [:cookies "metabase.OIDC_STATE"])]
          (is (true? (:http-only cookie)))
          (is (nil? (:secure cookie)))
          (is (= :lax (:same-site cookie))))))))

(deftest get-oidc-state-provider-validation-test
  (with-site-url! "https://metabase.example.com"
    (with-test-encryption!
      (testing "validates expected provider"
        (let [request    {:scheme :https}
              response   (oidc.state/set-oidc-state-cookie {} request {:state    "csrf"
                                                                       :nonce    "nonce"
                                                                       :redirect "/"
                                                                       :provider :slack-connect})
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              callback   {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}]
          ;; Correct provider passes
          (is (some? (oidc.state/get-oidc-state callback {:expected-provider :slack-connect})))
          ;; Wrong provider fails
          (is (nil? (oidc.state/get-oidc-state callback {:expected-provider :other-provider})))
          ;; No provider validation passes
          (is (some? (oidc.state/get-oidc-state callback))))))))

(deftest clear-oidc-state-cookie-test
  (testing "clears the cookie"
    (let [response (oidc.state/clear-oidc-state-cookie {})
          cookie   (get-in response [:cookies "metabase.OIDC_STATE"])]
      (is (= "" (:value cookie)))
      (is (= 0 (:max-age cookie))))))

;;; -------------------------------------------------- High-Level Integration Tests --------------------------------------------------

(deftest wrap-oidc-redirect-test
  (with-site-url! "https://metabase.example.com"
    (with-test-encryption!
      (testing "creates redirect response with state cookie"
        (let [auth-result {:redirect-url "https://slack.com/oauth/authorize?..."
                           :state        "generated-state"
                           :nonce        "generated-nonce"}
              request     {:scheme :https}
              response    (oidc.state/wrap-oidc-redirect auth-result
                                                         request
                                                         :slack-connect
                                                         "/final-redirect")]
          ;; Should be a redirect response
          (is (= 302 (:status response)))
          (is (= "https://slack.com/oauth/authorize?..." (get-in response [:headers "Location"])))
          ;; Should have state cookie
          (is (string? (get-in response [:cookies "metabase.OIDC_STATE" :value]))))))

    (with-test-encryption!
      (testing "rejects external redirect URL (open redirect protection)"
        (let [auth-result {:redirect-url "https://slack.com/oauth/authorize?..."
                           :state        "generated-state"
                           :nonce        "generated-nonce"}
              request     {:scheme :https}]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Invalid redirect URL"
               (oidc.state/wrap-oidc-redirect auth-result
                                              request
                                              :slack-connect
                                              "https://evil.com/steal-session"))))))))

(deftest validate-oidc-callback-test
  (with-site-url! "https://metabase.example.com"
    (with-test-encryption!
      (testing "validates matching state"
        (let [request    {:scheme :https}
              response   (oidc.state/set-oidc-state-cookie {} request {:state    "correct-state"
                                                                       :nonce    "test-nonce"
                                                                       :redirect "/dashboard"
                                                                       :provider :slack-connect})
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              callback   {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}
              result     (oidc.state/validate-oidc-callback callback "correct-state" :slack-connect)]
          (is (true? (:valid? result)))
          (is (= "test-nonce" (:nonce result)))
          (is (= "/dashboard" (:redirect result)))))

      (testing "rejects mismatched state (CSRF protection)"
        (let [request    {:scheme :https}
              response   (oidc.state/set-oidc-state-cookie {} request {:state    "correct-state"
                                                                       :nonce    "test-nonce"
                                                                       :redirect "/dashboard"
                                                                       :provider :slack-connect})
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              callback   {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}
              result     (oidc.state/validate-oidc-callback callback "wrong-state" :slack-connect)]
          (is (false? (:valid? result)))
          (is (= :state-mismatch (:error result)))))

      (testing "rejects wrong provider"
        (let [request    {:scheme :https}
              response   (oidc.state/set-oidc-state-cookie {} request {:state    "state"
                                                                       :nonce    "nonce"
                                                                       :redirect "/"
                                                                       :provider :slack-connect})
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              callback   {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}
              result     (oidc.state/validate-oidc-callback callback "state" :other-provider)]
          (is (false? (:valid? result)))
          (is (= :invalid-or-expired-state (:error result)))))

      (testing "rejects missing cookie"
        (let [result (oidc.state/validate-oidc-callback {:cookies {}} "state" :slack-connect)]
          (is (false? (:valid? result)))
          (is (= :invalid-or-expired-state (:error result))))))))

(deftest validate-oidc-callback-browser-id-test
  (with-site-url! "https://metabase.example.com"
    (with-test-encryption!
      (testing "validates browser-id when requested"
        (let [request    {:scheme :https}
              response   (oidc.state/set-oidc-state-cookie {} request
                                                           {:state    "state"
                                                            :nonce    "nonce"
                                                            :redirect "/"
                                                            :provider :test}
                                                           {:browser-id "device-123"})
              cookie-val (get-in response [:cookies "metabase.OIDC_STATE" :value])
              callback   {:cookies {"metabase.OIDC_STATE" {:value cookie-val}}}]
          ;; Correct browser-id passes
          (is (:valid? (oidc.state/validate-oidc-callback callback "state" :test
                                                          {:validate-browser-id "device-123"})))
          ;; Wrong browser-id fails
          (is (not (:valid? (oidc.state/validate-oidc-callback callback "state" :test
                                                               {:validate-browser-id "wrong-device"})))))))))
