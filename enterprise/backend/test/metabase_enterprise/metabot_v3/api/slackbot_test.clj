(ns metabase-enterprise.metabot-v3.api.slackbot-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.slackbot :as slackbot]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(def ^:private test-signing-secret "test-slack-signing-secret-12345")

(defn- compute-slack-signature
  "Compute a valid Slack signature for testing"
  [body timestamp]
  (let [message (str "v0:" timestamp ":" body)
        signature (-> (mac/hash message {:key test-signing-secret :alg :hmac+sha256})
                      codecs/bytes->hex)]
    (str "v0=" signature)))

(defn- slack-request-options
  "Build request options with valid Slack signature headers"
  [body]
  (let [timestamp (str (quot (System/currentTimeMillis) 1000))
        body-str (json/encode body)
        signature (compute-slack-signature body-str timestamp)]
    {:request-options {:headers {"x-slack-signature" signature
                                 "x-slack-request-timestamp" timestamp}}}))

(deftest manifest-endpoint-test
  (testing "GET /api/ee/metabot-v3/slack/manifest"
    (mt/with-premium-features #{:metabot-v3}
      (testing "admins can access manifest"
        (let [response (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/slack/manifest")]
          (is (map? response))
          (is (contains? response :display_information))
          (is (contains? response :features))
          (is (contains? response :oauth_config))
          (is (contains? response :settings))))

      (testing "non-admins cannot access manifest"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "ee/metabot-v3/slack/manifest")))))))

(deftest events-endpoint-test
  (testing "POST /api/ee/metabot-v3/slack/events"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret]
        (testing "handles URL verification challenge"
          (let [body {:type "url_verification"
                      :token "Jhj5dZrVaK7ZwHHjRyZWbDl"
                      :challenge "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"}
                response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                    (slack-request-options body)
                                    body)]
            (is (= "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" response))))

        (testing "handles regular events without challenge"
          (let [body {:type "event_callback"}
                response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                    (slack-request-options body)
                                    body)]
            ;; endpoint returns ack-msg with body "ok" for event_callback
            (is (= "ok" response))))

        (testing "rejects requests without valid signature"
          (is (= "Slack request signature is not valid."
                 (mt/client :post 401 "ee/metabot-v3/slack/events"
                            {:request-options {:headers {"x-slack-signature" "v0=invalid"
                                                         "x-slack-request-timestamp" "1234567890"}}}
                            {:type "url_verification"
                             :challenge "test"}))))))))

(deftest feature-flag-test
  (testing "Endpoints require metabot-v3 premium feature"
    (mt/with-premium-features #{}
      (testing "GET /api/ee/metabot-v3/slack/manifest"
        (mt/assert-has-premium-feature-error "MetaBot"
                                             (mt/user-http-request :crowberto :get 402 "ee/metabot-v3/slack/manifest")))
      (testing "POST /api/ee/metabot-v3/slack/events"
        (mt/assert-has-premium-feature-error "MetaBot"
                                             (mt/client :post 402 "ee/metabot-v3/slack/events"
                                                        {:type "url_verification"
                                                         :challenge "test"}))))))

(deftest user-message-triggers-response-test
  (testing "POST /events with user message triggers AI response via Slack"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret
                                         metabot.settings/metabot-slack-bot-token "test-token"]
        (let [post-calls (atom [])
              delete-calls (atom [])
              mock-ai-text "Here is your answer"
              event-body {:type "event_callback"
                          :event {:type "message"
                                  :text "Hello!"
                                  :user "U123"
                                  :channel "C123"
                                  :ts "1234567890.000001"}}]
          (mt/with-dynamic-fn-redefs
            [slackbot/fetch-thread (constantly {:ok true :messages []})
             slackbot/post-message (fn [_ msg]
                                     (swap! post-calls conj msg)
                                     {:ok true :ts "123" :channel (:channel msg) :message msg})
             slackbot/delete-message (fn [_ msg]
                                       (swap! delete-calls conj msg)
                                       {:ok true})
             slackbot/make-ai-request (constantly {:text mock-ai-text :data-parts []})]

            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              ;; Immediate ack
              (is (= "ok" response))

              ;; Wait for async processing
              (u/poll {:thunk #(>= (count @post-calls) 2)
                       :done? true?
                       :timeout-ms 5000})

              ;; Verify calls
              (is (= "_Thinking..._" (:text (first @post-calls))))
              (is (= mock-ai-text (:text (second @post-calls))))
              (is (= 1 (count @delete-calls)))
              (is (= "_Thinking..._" (get-in (first @delete-calls) [:message :text]))))))))))
