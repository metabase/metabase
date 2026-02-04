(ns metabase-enterprise.metabot-v3.api.slackbot-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.slackbot :as slackbot]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(def ^:private test-signing-secret "test-signing-secret")
(def ^:private test-encryption-key (byte-array (repeat 64 42)))

(defmacro with-slackbot-setup
  "Wrap body with all required settings for slackbot to be fully configured."
  [& body]
  `(with-redefs [slackbot/validate-bot-token! (constantly {:ok true})
                 encryption/default-secret-key test-encryption-key]
     (mt/with-premium-features #{:metabot-v3 :sso-slack}
       (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret test-signing-secret
                                          metabot.settings/metabot-slack-bot-token "xoxb-test"
                                          sso-settings/slack-connect-client-id "test-client-id"
                                          sso-settings/slack-connect-client-secret "test-secret"]
         ~@body))))

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
      (mt/with-temporary-setting-values [site-url "https://localhost:3000"]
        (testing "with site-url configured"
          (testing "admins can access manifest"
            (let [response (mt/user-http-request :crowberto :get 200 "ee/metabot-v3/slack/manifest")]
              (is (map? response))
              (is (contains? response :display_information))
              (is (contains? response :features))
              (is (contains? response :oauth_config))
              (is (contains? response :settings))))
          (testing "non-admins cannot access manifest"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "ee/metabot-v3/slack/manifest"))))))
      (mt/with-temporary-setting-values [site-url nil]
        (testing "without site-url configured"
          (testing "raises a 503 error"
            (is (= "You must configure a site-url for Slack integration to work."
                   (mt/user-http-request :crowberto :get 503 "ee/metabot-v3/slack/manifest")))))))))

(deftest events-endpoint-test
  (testing "POST /api/ee/metabot-v3/slack/events"
    (with-slackbot-setup
      (testing "handles URL verification challenge"
        (let [body {:type "url_verification"
                    :token "Jhj5dZrVaK7ZwHHjRyZWbDl"
                    :challenge "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"}
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" response))))

      (testing "handles regular events without challenge"
        (let [body {:type "event_callback"
                    :event {:text "hi"}}
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
                           :challenge "test"})))))))

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

(defn- with-slackbot-mocks
  "Helper to set up common mocks for slackbot tests.
   Options:
   - :ai-text - The text response from make-ai-request
   - :data-parts - The data-parts returned from make-ai-request (default [])
   - :user-id - The user ID returned by slack-id->user-id. If not provided, defaults to rasta.
                Pass ::no-user to simulate an unlinked Slack user (returns nil).

   Calls body-fn with a map containing tracking atoms:
   {:post-calls, :delete-calls, :image-calls, :generate-png-calls, :ephemeral-calls, :fake-png-bytes}"
  [{:keys [ai-text data-parts user-id]
    :or {data-parts []
         user-id ::default}}
   body-fn]
  (let [post-calls (atom [])
        delete-calls (atom [])
        image-calls (atom [])
        generate-png-calls (atom [])
        ephemeral-calls (atom [])
        fake-png-bytes (byte-array [0x89 0x50 0x4E 0x47])
        mock-user-id (cond
                       (= user-id ::default) (mt/user->id :rasta)
                       (= user-id ::no-user) nil
                       :else user-id)]
    (mt/with-dynamic-fn-redefs
      [slackbot/slack-id->user-id (constantly mock-user-id)
       slackbot/fetch-thread (constantly {:ok true, :messages []})
       slackbot/post-message (fn [_ msg]
                               (swap! post-calls conj msg)
                               {:ok true
                                :ts "123"
                                :channel (:channel msg)
                                :message msg})
       slackbot/post-ephemeral-message (fn [_ msg]
                                         (swap! ephemeral-calls conj msg)
                                         {:ok true, :message_ts "1234567890.123456"})
       slackbot/delete-message (fn [_ msg]
                                 (swap! delete-calls conj msg)
                                 {:ok true})
       slackbot/make-ai-request (constantly {:text ai-text :data-parts data-parts})
       slackbot/generate-card-png (fn [card-id & _opts]
                                    (swap! generate-png-calls conj card-id)
                                    fake-png-bytes)
       slackbot/post-image (fn [_client image-bytes filename channel thread-ts]
                             (swap! image-calls conj {:image-bytes image-bytes
                                                      :filename filename
                                                      :channel channel
                                                      :thread-ts thread-ts})
                             {:ok true :file_id "F123"})]
      (body-fn {:post-calls post-calls
                :delete-calls delete-calls
                :image-calls image-calls
                :generate-png-calls generate-png-calls
                :ephemeral-calls ephemeral-calls
                :fake-png-bytes fake-png-bytes}))))

(deftest user-message-triggers-response-test
  (testing "POST /events with user message triggers AI response via Slack"
    (with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Hello!"
                                :user "U123"
                                :channel "C123"
                                :ts "1234567890.000001"}}]
        (with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [post-calls delete-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk #(>= (count @post-calls) 2)
                       :done? true?
                       :timeout-ms 5000})
              (is (= "_Thinking..._" (:text (first @post-calls))))
              (is (= mock-ai-text (:text (second @post-calls))))
              (is (= 1 (count @delete-calls)))
              (is (= "_Thinking..._" (get-in (first @delete-calls) [:message :text]))))))))))

(deftest user-message-with-visualizations-test
  (testing "POST /events with visualizations uploads multiple images to Slack"
    (with-slackbot-setup
      (let [mock-ai-text "Here are your charts"
            ;; Multiple static_viz data parts
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "static_viz" :value {:entity_id 202}}
                             ;; Include a non-viz data part to verify filtering
                             {:type "other_type" :value {:foo "bar"}}]
            event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Show me charts"
                                :user "U123"
                                :channel "C456"
                                :ts "1234567890.000002"
                                :thread_ts "1234567890.000000"}}]
        (with-slackbot-mocks
          {:ai-text mock-ai-text
           :data-parts mock-data-parts}
          (fn [{:keys [post-calls delete-calls image-calls generate-png-calls fake-png-bytes]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))

              ;; Wait for text messages AND image uploads
              (u/poll {:thunk #(and (>= (count @post-calls) 2)
                                    (>= (count @image-calls) 2))
                       :done? true?
                       :timeout-ms 5000})

              (testing "text message flow works"
                (is (= "_Thinking..._" (:text (first @post-calls))))
                (is (= mock-ai-text (:text (second @post-calls))))
                (is (= 1 (count @delete-calls))))

              (testing "PNG generation called for each static_viz"
                (is (= 2 (count @generate-png-calls)))
                (is (= #{101 202} (set @generate-png-calls))))

              (testing "images uploaded with correct parameters"
                (is (= 2 (count @image-calls)))
                ;; Check channel and thread
                (is (every? #(= "C456" (:channel %)) @image-calls))
                (is (every? #(= "1234567890.000000" (:thread-ts %)) @image-calls))
                ;; Check filenames
                (is (= #{"chart-101.png" "chart-202.png"}
                       (set (map :filename @image-calls))))
                ;; Check image bytes match fake PNG
                (is (every? #(= (vec fake-png-bytes) (vec (:image-bytes %)))
                            @image-calls))))))))))

(deftest user-not-linked-sends-auth-message-test
  (testing "POST /events with unlinked user sends ephemeral auth message"
    (with-slackbot-setup
      (let [event-body {:type "event_callback"
                        :event {:type "message"
                                :text "Hello!"
                                :user "U-UNKNOWN-USER"
                                :channel "C123"
                                :ts "1234567890.000001"}}]
        (with-slackbot-mocks
          {:ai-text "Should not be called"
           :user-id ::no-user} ;; Simulate no linked user
          (fn [{:keys [post-calls ephemeral-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Wait for ephemeral message
              (u/poll {:thunk #(= 1 (count @ephemeral-calls))
                       :done? true?
                       :timeout-ms 5000})
              (testing "no regular messages should be posted"
                (is (= 0 (count @post-calls))))
              (testing "ephemeral auth message sent to user"
                (is (=? [{:user "U-UNKNOWN-USER"
                          :channel "C123"
                          :text #".*link your slack account.*"}]
                        @ephemeral-calls))))))))))

;; -------------------------------- Setup Complete Tests --------------------------------

(defn- do-with-setup-override
  "Helper to test setup-complete? with one setting disabled.
   `override` is a map that can contain:
   - :encryption - set to nil to disable encryption
   - :sso-slack - set to false to disable sso-slack feature
   - :signing-secret, :bot-token, :client-id, :client-secret - set to nil to disable"
  [{:keys [encryption sso-slack signing-secret bot-token client-id client-secret]
    :or {encryption test-encryption-key
         sso-slack true
         signing-secret test-signing-secret
         bot-token "xoxb-test"
         client-id "test-client-id"
         client-secret "test-secret"}}
   thunk]
  (with-redefs [slackbot/validate-bot-token! (constantly {:ok true})
                encryption/default-secret-key encryption
                premium-features/enable-sso-slack? (constantly sso-slack)]
    (mt/with-premium-features #{:metabot-v3 :sso-slack}
      (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret signing-secret
                                         metabot.settings/metabot-slack-bot-token bot-token
                                         sso-settings/slack-connect-client-id client-id
                                         sso-settings/slack-connect-client-secret client-secret]
        (thunk)))))

(deftest setup-complete-test
  (let [request-body {:type "url_verification" :challenge "test-challenge"}
        post-events  #(mt/client :post %1 "ee/metabot-v3/slack/events"
                                 (slack-request-options request-body) request-body)]
    (testing "succeeds when all settings are configured"
      (do-with-setup-override {}
                              #(is (= "test-challenge" (post-events 200)))))

    (doseq [[desc override] [["sso-slack feature disabled"    {:sso-slack false}]
                             ["client-id missing"             {:client-id nil}]
                             ["client-secret missing"         {:client-secret nil}]
                             ["bot-token missing"             {:bot-token nil}]
                             ["encryption disabled"           {:encryption nil}]]]
      (testing (str "returns 503 when " desc)
        (do-with-setup-override override
                                #(is (= "Slack integration is not fully configured." (post-events 503))))))

    (testing "returns 503 when signing-secret is missing (can't sign request)"
      (do-with-setup-override {:signing-secret nil}
                              #(is (= "Slack integration is not fully configured."
                                      (mt/client :post 503 "ee/metabot-v3/slack/events" request-body)))))))
