(ns metabase-enterprise.metabot-v3.middleware.auth-test
  "EE-specific tests for auth middleware, particularly Slack signature verification."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.test :as mt]
   [ring.mock.request :as ring.mock]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ TEST verify-slack-request middleware ------------------------------------------

(def ^:private test-signing-secret "test-slack-signing-secret-12345")

(defn- compute-slack-signature
  "Compute a valid Slack signature for testing"
  [body timestamp signing-secret]
  (let [message   (str "v0:" timestamp ":" body)
        signature (-> (mac/hash message {:key signing-secret :alg :hmac+sha256})
                      codecs/bytes->hex)]
    (str "v0=" signature)))

(defn- wrapped-slack-handler
  "Invoke verify-slack-request middleware and return the modified request"
  [request]
  ((mw.auth/verify-slack-request
    (fn [request respond _] (respond request)))
   request
   identity
   (fn [e] (throw e))))

(defn- slack-request
  "Create a mock request with Slack signature headers and a body"
  ^java.util.Map [^String body ^String timestamp ^String signature]
  (-> (ring.mock/request :post "/anyurl")
      (ring.mock/header "x-slack-signature" signature)
      (ring.mock/header "x-slack-request-timestamp" timestamp)
      (assoc :body (java.io.ByteArrayInputStream. (.getBytes body "UTF-8")))))

(deftest verify-slack-request-test
  (mt/with-premium-features #{:metabot-v3}
    (testing "Valid signature w/ signing secret configured"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret]
        (let [body      "test-body"
              timestamp "1234567890"
              signature (compute-slack-signature body timestamp test-signing-secret)
              result    (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (true? (:slack/validated? result))))))

    (testing "Invalid signature"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret]
        (let [body      "test-body"
              timestamp "1234567890"
              signature "v0=invalid-signature"
              result    (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (false? (:slack/validated? result))))))

    (testing "No signature header present - request passes through unchanged"
      (let [body    "test-body"
            request (-> (ring.mock/request :post "/anyurl")
                        (assoc :body (java.io.ByteArrayInputStream. (.getBytes ^String body "UTF-8"))))
            result  (wrapped-slack-handler request)]
        (is (not (contains? result :slack/validated?)))))

    (testing "No signing secret configured"
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret nil]
        (let [body      "test-body"
              timestamp "1234567890"
              signature "v0=some-signature"
              result    (wrapped-slack-handler (slack-request body timestamp signature))]
          (is (nil? (:slack/validated? result))))))))
