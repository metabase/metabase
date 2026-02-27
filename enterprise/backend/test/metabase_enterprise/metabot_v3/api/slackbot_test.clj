(ns metabase-enterprise.metabot-v3.api.slackbot-test
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.mac :as mac]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.metabot-v3.api.slackbot :as slackbot]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase-enterprise.metabot-v3.api.slackbot.config :as slackbot.config]
   [metabase-enterprise.metabot-v3.api.slackbot.query :as slackbot.query]
   [metabase-enterprise.metabot-v3.api.slackbot.streaming :as slackbot.streaming]
   [metabase-enterprise.metabot-v3.api.slackbot.uploads :as slackbot.uploads]
   [metabase-enterprise.metabot-v3.client :as metabot-v3.client]
   [metabase-enterprise.metabot-v3.settings :as metabot.settings]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.channel.settings :as channel.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.server.middleware.auth :as mw.auth]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.upload.db :as upload.db]
   [metabase.upload.impl :as upload.impl]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-signing-secret "test-signing-secret")
(def ^:private test-encryption-key (byte-array (repeat 64 42)))

(def ^:private base-dm-event
  {:type  "event_callback"
   :event {:type         "message"
           :text         "Hello!"
           :user         "U123"
           :channel      "C123"
           :ts           "1234567890.000001"
           :event_ts     "1234567890.000001"
           :channel_type "im"}})

(def ^:private base-mention-event
  {:type  "event_callback"
   :event {:type     "app_mention"
           :text     "<@UBOT123> Hello!"
           :user     "U123"
           :channel  "C123"
           :ts       "1234567890.000001"
           :event_ts "1234567890.000001"}})

(def ^:private slack-csv-file
  "A Slack CSV file upload for testing. Tests can use merge/assoc to customize."
  {:id          "F123"
   :name        "data.csv"
   :filetype    "csv"
   :url_private "https://files.slack.com/files/data.csv"
   :size        100})

(defmacro ^:private with-ensure-encryption
  "Use the existing encryption key if one is configured, otherwise set a test key.
   Avoids conflicts with encrypted settings in the DB that were written with the real key."
  [& body]
  `(if (encryption/default-encryption-enabled?)
     (do ~@body)
     (with-redefs [encryption/default-secret-key test-encryption-key]
       ~@body)))

(defmacro ^:private with-slackbot-setup
  "Wrap body with all required settings for slackbot to be fully configured.
   Uses `with-temporary-raw-setting-values` for secrets whose getters mask the value,
   since `with-temporary-setting-values` would save and restore the masked value."
  [& body]
  `(with-redefs [slackbot.config/validate-bot-token! (constantly {:ok true})
                 slackbot.client/get-bot-user-id     (constantly "UBOT123")]
     (with-ensure-encryption
       (mt/with-premium-features #{:metabot-v3 :sso-slack}
         (mt/with-temporary-setting-values [site-url "https://localhost:3000"
                                            sso-settings/slack-connect-client-id "test-client-id"
                                            sso-settings/slack-connect-enabled true]
           (mt/with-temporary-raw-setting-values [metabot-slack-signing-secret test-signing-secret
                                                  slack-app-token "xoxb-test"
                                                  slack-connect-client-secret "test-secret"]
             ~@body))))))

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
  (testing "GET /api/slack/manifest with metabot-v3 feature"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temporary-setting-values [site-url "https://localhost:3000"]
        (testing "with site-url configured"
          (testing "admins can access manifest"
            (let [response (mt/user-http-request :crowberto :get 200 "slack/manifest")]
              (is (map? response))
              (is (contains? response :display_information))
              (is (contains? response :features))
              (is (contains? response :oauth_config))
              (is (contains? response :settings))))
          (testing "non-admins cannot access manifest"
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :get 403 "slack/manifest"))))))
      (mt/with-temporary-setting-values [site-url nil]
        (testing "without site-url configured"
          (testing "raises a 503 error"
            (is (= "You must configure a site-url for Slack integration to work."
                   (mt/user-http-request :crowberto :get 503 "slack/manifest")))))))))

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

      (testing "handles 'unknown' events with ack message"
        (let [body {:type "event_callback"
                    :event {:type "team_rename"
                            :event_ts "1234567890.000001"}}
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "handles message.im events"
        (let [body     (-> base-dm-event
                           (assoc-in [:event :channel] "D123")
                           (assoc-in [:event :text] "Hello from DM"))
              response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                  (slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "rejects requests without valid signature"
        (is (= "Slack request signature is not valid."
               (mt/client :post 401 "ee/metabot-v3/slack/events"
                          {:request-options {:headers {"x-slack-signature" "v0=invalid"
                                                       "x-slack-request-timestamp" "1234567890"}}}
                          {:type "url_verification"
                           :challenge "test"})))))))

(deftest feature-flag-test
  (testing "POST /api/ee/metabot-v3/slack/events"
    (testing "ack events even when metabot-v3 feature is disabled to prevent Slack retries"
      ;; with-slackbot-setup enables #{:metabot-v3 :sso-slack}; the inner with-premium-features
      ;; overrides that to only #{:sso-slack}, verifying we still ACK when :metabot-v3 is absent.
      (with-slackbot-setup
        (with-redefs [mw.auth/metabot-slack-signing-secret-setting (constantly test-signing-secret)]
          (mt/with-premium-features #{:sso-slack}
            (let [body     (assoc-in base-dm-event [:event :channel] "D123")
                  response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options body)
                                      body)]
              (is (= "ok" response) "Should ACK the event with 200 OK"))))))))

(defn- with-slackbot-mocks
  "Helper to set up common mocks for slackbot tests.
   Options:
   - :ai-text - The text response from make-ai-request
   - :data-parts - The data-parts returned from make-ai-request (default [])
   - :user-id - The user ID returned by slack-id->user-id. If not provided, defaults to rasta.
                Pass ::no-user to simulate an unlinked Slack user (returns nil).

   Calls body-fn with a map containing tracking atoms:
   {:post-calls, :delete-calls, :image-calls, :generate-png-calls, :generate-adhoc-png-calls,
    :generate-card-output-calls, :generate-adhoc-output-calls, :ephemeral-calls,
    :ai-request-calls, :fake-png-bytes, :stream-calls, :append-text-calls, :stop-stream-calls}"
  [{:keys [ai-text data-parts user-id]
    :or   {data-parts []
           user-id    ::default}}
   body-fn]
  (let [post-calls                  (atom [])
        delete-calls                (atom [])
        image-calls                 (atom [])
        generate-png-calls          (atom [])
        generate-adhoc-png-calls    (atom [])
        generate-card-output-calls  (atom [])
        generate-adhoc-output-calls (atom [])
        ephemeral-calls             (atom [])
        ai-request-calls            (atom [])
        stream-calls                (atom [])
        append-text-calls           (atom [])
        stop-stream-calls           (atom [])
        fake-png-bytes              (byte-array [0x89 0x50 0x4E 0x47])
        mock-user-id                (cond
                                      (= user-id ::default) (mt/user->id :rasta)
                                      (= user-id ::no-user) nil
                                      :else user-id)]
    (mt/with-dynamic-fn-redefs
      [slackbot/slack-id->user-id (constantly mock-user-id)
       slackbot.client/get-bot-user-id (constantly "UBOT123")
       slackbot.client/auth-test            (constantly {:ok true :user_id "UBOT123" :team_id "T123"})
       slackbot.client/fetch-thread         (constantly {:ok true, :messages []})
       ;; Mock Slack streaming APIs
       slackbot.client/start-stream         (fn [_ opts]
                                              (swap! stream-calls conj opts)
                                              {:stream_ts "stream123" :channel (:channel opts) :thread_ts (:thread_ts opts)})
       slackbot.client/append-stream        (constantly {:ok true})
       slackbot.client/append-markdown-text (fn [_ _channel _stream-ts text]
                                              (swap! append-text-calls conj text)
                                              {:ok true})
       slackbot.client/stop-stream          (fn [_ channel stream-ts]
                                              (swap! stop-stream-calls conj {:channel channel :stream_ts stream-ts})
                                              {:ok true})
       slackbot.client/post-message (fn [_ msg]
                                      (swap! post-calls conj msg)
                                      {:ok true
                                       :ts "123"
                                       :channel (:channel msg)
                                       :message msg})
       slackbot.client/post-ephemeral-message (fn [_ msg]
                                                (swap! ephemeral-calls conj msg)
                                                {:ok true, :message_ts "1234567890.123456"})
       slackbot.client/delete-message (fn [_ msg]
                                        (swap! delete-calls conj msg)
                                        {:ok true})
       ;; Mock the streaming client - returns AISDK-formatted lines
       metabot-v3.client/streaming-request-with-callback
       (fn [opts]
         (swap! ai-request-calls conj opts)
         ;; Generate AISDK-format lines from text and data-parts
         (let [text-lines (when ai-text [(str "0:" (json/encode ai-text))])
               data-lines (map #(str "2:" (json/encode %)) data-parts)
               mock-lines (vec (concat text-lines data-lines))]
           ;; Call on-line callback for each line if provided
           (when-let [on-line (:on-line opts)]
             (doseq [line mock-lines]
               (on-line line)))
           mock-lines))
       slackbot.query/generate-card-png        (fn [card-id & _opts]
                                                 (swap! generate-png-calls conj card-id)
                                                 fake-png-bytes)
       slackbot.query/generate-card-output     (fn [card-id]
                                                 (swap! generate-card-output-calls conj {:card-id card-id})
                                           ;; Mock returns image by default (simulating a chart card)
                                                 {:type :image :content fake-png-bytes})
       slackbot.query/generate-adhoc-output (fn [query & {:keys [display]}]
                                              (swap! generate-adhoc-output-calls conj {:query query :display display})
                                              ;; Chart display types return images, others return table
                                              (if (#{:bar :line :pie :area :row :scatter :funnel :waterfall :combo :progress :gauge :map} display)
                                                {:type :image :content fake-png-bytes}
                                                {:type :table :content [{:type "table" :rows [] :column_settings []}]}))
       slackbot.client/post-image               (fn [_client image-bytes filename channel thread-ts]
                                                  (swap! image-calls conj {:image-bytes image-bytes
                                                                           :filename    filename
                                                                           :channel     channel
                                                                           :thread-ts   thread-ts})
                                                  {:ok true :file_id "F123"})]
      (body-fn {:post-calls                  post-calls
                :delete-calls                delete-calls
                :image-calls                 image-calls
                :generate-png-calls          generate-png-calls
                :generate-adhoc-png-calls    generate-adhoc-png-calls
                :generate-card-output-calls  generate-card-output-calls
                :generate-adhoc-output-calls generate-adhoc-output-calls
                :ephemeral-calls             ephemeral-calls
                :ai-request-calls            ai-request-calls
                :stream-calls                stream-calls
                :append-text-calls           append-text-calls
                :stop-stream-calls           stop-stream-calls
                :fake-png-bytes              fake-png-bytes}))))

(deftest edited-message-ignored-test
  (testing "POST /events ignores edited messages"
    (with-slackbot-setup
      (doseq [[desc event-mod] [["with :edited key" {:edited {:user "U123" :ts "123"}}]
                                ["with message_changed subtype" {:subtype "message_changed"}]]]
        (testing desc
          (let [event-body (update base-dm-event :event merge {:text "Edited message"} event-mod)]
            (with-slackbot-mocks
              {:ai-text "Should not be called"}
              (fn [{:keys [post-calls ephemeral-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  ;; Brief wait to ensure no async processing starts
                  (Thread/sleep 200)
                  (is (= 0 (count @post-calls)))
                  (is (= 0 (count @ephemeral-calls))))))))))))

(deftest slackbot-disabled-setting-test
  (testing "POST /events acks but does not process when slack-connect-enabled is false"
    (with-slackbot-setup
      (mt/with-temporary-setting-values [sso-settings/slack-connect-enabled false]
        (doseq [[desc event-body]
                [["message.im event"  (assoc-in base-dm-event [:event :channel] "D123")]
                 ["app_mention event" base-mention-event]]]
          (testing desc
            (with-slackbot-mocks
              {:ai-text "Should not be called"}
              (fn [{:keys [post-calls delete-calls ephemeral-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  ;; Brief wait to ensure no async processing starts
                  (Thread/sleep 200)
                  (is (= 0 (count @post-calls)) "No messages should be posted")
                  (is (= 0 (count @delete-calls)) "No messages should be deleted")
                  (is (= 0 (count @ephemeral-calls)) "No ephemeral messages should be sent"))))))))))

(deftest user-message-triggers-response-test
  (testing "POST /events with user message triggers AI response via Slack streaming"
    (with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body   base-dm-event]
        (with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [stream-calls append-text-calls stop-stream-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Wait for streaming to complete
              (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                       :done? true?
                       :timeout-ms 5000})
              (testing "stream was started"
                (is (= 1 (count @stream-calls)))
                (is (= "C123" (:channel (first @stream-calls)))))
              (testing "AI response was streamed"
                (is (some #(= mock-ai-text %) @append-text-calls)))
              (testing "stream was stopped"
                (is (= 1 (count @stop-stream-calls)))))))))))

(deftest app-mention-triggers-response-test
  (testing "POST /events with app_mention triggers AI response via streaming"
    (with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body   base-mention-event]
        (with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [stream-calls append-text-calls stop-stream-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Wait for streaming to complete
              (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                       :done? true?
                       :timeout-ms 5000})
              (testing "stream was started"
                (is (= 1 (count @stream-calls)))
                (is (= "C123" (:channel (first @stream-calls)))))
              (testing "AI response was streamed"
                (is (some #(= mock-ai-text %) @append-text-calls)))
              (testing "stream was stopped"
                (is (= 1 (count @stop-stream-calls)))))))))))

(deftest stream-start-failure-test
  (testing "When start-stream fails, falls back to a regular message"
    (with-slackbot-setup
      (let [event-body base-dm-event]
        (with-slackbot-mocks
          {:ai-text "Here is your answer"}
          (fn [{:keys [post-calls stop-stream-calls]}]
            ;; Override start-stream to simulate failure
            (mt/with-dynamic-fn-redefs
              [slackbot.client/start-stream (constantly nil)]
              (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                        (slack-request-options event-body)
                                        event-body)]
                (is (= "ok" response))
                (u/poll {:thunk #(>= (count @post-calls) 1)
                         :done? true?
                         :timeout-ms 5000})
                (testing "fallback message is sent"
                  (is (= "I wasn't able to generate a response. Please try again."
                         (:text (first @post-calls)))))
                (testing "stop-stream is never called"
                  (is (= 0 (count @stop-stream-calls))))))))))))

(deftest ai-request-error-stops-stream-test
  (testing "When the AI request throws after the stream has started, the stream is stopped"
    (with-slackbot-setup
      (let [event-body base-dm-event]
        (with-slackbot-mocks
          {:ai-text "unused"}
          (fn [{:keys [stop-stream-calls stream-calls append-text-calls]}]
            ;; Override the AI client to start the stream via on-line, then throw
            (mt/with-dynamic-fn-redefs
              [metabot-v3.client/streaming-request-with-callback
               (fn [opts]
                 ;; Send enough text to trigger a flush (which starts the stream)
                 (when-let [on-line (:on-line opts)]
                   (on-line (str "0:" (json/encode (apply str (repeat (inc @#'slackbot.streaming/min-text-batch-size) "x"))))))
                 (throw (ex-info "AI service unavailable" {})))]
              (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                        (slack-request-options event-body)
                                        event-body)]
                (is (= "ok" response))
                (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                         :done? true?
                         :timeout-ms 5000})
                (testing "stream was started before the error"
                  (is (= 1 (count @stream-calls))))
                (testing "error message was appended to the stream"
                  (is (some #(str/includes? % "Something went wrong")
                            @append-text-calls)))
                (testing "stream was stopped during cleanup"
                  (is (= 1 (count @stop-stream-calls))))))))))))

(deftest streaming-request-args-test
  (testing "POST /events passes correct arguments to streaming-request-with-callback"
    (with-slackbot-setup
      (doseq [[desc event-body]
              [["DM message"            (assoc-in base-dm-event [:event :channel] "D-MY-DM-CHANNEL")]
               ["app_mention in channel" (assoc-in base-mention-event [:event :channel] "C-PUBLIC-CHANNEL")]]]
        (testing desc
          (with-slackbot-mocks
            {:ai-text "response"}
            (fn [{:keys [ai-request-calls]}]
              (mt/client :post 200 "ee/metabot-v3/slack/events"
                         (slack-request-options event-body)
                         event-body)
              (u/poll {:thunk #(= 1 (count @ai-request-calls))
                       :done? true?
                       :timeout-ms 5000})
              (is (= 1 (count @ai-request-calls)))
              (let [opts (first @ai-request-calls)]
                (is (re-matches #"[0-9a-f-]{36}" (:conversation-id opts)))
                (is (map? (:context opts)))
                (is (= (get-in event-body [:event :channel])
                       (get-in opts [:context :slack_channel_id])))
                (is (= (get-in event-body [:event :text])
                       (get-in opts [:message :content])))
                (is (vector? (:history opts)))
                (is (fn? (:on-line opts)))))))))))

(deftest user-message-with-visualizations-test
  (testing "POST /events with visualizations uploads multiple images to Slack"
    (with-slackbot-setup
      (let [mock-ai-text "Here are your charts"
            ;; Multiple static_viz data parts to test image uploads
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "static_viz" :value {:entity_id 202}}
                             ;; Include a non-viz data part to verify filtering
                             {:type "other_type" :value {:foo "bar"}}]
            event-body (update base-dm-event :event merge
                               {:text      "Show me charts"
                                :channel   "C456"
                                :ts        "1234567890.000002"
                                :event_ts  "1234567890.000002"
                                :thread_ts "1234567890.000000"})]
        (with-slackbot-mocks
          {:ai-text mock-ai-text
           :data-parts mock-data-parts}
          (fn [{:keys [stream-calls append-text-calls stop-stream-calls image-calls generate-card-output-calls fake-png-bytes]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))

              ;; Wait for streaming to complete AND image uploads
              (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1)
                                    (>= (count @image-calls) 2))
                       :done? true?
                       :timeout-ms 5000})

              (testing "streaming message flow works"
                (is (= 1 (count @stream-calls)))
                (is (= "C456" (:channel (first @stream-calls))))
                (is (some #(= mock-ai-text %) @append-text-calls))
                (is (= 1 (count @stop-stream-calls))))

              (testing "output generation called for each static_viz"
                (is (= 2 (count @generate-card-output-calls)))
                (is (= #{101 202} (set (map :card-id @generate-card-output-calls)))))

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
      (let [event-body (assoc-in base-dm-event [:event :user] "U-UNKNOWN-USER")]
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
                          :text #"(?i).*connect.*slack.*metabase.*"}]
                        @ephemeral-calls))))))))))

(deftest app-mention-unlinked-user-test
  (testing "POST /events with app_mention from unlinked user sends auth message"
    (with-slackbot-setup
      (doseq [[desc thread-ts expected-thread-ts]
              [;; top-level @mention should NOT thread (so users see the prompt)
               ["top-level @mention" nil nil]
               ;; @mention in thread should thread (to keep context)
               ["@mention in thread" "1234567890.000001" "1234567890.000001"]]]
        (testing desc
          (let [event-body (cond-> (update base-mention-event :event merge
                                           {:user     "U-UNKNOWN"
                                            :ts       "1234567890.000002"
                                            :event_ts "1234567890.000002"})
                             thread-ts (assoc-in [:event :thread_ts] thread-ts))]
            (with-slackbot-mocks
              {:ai-text "Should not be called"
               :user-id ::no-user}
              (fn [{:keys [post-calls ephemeral-calls]}]
                (is (= "ok" (mt/client :post 200 "ee/metabot-v3/slack/events"
                                       (slack-request-options event-body) event-body)))
                (u/poll {:thunk #(= 1 (count @ephemeral-calls))
                         :done? true?
                         :timeout-ms 5000})
                (is (= 0 (count @post-calls)))
                (is (=? {:user "U-UNKNOWN" :channel "C123" :thread_ts expected-thread-ts}
                        (first @ephemeral-calls)))))))))))

;; -------------------------------- Setup Complete Tests --------------------------------

(deftest setup-complete-test
  (with-slackbot-setup
    (let [request-body (assoc-in base-dm-event [:event :text] "test")
          post-events  #(mt/client :post %1 "ee/metabot-v3/slack/events"
                                   (slack-request-options request-body) request-body)]
      (testing "succeeds when all settings are configured"
        (is (= "ok" (post-events 200))))

      (testing "returns 503 when sso-slack feature disabled"
        (with-redefs [premium-features/enable-sso-slack? (constantly false)]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when client-id missing"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-id nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when client-secret missing"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-secret nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when bot-token missing"
        (mt/with-temporary-setting-values [channel.settings/slack-app-token nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when encryption disabled"
        (with-redefs [encryption/default-secret-key nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when site-url missing"
        (mt/with-temporary-setting-values [site-url nil]
          (is (= "Slack integration is not fully configured." (post-events 503)))))

      (testing "returns 503 when signing-secret missing (can't sign request)"
        (mt/with-temporary-setting-values [metabot.settings/metabot-slack-signing-secret nil]
          (is (= "Slack integration is not fully configured."
                 (mt/client :post 503 "ee/metabot-v3/slack/events" request-body))))))))

;; -------------------------------- Ad-Hoc Query Visualization Tests --------------------------------

(deftest adhoc-viz-execution-test
  (testing "POST /events with adhoc_viz executes query and uploads PNG"
    (with-slackbot-setup
      (let [mock-ai-text    "Here's your data"
            ;; Note: :type uses string "query" because JSON round-trip converts keywords to strings
            mock-query      {:database 1
                             :type     "query"
                             :query    {:source-table 2}}
            mock-data-parts [{:type  "adhoc_viz"
                              :value {:query   mock-query
                                      :display "bar"}}]
            event-body      (update base-dm-event :event merge
                                    {:text      "Show me sales data"
                                     :channel   "C789"
                                     :ts        "1234567890.000003"
                                     :event_ts  "1234567890.000003"
                                     :thread_ts "1234567890.000000"})]
        (with-slackbot-mocks
          {:ai-text    mock-ai-text
           :data-parts mock-data-parts}
          (fn [{:keys [stop-stream-calls image-calls generate-adhoc-output-calls fake-png-bytes]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))

              ;; Wait for streaming to complete AND image upload
              (u/poll {:thunk      #(and (>= (count @stop-stream-calls) 1)
                                         (>= (count @image-calls) 1))
                       :done?      true?
                       :timeout-ms 5000})

              (testing "generate-adhoc-output called with correct query and display"
                (is (= 1 (count @generate-adhoc-output-calls)))
                (is (= mock-query (:query (first @generate-adhoc-output-calls))))
                (is (= :bar (:display (first @generate-adhoc-output-calls)))))

              (testing "image uploaded with adhoc filename"
                (is (= 1 (count @image-calls)))
                (is (= "C789" (:channel (first @image-calls))))
                (is (= "1234567890.000000" (:thread-ts (first @image-calls))))
                (is (re-matches #"adhoc-\d+\.png" (:filename (first @image-calls))))
                (is (= (vec fake-png-bytes) (vec (:image-bytes (first @image-calls)))))))))))))

(deftest adhoc-viz-default-display-test
  (testing "POST /events with adhoc_viz uses :table when display not specified"
    (with-slackbot-setup
      ;; Note: :type uses string "query" because JSON round-trip converts keywords to strings
      (let [mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type  "adhoc_viz"
                              :value {:query mock-query}}] ;; no :display
            event-body      (update base-dm-event :event merge
                                    {:text     "Show data"
                                     :ts       "1234567890.000004"
                                     :event_ts "1234567890.000004"})]
        (with-slackbot-mocks
          {:ai-text    "Here's your table"
           :data-parts mock-data-parts}
          (fn [{:keys [generate-adhoc-output-calls stop-stream-calls post-calls]}]
            (mt/client :post 200 "ee/metabot-v3/slack/events"
                       (slack-request-options event-body)
                       event-body)
            ;; Wait for streaming to complete and table rendering (table output uses post after stream)
            (u/poll {:thunk      #(and (>= (count @stop-stream-calls) 1)
                                       (>= (count @post-calls) 1))
                     :done?      true?
                     :timeout-ms 5000})
            (testing "display defaults to :table"
              (is (= :table (:display (first @generate-adhoc-output-calls)))))))))))

(deftest mixed-viz-types-test
  (testing "POST /events handles both static_viz and adhoc_viz in same response"
    (with-slackbot-setup
      ;; Note: :type uses string "query" because JSON round-trip converts keywords to strings
      (let [mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "adhoc_viz" :value {:query mock-query :display "line"}}
                             {:type "static_viz" :value {:entity_id 202}}]
            event-body      (update base-dm-event :event merge
                                    {:text      "Show me everything"
                                     :channel   "C456"
                                     :ts        "1234567890.000005"
                                     :event_ts  "1234567890.000005"
                                     :thread_ts "1234567890.000000"})]
        (with-slackbot-mocks
          {:ai-text    "Here's everything"
           :data-parts mock-data-parts}
          (fn [{:keys [image-calls generate-card-output-calls generate-adhoc-output-calls]}]
            (mt/client :post 200 "ee/metabot-v3/slack/events"
                       (slack-request-options event-body)
                       event-body)
            (u/poll {:thunk      #(>= (count @image-calls) 3)
                     :done?      true?
                     :timeout-ms 5000})
            (testing "static_viz cards rendered"
              (is (= #{101 202} (set (map :card-id @generate-card-output-calls)))))
            (testing "adhoc_viz query rendered"
              (is (= 1 (count @generate-adhoc-output-calls)))
              (is (= :line (:display (first @generate-adhoc-output-calls)))))
            (testing "all images uploaded"
              (is (= 3 (count @image-calls)))
              (is (= #{"chart-101.png" "chart-202.png"}
                     (set (filter #(str/starts-with? % "chart-") (map :filename @image-calls)))))
              (is (= 1 (count (filter #(str/starts-with? % "adhoc-") (map :filename @image-calls))))))))))))

(deftest generate-card-output-display-type-test
  (testing "generate-card-output returns correct type based on card display"
    (let [fake-png-bytes (byte-array [0x89 0x50 0x4E 0x47])
          mock-results {:data {:cols [{:name "x" :base_type :type/Integer}]
                               :rows [[1] [2]]}}]
      (mt/with-dynamic-fn-redefs
        [slackbot.query/generate-card-png (constantly fake-png-bytes)
         slackbot.query/pulse-card-query-results (constantly mock-results)]

        (testing "supported display types return :image"
          (doseq [display [:bar :line :pie :area :row :scatter :funnel
                           :waterfall :combo :progress :gauge :scalar
                           :smartscalar :boxplot :sankey]]
            (testing (str "display type: " display)
              (mt/with-temp [:model/Card {card-id :id} {:display display}]
                (let [result (#'slackbot.query/generate-card-output card-id)]
                  (is (= :image (:type result))))))))

        (testing "unsupported display types return :table"
          (doseq [display [:table :pin_map :state :country :map :pivot]]
            (testing (str "display type: " display)
              (mt/with-temp [:model/Card {card-id :id} {:display display}]
                (let [result (#'slackbot.query/generate-card-output card-id)]
                  (is (= :table (:type result))))))))))))

;; -------------------------------- Visualization Error Handling Tests --------------------------------

(deftest viz-error-posts-message-test
  (testing "posts error to Slack when visualization generation fails"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:text      "Show me a chart"
                                :channel   "C456"
                                :ts        "1234567890.000010"
                                :event_ts  "1234567890.000010"
                                :thread_ts "1234567890.000000"})]
        (with-slackbot-mocks
          {:ai-text    "Here's your chart"
           :data-parts [{:type "static_viz" :value {:entity_id 999999}}]}
          (fn [{:keys [post-calls stop-stream-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.query/generate-card-output (fn [_card-id]
                                                     (throw (ex-info "Unexpected render error" {})))]
              (mt/client :post 200 "ee/metabot-v3/slack/events"
                         (slack-request-options event-body) event-body)
              (let [error-msg "Something went wrong while generating this visualization."]
                (u/poll {:thunk      #(and (>= (count @stop-stream-calls) 1)
                                           (some (fn [m] (= error-msg (:text m))) @post-calls))
                         :done?      true?
                         :timeout-ms 5000})
                (is (some #(= error-msg (:text %)) @post-calls))))))))))

(deftest viz-error-does-not-block-other-vizs-test
  (testing "a failing viz does not prevent subsequent vizs from rendering"
    (with-slackbot-setup
      (let [fake-png   (byte-array [0x89 0x50 0x4E 0x47])
            event-body (update base-dm-event :event merge
                               {:text      "Show me charts"
                                :channel   "C456"
                                :ts        "1234567890.000011"
                                :event_ts  "1234567890.000011"
                                :thread_ts "1234567890.000000"})]
        (with-slackbot-mocks
          {:ai-text    "Here are your charts"
           :data-parts [{:type "static_viz" :value {:entity_id 999999}}
                        {:type "static_viz" :value {:entity_id 123}}]}
          (fn [{:keys [post-calls image-calls stop-stream-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.query/generate-card-output (fn [card-id]
                                                     (if (= card-id 999999)
                                                       (throw (ex-info "Unexpected render error" {}))
                                                       {:type :image :content fake-png}))]
              (mt/client :post 200 "ee/metabot-v3/slack/events"
                         (slack-request-options event-body) event-body)
              (u/poll {:thunk      #(and (>= (count @stop-stream-calls) 1)
                                         (>= (count @image-calls) 1))
                       :done?      true?
                       :timeout-ms 5000})
              (testing "error message posted for failing viz"
                (is (some #(= "Something went wrong while generating this visualization." (:text %))
                          @post-calls)))
              (testing "second card still rendered"
                (is (= 1 (count @image-calls)))))))))))

(deftest generate-card-output-failed-qp-result-test
  (testing "throws when QP returns :status :failed for table card"
    (mt/with-temp [:model/Card {card-id :id} {:display :table}]
      (mt/with-dynamic-fn-redefs
        [slackbot.query/pulse-card-query-results (constantly {:status :failed
                                                              :error  "Permission denied"})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Permission denied"
                              (#'slackbot.query/generate-card-output card-id)))))))

(deftest generate-card-png-failed-qp-result-test
  (testing "throws when QP returns :status :failed for image card"
    (mt/with-temp [:model/Card {card-id :id} {:display :bar}]
      (mt/with-dynamic-fn-redefs
        [slackbot.query/pulse-card-query-results (constantly {:status :failed
                                                              :error  "Permission denied"})]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Permission denied"
                              (#'slackbot.query/generate-card-output card-id)))))))

(deftest ^:parallel generate-adhoc-output-failed-qp-result-test
  (testing "throws when QP returns :status :failed"
    (mt/with-dynamic-fn-redefs
      [slackbot.query/execute-adhoc-query (constantly {:status :failed
                                                       :error  "Table not found"
                                                       :data   {:rows [] :cols []}})]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Table not found"
                            (slackbot.query/generate-adhoc-output {:database 1} :display :table))))))

;; -------------------------------- CSV Upload Tests --------------------------------

(defn- with-upload-mocks!
  "Helper to set up common mocks for CSV upload tests.
   Options:
   - :uploads-enabled? - Whether uploads are enabled (default false)
   - :can-create-upload? - Whether user can create uploads (default true)
   - :upload-result - Result from create-csv-upload! (default success with id 123)
   - :download-content - Content returned by download-slack-file (default valid CSV)

   Calls body-fn with a map containing tracking atoms:
   {:upload-calls, :download-calls}"
  [{:keys [uploads-enabled? can-create-upload? upload-result download-content db-id]
    :or   {uploads-enabled?   false
           can-create-upload? true
           upload-result      {:id 123 :name "uploaded_data"}
           download-content   (.getBytes "col1,col2\nval1,val2")
           db-id              1}}
   body-fn]
  (let [upload-calls   (atom [])
        download-calls (atom [])]
    (mt/with-dynamic-fn-redefs
      [upload.db/current-database     (constantly (when uploads-enabled?
                                                    {:id                   db-id
                                                     :uploads_schema_name  nil
                                                     :uploads_table_prefix nil}))
       upload.impl/can-create-upload? (constantly can-create-upload?)
       upload.impl/create-csv-upload! (fn [params]
                                        (swap! upload-calls conj params)
                                        upload-result)
       slackbot.client/download-file  (fn [_client url]
                                        (swap! download-calls conj url)
                                        download-content)]
      (body-fn {:upload-calls   upload-calls
                :download-calls download-calls}))))

(deftest csv-upload-disabled-test
  (testing "POST /events with file upload when uploads are disabled"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? false}
          (fn [{:keys [upload-calls]}]
            (with-slackbot-mocks
              {:ai-text "CSV uploads are not enabled on this Metabase instance."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with error message"
                    (is (some #(= "CSV uploads are not enabled on this Metabase instance." %)
                              @append-text-calls))))))))))))

(deftest csv-upload-success-test
  (testing "POST /events with successful CSV upload"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? true
           :upload-result {:id 456 :name "Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Your CSV has been uploaded successfully as a model."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was downloaded from Slack"
                    (is (= 1 (count @download-calls)))
                    (is (= (:url_private slack-csv-file) (first @download-calls))))
                  (testing "upload was called with correct parameters"
                    (is (= 1 (count @upload-calls)))
                    (let [call (first @upload-calls)]
                      (is (= (:name slack-csv-file) (:filename call)))))
                  (testing "AI responds with success message"
                    (is (some #(= "Your CSV has been uploaded successfully as a model." %)
                              @append-text-calls))))))))))))

(deftest csv-upload-non-csv-skipped-test
  (testing "POST /events with non-CSV file is skipped"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my file"
                                :files   [{:id          "F123"
                                           :name        "document.pdf"
                                           :filetype    "pdf"
                                           :url_private "https://files.slack.com/files/document.pdf"
                                           :size        100}]})]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Only CSV files can be uploaded."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds explaining PDF not supported"
                    (is (some #(= "Only CSV files can be uploaded." %)
                              @append-text-calls))))))))))))

(deftest csv-upload-non-csv-no-text-test
  (testing "POST /events with non-CSV file and no text responds directly without AI"
    (with-slackbot-setup
      ;; No :text field - user uploaded file without typing anything
      (let [event-body (-> base-dm-event
                           (update :event merge
                                   {:subtype "file_share"
                                    :files   [{:id          "F123"
                                               :name        "query_result.xlsx"
                                               :filetype    "xlsx"
                                               :url_private "https://files.slack.com/files/query_result.xlsx"
                                               :size        100}]})
                           (update :event dissoc :text))]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "This should not be called"}
              (fn [{:keys [post-calls delete-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @post-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  ;; When AI is called, there are 2 posts (Thinking... then response) and 1 delete.
                  ;; When AI is skipped, there is just 1 post and no deletes.
                  (testing "AI was not called (only 1 post, no deletes)"
                    (is (= 1 (count @post-calls)))
                    (is (= 0 (count @delete-calls))))
                  (testing "no download was attempted"
                    (is (= 0 (count @download-calls))))
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "responds directly with skip message"
                    #_{:clj-kondo/ignore [:unresolved-namespace]}
                    (let [message-text (:text (first @post-calls))]
                      (is (str/includes? message-text "can only process CSV and TSV"))
                      (is (str/includes? message-text "query_result.xlsx")))))))))))))

(deftest csv-upload-mixed-files-test
  (testing "POST /events with mix of CSV and non-CSV files"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here are my files"
                                :files   [(assoc slack-csv-file :id "F1")
                                          {:id          "F2"
                                           :name        "report.pdf"
                                           :filetype    "pdf"
                                           :url_private "https://files.slack.com/files/report.pdf"
                                           :size        200}
                                          {:id          "F3"
                                           :name        "more_data.tsv"
                                           :filetype    "tsv"
                                           :url_private "https://files.slack.com/files/more_data.tsv"
                                           :size        150}]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :upload-result {:id 789 :name "Uploaded Data"}}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "Uploaded 2 files, skipped 1 non-CSV file."}
              (fn [{:keys [stop-stream-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "only CSV/TSV files were downloaded"
                    (is (= 2 (count @download-calls)))
                    (is (= #{"https://files.slack.com/files/data.csv"
                             "https://files.slack.com/files/more_data.tsv"}
                           (set @download-calls))))
                  (testing "only CSV/TSV files were uploaded"
                    (is (= 2 (count @upload-calls)))))))))))))

(deftest csv-upload-file-too-large-test
  (testing "POST /events with file exceeding size limit"
    (with-slackbot-setup
      (let [too-large-size (inc (* 1024 1024 1024)) ;; Just over 1GB
            event-body    (update base-dm-event :event merge
                                  {:subtype "file_share"
                                   :text    "Here's my huge file"
                                   :files   [(assoc slack-csv-file
                                                    :name        "huge_data.csv"
                                                    :url_private "https://files.slack.com/files/huge_data.csv"
                                                    :size        too-large-size)]})]
        (with-upload-mocks!
          {:uploads-enabled? true}
          (fn [{:keys [upload-calls download-calls]}]
            (with-slackbot-mocks
              {:ai-text "The file exceeds the 1GB size limit."}
              (fn [{:keys [stop-stream-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "file was not downloaded due to size"
                    (is (= 0 (count @download-calls))))
                  (testing "upload was not attempted"
                    (is (= 0 (count @upload-calls)))))))))))))

(deftest csv-upload-no-permission-test
  (testing "POST /events with file upload when user lacks permission"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype "file_share"
                                :text    "Here's my data"
                                :files   [slack-csv-file]})]
        (with-upload-mocks!
          {:uploads-enabled? true
           :can-create-upload? false}
          (fn [{:keys [upload-calls]}]
            (with-slackbot-mocks
              {:ai-text "You don't have permission to upload files."}
              (fn [{:keys [stop-stream-calls append-text-calls]}]
                (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                          (slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                           :done? true?
                           :timeout-ms 5000})
                  (testing "no upload was attempted"
                    (is (= 0 (count @upload-calls))))
                  (testing "AI responds with permission error"
                    (is (some #(= "You don't have permission to upload files." %)
                              @append-text-calls))))))))))))

(deftest ^:parallel csv-file-detection-test
  (testing "csv-file? correctly identifies CSV/TSV files"
    (is (true? (#'slackbot.uploads/csv-file? {:filetype "csv"})))
    (is (true? (#'slackbot.uploads/csv-file? {:filetype "tsv"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype "pdf"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype "xlsx"})))
    (is (false? (#'slackbot.uploads/csv-file? {:filetype nil})))
    (is (false? (#'slackbot.uploads/csv-file? {})))))

(deftest slack-id->user-id-test
  (testing "slack-id->user-id only returns active users with sso_source 'slack'"
    (let [slack-id "U12345SLACK"]
      (mt/with-temp [:model/User {active-slack-user-id :id}   {:email      "active-slack@example.com"
                                                               :is_active  true
                                                               :sso_source "slack"}
                     :model/User {inactive-slack-user-id :id} {:email      "inactive-slack@example.com"
                                                               :is_active  false
                                                               :sso_source "slack"}
                     :model/User {active-google-user-id :id}  {:email      "active-google@example.com"
                                                               :is_active  true
                                                               :sso_source "google"}]
        (testing "returns user ID for active user with sso_source 'slack'"
          (mt/with-temp [:model/AuthIdentity _ {:user_id     active-slack-user-id
                                                :provider    "slack-connect"
                                                :provider_id slack-id}]
            (is (= active-slack-user-id
                   (#'slackbot/slack-id->user-id slack-id)))))

        (testing "returns user ID for active user with sso_source 'google'"
          ;; this can happen when slack-connect-authentication-mode is slack-connect-auth-mode-link-only
          (mt/with-temp [:model/AuthIdentity _ {:user_id     active-google-user-id
                                                :provider    "slack-connect"
                                                :provider_id slack-id}]
            (is (= active-google-user-id
                   (#'slackbot/slack-id->user-id slack-id)))))

        (testing "returns nil for inactive user with sso_source 'slack'"
          (mt/with-temp [:model/AuthIdentity _ {:user_id     inactive-slack-user-id
                                                :provider    "slack-connect"
                                                :provider_id slack-id}]
            (is (nil? (#'slackbot/slack-id->user-id slack-id)))))

        (testing "returns nil for active user with different provider"
          (mt/with-temp [:model/AuthIdentity _ {:user_id     active-google-user-id
                                                :provider    "google"
                                                :provider_id slack-id}]
            (is (nil? (#'slackbot/slack-id->user-id slack-id)))))

        (testing "returns nil when no AuthIdentity exists"
          (is (nil? (#'slackbot/slack-id->user-id slack-id))))))))

(deftest channel-message-without-mention-no-auth-test
  (testing "POST /events with channel message (no @mention) from unlinked user should NOT send auth message"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:text         "Hello everyone!"
                                :user         "U-UNKNOWN-USER"
                                :channel_type "channel"})]
        (with-slackbot-mocks
          {:ai-text "Should not be called"
           :user-id ::no-user}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Give a moment for any async processing
              (Thread/sleep 500)
              (testing "no streaming session should start"
                (is (= 0 (count @stream-calls))))
              (testing "no AI requests should be made"
                (is (= 0 (count @ai-request-calls))))
              (testing "no regular messages posted"
                (is (= 0 (count @post-calls))))
              (testing "no ephemeral auth messages sent"
                (is (= 0 (count @ephemeral-calls)))))))))))

(deftest channel-message-without-mention-linked-user-test
  (testing "POST /events with channel message from linked user should be silently ignored"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:text         "Hello team!"
                                :channel_type "channel"})]
        (with-slackbot-mocks
          {:ai-text "Should not be called"}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (Thread/sleep 500)
              (testing "no streaming session should start"
                (is (= 0 (count @stream-calls))))
              (testing "no AI requests should be made"
                (is (= 0 (count @ai-request-calls))))
              (testing "no messages posted"
                (is (= 0 (count @post-calls))))
              (testing "no ephemeral messages"
                (is (= 0 (count @ephemeral-calls)))))))))))

(deftest channel-file-share-without-mention-ignored-test
  (testing "POST /events with file_share in channel without @mention is ignored"
    (with-slackbot-setup
      (let [event-body (update base-dm-event :event merge
                               {:subtype      "file_share"
                                :text         "Here's my data"
                                :channel_type "channel"
                                :files        [slack-csv-file]})]
        (with-slackbot-mocks
          {:ai-text "Should not be called"}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "ee/metabot-v3/slack/events"
                                      (slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              ;; Brief wait to ensure no async processing starts
              (Thread/sleep 200)
              (testing "no streaming session should start"
                (is (= 0 (count @stream-calls))))
              (testing "no AI requests should be made"
                (is (= 0 (count @ai-request-calls))))
              (testing "no messages posted"
                (is (= 0 (count @post-calls))))
              (testing "no ephemeral messages"
                (is (= 0 (count @ephemeral-calls)))))))))))

;; NOTE: Table block extraction disabled due to hallucinations - see slackbot.clj
#_(deftest thread->history-includes-table-blocks-test
    (testing "thread->history includes table block content in assistant messages"
      (let [thread {:messages [{:text    "Here are the results"
                                :bot_id  "B123"
                                :blocks  [{:type "table"
                                           :rows [[{:type "raw_text" :text "Product"}
                                                   {:type "raw_text" :text "Sales"}]
                                                  [{:type "raw_text" :text "Widget"}
                                                   {:type "raw_text" :text "$100"}]]}]}]}
            result (#'slackbot/thread->history thread nil)]
        (is (str/includes? (:content (first result)) "Product"))
        (is (str/includes? (:content (first result)) "Widget"))
        (is (str/includes? (:content (first result)) "$100")))))

;; -------------------------------- PUT /slack/settings Tests --------------------------------

(deftest put-slack-settings-test
  (mt/with-premium-features #{:metabot-v3 :sso-slack}
    (let [creds {:slack-connect-client-id "id"
                 :slack-connect-client-secret "secret"
                 :metabot-slack-signing-secret "signing"}
          clear {:slack-connect-client-id nil
                 :slack-connect-client-secret nil
                 :metabot-slack-signing-secret nil}]
      (testing "set all credentials"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-id nil
                                           sso-settings/slack-connect-client-secret nil
                                           metabot.settings/metabot-slack-signing-secret nil
                                           sso-settings/slack-connect-enabled false]
          (is (= {:ok true} (mt/user-http-request :crowberto :put 200 "ee/metabot-v3/slack/settings" creds)))
          (is (every? some? [(sso-settings/slack-connect-client-id)
                             (sso-settings/slack-connect-client-secret)
                             (metabot.settings/metabot-slack-signing-secret)]))
          (is (true? (sso-settings/slack-connect-enabled)))))

      (testing "clear all credentials"
        (mt/with-temporary-setting-values [sso-settings/slack-connect-client-id "x"
                                           sso-settings/slack-connect-client-secret "x"
                                           metabot.settings/metabot-slack-signing-secret "x"
                                           sso-settings/slack-connect-enabled true]
          (is (= {:ok true} (mt/user-http-request :crowberto :put 200 "ee/metabot-v3/slack/settings" clear)))
          (is (every? nil? [(sso-settings/slack-connect-client-id)
                            (sso-settings/slack-connect-client-secret)
                            (metabot.settings/metabot-slack-signing-secret)]))
          (is (false? (sso-settings/slack-connect-enabled)))))

      (testing "partial credentials returns 400"
        (doseq [partial [(assoc creds :slack-connect-client-id nil)
                         (assoc creds :slack-connect-client-secret nil)
                         (assoc creds :metabot-slack-signing-secret nil)]]
          (is (= "Must provide client id, client secret and signing secret together."
                 (mt/user-http-request :crowberto :put 400 "ee/metabot-v3/slack/settings" partial)))))

      (testing "non-admin returns 403"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :put 403 "ee/metabot-v3/slack/settings" creds))))))

  (testing "setting values without metabot-v3 feature returns 402"
    (mt/with-premium-features #{:sso-slack}
      (is (= "Metabot feature is not enabled."
             (mt/user-http-request :crowberto :put 402 "ee/metabot-v3/slack/settings"
                                   {:slack-connect-client-id "id"
                                    :slack-connect-client-secret "secret"
                                    :metabot-slack-signing-secret "signing"}))))))
