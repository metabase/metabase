(ns metabase.slackbot.api-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.feedback :as metabot.feedback]
   [metabase.server.settings :as server.settings]
   [metabase.slackbot.api :as slackbot]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.persistence :as slackbot.persistence]
   [metabase.slackbot.query :as slackbot.query]
   [metabase.slackbot.settings :as slackbot.settings]
   [metabase.slackbot.streaming :as slackbot.streaming]
   [metabase.slackbot.test-util :as tu]
   [metabase.sso.settings :as sso-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest manifest-endpoint-test
  (testing "GET /api/slack/manifest with metabot-v3 feature"
    (mt/with-temporary-setting-values [site-url "https://localhost:3000"]
      (testing "with site-url configured"
        (testing "admins can access manifest"
          (let [response (mt/user-http-request :crowberto :get 200 "slack/manifest")]
            (is (map? response))
            (is (contains? response :display_information))
            (is (contains? response :features))
            (is (contains? response :oauth_config))
            (is (contains? response :settings))
            (let [scopes (set (get-in response [:oauth_config :scopes :bot]))]
              (is (contains? scopes "reactions:read"))
              (is (contains? scopes "reactions:write")))))
        (testing "non-admins cannot access manifest"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "slack/manifest"))))))
    (mt/with-temporary-setting-values [site-url nil]
      (testing "without site-url configured"
        (testing "raises a 503 error"
          (is (= "You must configure a site-url for Slack integration to work."
                 (mt/user-http-request :crowberto :get 503 "slack/manifest"))))))))

(deftest events-endpoint-test
  (testing "POST /api/metabot/slack/events"
    (tu/with-slackbot-setup
      (testing "handles URL verification challenge"
        (let [body {:type "url_verification"
                    :token "Jhj5dZrVaK7ZwHHjRyZWbDl"
                    :challenge "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P"}
              response (mt/client :post 200 "metabot/slack/events"
                                  (tu/slack-request-options body)
                                  body)]
          (is (= "3eZbrw1aBm2rZgRNFdxV2595E9CY3gmdALWMmHkvFXO7tYXAYM8P" response))))

      (testing "handles 'unknown' events with ack message"
        (let [body {:type "event_callback"
                    :event {:type "team_rename"
                            :event_ts "1234567890.000001"}}
              response (mt/client :post 200 "metabot/slack/events"
                                  (tu/slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "handles message.im events"
        (let [body     (-> tu/base-dm-event
                           (assoc-in [:event :channel] "D123")
                           (assoc-in [:event :text] "Hello from DM"))
              response (mt/client :post 200 "metabot/slack/events"
                                  (tu/slack-request-options body)
                                  body)]
          (is (= "ok" response))))

      (testing "rejects requests without valid signature"
        (is (= "Slack request signature is not valid."
               (mt/client :post 401 "metabot/slack/events"
                          {:request-options {:headers {"x-slack-signature" "v0=invalid"
                                                       "x-slack-request-timestamp" "1234567890"}}}
                          {:type "url_verification"
                           :challenge "test"})))))))

(deftest feature-flag-test
  (testing "POST /api/metabot/slack/events"
    (testing "ack events even when metabot-v3 feature is disabled to prevent Slack retries"
      (tu/with-slackbot-setup
        (with-redefs [slackbot.settings/unobfuscated-metabot-slack-signing-secret (constantly tu/test-signing-secret)]
          (let [body     (assoc-in tu/base-dm-event [:event :channel] "D123")
                response (mt/client :post 200 "metabot/slack/events"
                                    (tu/slack-request-options body)
                                    body)]
            (is (= "ok" response) "Should ACK the event with 200 OK")))))))

(deftest edited-message-ignored-test
  (testing "POST /events ignores edited messages"
    (tu/with-slackbot-setup
      (doseq [[desc event-mod] [["with :edited key" {:edited {:user "U123" :ts "123"}}]
                                ["with message_changed subtype" {:subtype "message_changed"}]]]
        (testing desc
          (let [event-body (update tu/base-dm-event :event merge {:text "Edited message"} event-mod)]
            (tu/with-slackbot-mocks
              {:ai-text "Should not be called"}
              (fn [{:keys [post-calls ephemeral-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (Thread/sleep 200)
                  (is (= 0 (count @post-calls)))
                  (is (= 0 (count @ephemeral-calls))))))))))))

(deftest message-deleted-ignored-test
  (testing "POST /events ignores message_deleted events"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge {:subtype "message_deleted"})
            ignored    (atom false)]
        (with-redefs [slackbot/ignore-event  (fn [_] (reset! ignored true))
                      slackbot/process-async (fn [& _] (throw (ex-info "process-async should not be called" {})))]
          (tu/with-slackbot-mocks
            {:ai-text "Should not be called"}
            (fn [{:keys [post-calls]}]
              (let [response (mt/client :post 200 "metabot/slack/events"
                                        (tu/slack-request-options event-body)
                                        event-body)]
                (is (= "ok" response))
                (is @ignored "Event should have been routed to ignore-event")
                (is (= 0 (count @post-calls)))))))))))

(deftest slackbot-disabled-setting-test
  (testing "POST /events acks but does not process when slack-connect-enabled is false"
    (tu/with-slackbot-setup
      (mt/with-temporary-setting-values [sso-settings/slack-connect-enabled false]
        (doseq [[desc event-body]
                [["message.im event"  (assoc-in tu/base-dm-event [:event :channel] "D123")]
                 ["app_mention event" tu/base-mention-event]]]
          (testing desc
            (tu/with-slackbot-mocks
              {:ai-text "Should not be called"}
              (fn [{:keys [post-calls delete-calls ephemeral-calls]}]
                (let [response (mt/client :post 200 "metabot/slack/events"
                                          (tu/slack-request-options event-body)
                                          event-body)]
                  (is (= "ok" response))
                  (Thread/sleep 200)
                  (is (= 0 (count @post-calls)) "No messages should be posted")
                  (is (= 0 (count @delete-calls)) "No messages should be deleted")
                  (is (= 0 (count @ephemeral-calls)) "No ephemeral messages should be sent"))))))))))

(deftest user-message-triggers-response-test
  (testing "POST /events with user message triggers AI response via Slack streaming"
    (tu/with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body   tu/base-dm-event]
        (tu/with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [stream-calls append-text-calls stop-stream-calls
                       add-reaction-calls remove-reaction-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                       :done? true?
                       :timeout-ms 5000})
              (testing "stream was started"
                (is (= 1 (count @stream-calls)))
                (is (= "C123" (:channel (first @stream-calls)))))
              (testing "AI response was streamed"
                (is (some #(= mock-ai-text %) @append-text-calls)))
              (testing "stream was stopped"
                (is (= 1 (count @stop-stream-calls))))
              (testing "no reactions are added for DMs"
                (is (empty? @add-reaction-calls))
                (is (empty? @remove-reaction-calls))))))))))

(deftest app-mention-triggers-response-test
  (testing "POST /events with app_mention uses visible channel reply (not streaming)"
    (tu/with-slackbot-setup
      (let [mock-ai-text "Here is your answer"
            event-body   tu/base-mention-event]
        (tu/with-slackbot-mocks
          {:ai-text mock-ai-text}
          (fn [{:keys [post-calls stream-calls stop-stream-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk      #(>= (count @post-calls) 1)
                       :done?      true?
                       :timeout-ms 5000})
              (testing "a single threaded reply is posted with the answer"
                (is (= 1 (count @post-calls)))
                (is (str/includes? (:text (first @post-calls)) mock-ai-text))
                (is (= "1234567890.000001" (:thread_ts (first @post-calls)))))
              (testing "streaming APIs are not used for app mentions"
                (is (empty? @stream-calls))
                (is (empty? @stop-stream-calls)))
              (testing "assistant message in DB has slack_msg_id backfilled"
                (let [msg (t2/select-one :model/MetabotMessage :channel_id "C123" :role "assistant")]
                  (is (some? (:slack_msg_id msg))))))))))))

(deftest stream-start-failure-test
  (testing "When start-stream fails, falls back to a regular message"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event]
        (tu/with-slackbot-mocks
          {:ai-text "Here is your answer"}
          (fn [{:keys [post-calls stop-stream-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.client/start-stream (constantly nil)]
              (let [response (mt/client :post 200 "metabot/slack/events"
                                        (tu/slack-request-options event-body)
                                        event-body)]
                (is (= "ok" response))
                (u/poll {:thunk #(some (fn [m] (= "I wasn't able to generate a response. Please try again." (:text m)))
                                       @post-calls)
                         :done? true?
                         :timeout-ms 5000})
                (testing "fallback message is sent"
                  (is (some #(= "I wasn't able to generate a response. Please try again." (:text %))
                            @post-calls)))
                (testing "stop-stream is never called"
                  (is (= 0 (count @stop-stream-calls))))))))))))

(deftest ai-request-error-stops-stream-test
  (testing "When the agent loop throws after the stream has started, the stream is stopped"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event]
        (tu/with-slackbot-mocks
          {:ai-text "unused"}
          (fn [{:keys [stop-stream-calls stream-calls append-text-calls]}]
            (mt/with-dynamic-fn-redefs
              [agent/run-agent-loop
               (fn [_opts]
                 (reify clojure.lang.IReduceInit
                   (reduce [_ rf init]
                     ;; Emit some text first (to force stream start), then throw
                     (let [big-text (apply str (repeat (inc @#'slackbot.streaming/min-text-batch-size) "x"))]
                       (rf init {:type :text :text big-text}))
                     (throw (ex-info "Agent loop error" {})))))]
              (let [response (mt/client :post 200 "metabot/slack/events"
                                        (tu/slack-request-options event-body)
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
  (testing "POST /events passes correct arguments to agent/run-agent-loop"
    (tu/with-slackbot-setup
      (doseq [[desc event-body]
              [["DM message"            (assoc-in tu/base-dm-event [:event :channel] "D-MY-DM-CHANNEL")]
               ["app_mention in channel" (assoc-in tu/base-mention-event [:event :channel] "C-PUBLIC-CHANNEL")]]]
        (testing desc
          (tu/with-slackbot-mocks
            {:ai-text "response"}
            (fn [{:keys [ai-request-calls stop-stream-calls update-calls]}]
              (mt/client :post 200 "metabot/slack/events"
                         (tu/slack-request-options event-body)
                         event-body)
              (u/poll {:thunk      #(or (>= (count @stop-stream-calls) 1)
                                        (>= (count @update-calls) 1))
                       :done?      true?
                       :timeout-ms 5000})
              (is (= 1 (count @ai-request-calls)))
              (let [opts (first @ai-request-calls)]
                (is (= :slackbot (:profile-id opts)))
                (is (map? (:context opts)))
                (is (= (get-in event-body [:event :channel])
                       (get-in opts [:context :slack_channel_id])))
                (is (sequential? (:messages opts)))
                ;; Last message should be the user's request
                (let [last-msg (last (:messages opts))]
                  (if (= "im" (get-in event-body [:event :channel_type]))
                    (is (= (get-in event-body [:event :text])
                           (:content last-msg)))
                    (let [content (:content last-msg)]
                      (is (str/includes? content "Hello!") "user message is included in prompt")
                      (is (str/includes? content "Do not narrate the steps you took")
                          "channel response-style suffix is appended"))))))))))))

(deftest slack-msg-id-stored-test
  (testing "User and bot messages are stored with their Slack ts as slack_msg_id"
    (tu/with-slackbot-setup
      (let [event-ts  "1709567890.000001"
            long-text (apply str (repeat 60 "x"))]
        (tu/with-slackbot-mocks
          {:ai-text long-text}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-model-cleanup [:model/MetabotMessage
                                    [:model/MetabotConversation :created_at]]
              (let [event (assoc-in tu/base-dm-event [:event :ts] event-ts)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event) event)
                (u/poll {:thunk #(>= (count @stop-stream-calls) 1)
                         :done? true?
                         :timeout-ms 5000})
                (let [user-msg (t2/select-one :model/MetabotMessage :slack_msg_id event-ts :channel_id "C123")
                      bot-msg  (t2/select-one :model/MetabotMessage :slack_msg_id "stream123" :channel_id "C123")]
                  (testing "user message has event ts and channel_id"
                    (is (some? user-msg))
                    (is (= event-ts (:slack_msg_id user-msg)))
                    (is (= "C123" (:channel_id user-msg))))
                  (testing "bot message has stream ts, channel_id, and requester user_id"
                    (is (some? bot-msg))
                    (is (= "stream123" (:slack_msg_id bot-msg)))
                    (is (= "C123" (:channel_id bot-msg)))
                    (is (= (mt/user->id :rasta) (:user_id bot-msg)))))))))))))

(deftest user-message-with-visualizations-test
  (testing "POST /events with visualizations uploads images and finalizes them in stop-stream blocks"
    (tu/with-slackbot-setup
      (let [mock-ai-text "Here are your charts"
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "static_viz" :value {:entity_id 202}}
                             {:type "other_type" :value {:foo "bar"}}]
            event-body (update tu/base-dm-event :event merge
                               {:text      "Show me charts"
                                :channel   "C456"
                                :ts        "1234567890.000002"
                                :event_ts  "1234567890.000002"
                                :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text mock-ai-text
           :data-parts mock-data-parts}
          (fn [{:keys [stream-calls append-text-calls stop-stream-calls image-calls
                       generate-card-output-calls fake-png-bytes]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))

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

              (testing "rendered PNGs are uploaded to Slack"
                (is (= 2 (count @image-calls)))
                (is (= #{"card_101.png" "card_202.png"}
                       (set (map :filename @image-calls))))
                (is (every? #(= (vec fake-png-bytes) (vec (:image-bytes %)))
                            @image-calls)))

              (testing "stop-stream includes both image blocks and feedback controls"
                (let [blocks (:blocks (first @stop-stream-calls))]
                  (is (= ["section" "image" "section" "image" "context_actions"]
                         (mapv :type blocks)))
                  (is (= "feedback_buttons" (get-in blocks [4 :elements 0 :type]))))))))))))

(deftest user-not-linked-sends-auth-message-test
  (testing "POST /events with unlinked user sends auth message (DM, no user mention prefix)"
    (tu/with-slackbot-setup
      (let [event-body (assoc-in tu/base-dm-event [:event :user] "U-UNKNOWN-USER")]
        (tu/with-slackbot-mocks
          {:ai-text "Should not be called"
           :user-id ::tu/no-user}
          (fn [{:keys [post-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk #(= 1 (count @post-calls))
                       :done? true?
                       :timeout-ms 5000})
              (testing "auth message posted as regular message, threaded using message ts"
                (is (=? [{:channel "C123"
                          :thread_ts "1234567890.000001"
                          :text #"(?i).*connect.*slack.*metabase.*"}]
                        @post-calls))))))))))

(deftest app-mention-unlinked-user-test
  (testing "POST /events with app_mention from unlinked user sends ephemeral auth message"
    (tu/with-slackbot-setup
      (doseq [[desc thread-ts expected-thread-ts]
              [["top-level @mention (no thread)" nil nil]
               ["@mention in thread"             "1234567890.000001" "1234567890.000001"]]]
        (testing desc
          (let [event-body (cond-> (update tu/base-mention-event :event merge
                                           {:user     "U-UNKNOWN"
                                            :ts       "1234567890.000002"
                                            :event_ts "1234567890.000002"})
                             thread-ts (assoc-in [:event :thread_ts] thread-ts))]
            (tu/with-slackbot-mocks
              {:ai-text "Should not be called"
               :user-id ::tu/no-user}
              (fn [{:keys [post-calls ephemeral-calls]}]
                (is (= "ok" (mt/client :post 200 "metabot/slack/events"
                                       (tu/slack-request-options event-body) event-body)))
                (u/poll {:thunk #(= 1 (count @ephemeral-calls))
                         :done? true?
                         :timeout-ms 5000})
                (is (= 0 (count @post-calls)))
                (is (=? (cond-> {:channel "C123"
                                 :user    "U-UNKNOWN"
                                 :text    #"(?i).*connect.*slack.*metabase.*"}
                          expected-thread-ts (assoc :thread_ts expected-thread-ts))
                        (first @ephemeral-calls)))))))))))

(deftest slack-id->user-id-test
  (testing "slack-id->user-id only returns active users with sso_source 'slack'"
    (let [slack-id "U12345SLACK"]
      (mt/with-temporary-setting-values [server.settings/slack-connect-signing-secret-version 0]
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
                                                  :provider_id slack-id
                                                  :metadata    {:signing_secret_version 0}}]
              (is (= active-slack-user-id
                     (#'slackbot/slack-id->user-id slack-id)))))

          (testing "returns user ID for active user with sso_source 'google'"
            (mt/with-temp [:model/AuthIdentity _ {:user_id     active-google-user-id
                                                  :provider    "slack-connect"
                                                  :provider_id slack-id
                                                  :metadata    {:signing_secret_version 0}}]
              (is (= active-google-user-id
                     (#'slackbot/slack-id->user-id slack-id)))))

          (testing "returns nil for inactive user with sso_source 'slack'"
            (mt/with-temp [:model/AuthIdentity _ {:user_id     inactive-slack-user-id
                                                  :provider    "slack-connect"
                                                  :provider_id slack-id
                                                  :metadata    {:signing_secret_version 0}}]
              (is (nil? (#'slackbot/slack-id->user-id slack-id)))))

          (testing "returns nil for active user with different provider"
            (mt/with-temp [:model/AuthIdentity _ {:user_id     active-google-user-id
                                                  :provider    "google"
                                                  :provider_id slack-id}]
              (is (nil? (#'slackbot/slack-id->user-id slack-id)))))

          (testing "returns nil when no AuthIdentity exists"
            (is (nil? (#'slackbot/slack-id->user-id slack-id)))))))))

(deftest slack-id->user-id-signing-secret-version-test
  (testing "slack-id->user-id respects signing secret version"
    (let [slack-id "U12345VERSION"]
      (mt/with-temp [:model/User {user-id :id} {:email     "version-test@example.com"
                                                :is_active true}]
        (testing "identity with current version is accepted"
          (mt/with-temporary-setting-values [server.settings/slack-connect-signing-secret-version 1]
            (mt/with-temp [:model/AuthIdentity _ {:user_id     user-id
                                                  :provider    "slack-connect"
                                                  :provider_id slack-id
                                                  :metadata    {:signing_secret_version 1}}]
              (is (= user-id (#'slackbot/slack-id->user-id slack-id))))))

        (testing "identity with old version is rejected after rotation"
          (mt/with-temporary-setting-values [server.settings/slack-connect-signing-secret-version 2]
            (mt/with-temp [:model/AuthIdentity _ {:user_id     user-id
                                                  :provider    "slack-connect"
                                                  :provider_id slack-id
                                                  :metadata    {:signing_secret_version 1}}]
              (is (nil? (#'slackbot/slack-id->user-id slack-id))))))

        (testing "identity with no version (legacy) is rejected"
          (mt/with-temporary-setting-values [server.settings/slack-connect-signing-secret-version 1]
            (mt/with-temp [:model/AuthIdentity _ {:user_id     user-id
                                                  :provider    "slack-connect"
                                                  :provider_id slack-id}]
              (is (nil? (#'slackbot/slack-id->user-id slack-id))))))))))

(deftest channel-message-without-mention-no-auth-test
  (testing "POST /events with channel message (no @mention) from unlinked user should NOT send auth message"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:text         "Hello everyone!"
                                :user         "U-UNKNOWN-USER"
                                :channel_type "channel"})]
        (tu/with-slackbot-mocks
          {:ai-text "Should not be called"
           :user-id ::tu/no-user}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
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
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:text         "Hello team!"
                                :channel_type "channel"})]
        (tu/with-slackbot-mocks
          {:ai-text "Should not be called"}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
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
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:subtype      "file_share"
                                :text         "Here's my data"
                                :channel_type "channel"
                                :files        [tu/slack-csv-file]})]
        (tu/with-slackbot-mocks
          {:ai-text "Should not be called"}
          (fn [{:keys [post-calls ephemeral-calls stream-calls ai-request-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (Thread/sleep 200)
              (testing "no streaming session should start"
                (is (= 0 (count @stream-calls))))
              (testing "no AI requests should be made"
                (is (= 0 (count @ai-request-calls))))
              (testing "no messages posted"
                (is (= 0 (count @post-calls))))
              (testing "no ephemeral messages"
                (is (= 0 (count @ephemeral-calls)))))))))))

(deftest authorize-delete-request-test
  (testing "authorize-delete-request"
    (testing "returns :ignored when channel-id is nil"
      (is (= :ignored (:status (#'slackbot/authorize-delete-request "U123" nil "ts123")))))

    (testing "returns :ignored when message-ts is nil"
      (is (= :ignored (:status (#'slackbot/authorize-delete-request "U123" "C123" nil)))))

    (testing "returns :ignored for unknown Slack user"
      (with-redefs [slackbot/slack-id->user-id (constantly nil)]
        (is (= {:status        :ignored
                :reason        :unlinked-user
                :slack-user-id "U-UNKNOWN"
                :channel-id    "C123"
                :message-ts    "ts123"}
               (#'slackbot/authorize-delete-request "U-UNKNOWN" "C123" "ts123")))))

    (testing "returns :ignored when response is not tracked in the DB"
      (with-redefs [slackbot/slack-id->user-id               (constantly (mt/user->id :rasta))
                    slackbot.persistence/response-owner-user-id (constantly nil)]
        (is (= :ignored (:status (#'slackbot/authorize-delete-request "U123" "C123" "ts123"))))))

    (testing "returns :ignored when the requester is not the response owner"
      (with-redefs [slackbot/slack-id->user-id               (constantly (mt/user->id :rasta))
                    slackbot.persistence/response-owner-user-id (constantly (mt/user->id :crowberto))]
        (is (= :ignored (:status (#'slackbot/authorize-delete-request "U123" "C123" "ts123"))))))

    (testing "returns :authorized when the requester owns the response"
      (let [user-id (mt/user->id :rasta)]
        (with-redefs [slackbot/slack-id->user-id               (constantly user-id)
                      slackbot.persistence/response-owner-user-id (constantly user-id)]
          (is (= {:status          :authorized
                  :channel-id      "C123"
                  :message-ts      "ts123"
                  :request-user-id user-id}
                 (#'slackbot/authorize-delete-request "U123" "C123" "ts123"))))))))

(deftest handle-delete-reaction-test
  (testing "reaction_added with a delete emoji replaces the bot response with a removed notice"
    (tu/with-slackbot-setup
      (let [owner-id   (mt/user->id :rasta)
            channel-id "C123"
            message-ts "1709567890.333333"
            event-body {:type  "event_callback"
                        :event {:type     "reaction_added"
                                :event_ts "1709567890.333334"
                                :user     "U123"
                                :reaction "wastebasket"
                                :item     {:type    "message"
                                           :channel channel-id
                                           :ts      message-ts}}}]
        (tu/with-slackbot-mocks
          {:ai-text "not-called"
           :user-id owner-id}
          (fn [{:keys [update-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.persistence/response-owner-user-id (constantly owner-id)
               slackbot.persistence/soft-delete-response!  (constantly true)]
              (let [response (mt/client :post 200 "metabot/slack/events"
                                        (tu/slack-request-options event-body)
                                        event-body)]
                (is (= "ok" response))
                (u/poll {:thunk      #(>= (count @update-calls) 1)
                         :done?      true?
                         :timeout-ms 5000})
                (testing "Slack message is updated with a removed notice"
                  (is (= 1 (count @update-calls)))
                  (is (= channel-id (:channel (first @update-calls))))
                  (is (= message-ts (:ts (first @update-calls))))
                  (is (str/includes? (:text (first @update-calls)) "removed"))))))))))

  (testing "reaction_added with a non-delete emoji is ignored"
    (tu/with-slackbot-setup
      (let [event-body {:type  "event_callback"
                        :event {:type     "reaction_added"
                                :event_ts "1709567890.000002"
                                :user     "U123"
                                :reaction "thumbsup"
                                :item     {:type    "message"
                                           :channel "C123"
                                           :ts      "1709567890.000001"}}}]
        (tu/with-slackbot-mocks
          {:ai-text "not-called"}
          (fn [{:keys [update-calls]}]
            (mt/client :post 200 "metabot/slack/events"
                       (tu/slack-request-options event-body)
                       event-body)
            (Thread/sleep 200)
            (is (= 0 (count @update-calls)) "non-delete emoji should produce no update"))))))

  (testing "reaction_added with delete emoji from non-owner is ignored"
    (tu/with-slackbot-setup
      (let [event-body {:type  "event_callback"
                        :event {:type     "reaction_added"
                                :event_ts "1709567890.444445"
                                :user     "U-NOT-OWNER"
                                :reaction "x"
                                :item     {:type    "message"
                                           :channel "C123"
                                           :ts      "1709567890.444444"}}}]
        (tu/with-slackbot-mocks
          {:ai-text "not-called"}
          (fn [{:keys [update-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.persistence/response-owner-user-id (constantly (mt/user->id :crowberto))]
              (mt/client :post 200 "metabot/slack/events"
                         (tu/slack-request-options event-body)
                         event-body)
              (Thread/sleep 200)
              (is (= 0 (count @update-calls)) "delete from non-owner should produce no update"))))))))

(deftest put-slack-settings-test
  (let [creds {:slack-connect-client-id "id"
               :slack-connect-client-secret "secret"
               :metabot-slack-signing-secret "signing"}
        clear {:slack-connect-client-id      nil
               :slack-connect-client-secret  nil
               :metabot-slack-signing-secret nil}]
    (testing "set all credentials"
      (mt/with-temporary-setting-values [sso-settings/slack-connect-enabled false]
        (mt/with-temporary-raw-setting-values [slack-connect-client-id nil
                                               slack-connect-client-secret nil
                                               metabot-slack-signing-secret nil]
          (is (= {:ok true} (mt/user-http-request :crowberto :put 200 "metabot/slack/settings" creds))))))

    (testing "clear all credentials"
      (mt/with-temporary-setting-values [sso-settings/slack-connect-enabled true]
        (mt/with-temporary-raw-setting-values [slack-connect-client-id "x"
                                               slack-connect-client-secret "x"
                                               metabot-slack-signing-secret "x"]
          (is (= {:ok true} (mt/user-http-request :crowberto :put 200 "metabot/slack/settings" clear))))))

    (testing "partial credentials returns 400"
      (doseq [partial [(assoc creds :slack-connect-client-id nil)
                       (assoc creds :slack-connect-client-secret nil)
                       (assoc creds :metabot-slack-signing-secret nil)]]
        (is (= "Must provide client id, client secret and signing secret together."
               (mt/user-http-request :crowberto :put 400 "metabot/slack/settings" partial)))))

    (testing "non-admin returns 403"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :put 403 "metabot/slack/settings" creds))))))

(deftest feedback-modal-view-test
  (testing "positive feedback modal has no issue type dropdown"
    (let [view (#'slackbot/feedback-modal-view true {:conversation_id "c1"})]
      (is (= "metabot_feedback_modal" (:callback_id view)))
      (is (= 1 (count (:blocks view))))
      (is (= "freeform_feedback" (:block_id (first (:blocks view)))))))

  (testing "negative feedback modal has issue type dropdown and freeform input"
    (let [view (#'slackbot/feedback-modal-view false {:conversation_id "c1"})]
      (is (= 2 (count (:blocks view))))
      (is (= "issue_type" (:block_id (first (:blocks view)))))
      (is (= "freeform_feedback" (:block_id (second (:blocks view))))))))

(deftest handle-feedback-action-authenticated-test
  (testing "feedback action opens modal with correct private_metadata but does not submit to harbormaster"
    (let [conversation-id    "conv-123"
          harbormaster-calls (atom [])
          open-view-calls    (atom [])]
      (with-redefs [slackbot/slack-id->user-id                  (constantly (mt/user->id :rasta))
                    metabot.feedback/submit-to-harbormaster!  (fn [feedback]
                                                                (swap! harbormaster-calls conj feedback)
                                                                true)
                    slackbot.client/open-view                    (fn [_ params]
                                                                   (swap! open-view-calls conj params)
                                                                   {:ok true})]
        (let [action {:action_id "metabot_feedback"
                      :value     (json/encode {:conversation_id conversation-id :positive true})}]
          (#'slackbot/handle-feedback-action
           {:action        action
            :trigger-id    "trigger-abc"
            :slack-user-id "U123"
            :channel-id    "C123"
            :message-ts    "123.456"})
          (testing "modal was opened"
            (is (= 1 (count @open-view-calls)))
            (is (= "trigger-abc" (:trigger_id (first @open-view-calls))))
            (is (= "metabot_feedback_modal" (get-in (first @open-view-calls) [:view :callback_id]))))
          (testing "private_metadata includes channel_id and message_ts"
            (let [pm (json/decode (get-in (first @open-view-calls) [:view :private_metadata]) true)]
              (is (= conversation-id (:conversation_id pm)))
              (is (true? (:positive pm)))
              (is (= "C123" (:channel_id pm)))
              (is (= "123.456" (:message_ts pm)))))
          (testing "harbormaster was NOT called on button click"
            (is (= 0 (count @harbormaster-calls)))))))))

(deftest handle-feedback-action-negative-test
  (testing "negative feedback action opens modal with issue type dropdown"
    (let [open-view-calls (atom [])]
      (with-redefs [slackbot/slack-id->user-id (constantly (mt/user->id :rasta))
                    slackbot.client/open-view  (fn [_ params]
                                                 (swap! open-view-calls conj params)
                                                 {:ok true})]
        (let [action {:action_id "metabot_feedback"
                      :value     (json/encode {:conversation_id "conv-123" :positive false})}]
          (#'slackbot/handle-feedback-action
           {:action        action
            :trigger-id    "trigger-abc"
            :slack-user-id "U123"
            :channel-id    "C123"
            :message-ts    "123.456"})
          (let [view (:view (first @open-view-calls))]
            (is (= 2 (count (:blocks view))) "negative modal should have issue_type and freeform blocks")
            (is (= "issue_type" (:block_id (first (:blocks view)))))))))))

(deftest handle-feedback-action-unauthenticated-test
  (testing "feedback action is silently skipped for unauthenticated user"
    (let [harbormaster-calls (atom [])
          open-view-calls    (atom [])]
      (with-redefs [slackbot/slack-id->user-id                  (constantly nil)
                    metabot.feedback/submit-to-harbormaster!  (fn [feedback]
                                                                (swap! harbormaster-calls conj feedback)
                                                                true)
                    slackbot.client/open-view                    (fn [_ params]
                                                                   (swap! open-view-calls conj params)
                                                                   {:ok true})]
        (let [action {:action_id "metabot_feedback"
                      :value     (json/encode {:conversation_id "conv-456" :positive false})}
              result (#'slackbot/handle-feedback-action
                      {:action        action
                       :trigger-id    "trigger-abc"
                       :slack-user-id "U-UNKNOWN"
                       :channel-id    "C123"
                       :message-ts    "123.456"})]
          (is (nil? result) "should return nil when user is not found")
          (testing "nothing was called"
            (is (= 0 (count @harbormaster-calls)))
            (is (= 0 (count @open-view-calls)))))))))

(deftest handle-feedback-modal-submission-test
  (testing "modal submission sends feedback to harbormaster"
    (let [harbormaster-calls (atom [])]
      (with-redefs [metabot.feedback/submit-to-harbormaster! (fn [feedback]
                                                               (swap! harbormaster-calls conj feedback)
                                                               true)]
        (let [payload {:type "view_submission"
                       :view {:callback_id      "metabot_feedback_modal"
                              :private_metadata (json/encode {:conversation_id "conv-123"
                                                              :positive        false
                                                              :user_id         (mt/user->id :rasta)
                                                              :channel_id      "C123"
                                                              :message_ts      "123.456"})
                              :state {:values {:issue_type        {:issue_type_select {:selected_option {:value "not-factual"}}}
                                               :freeform_feedback {:freeform_input {:value "The answer was wrong"}}}}}}
              result (#'slackbot/handle-feedback-modal-submission payload)]
          @result
          (is (= 1 (count @harbormaster-calls)))
          (is (=? {:feedback          {:positive          false
                                       :message_id        "conv-123"
                                       :issue_type        "not-factual"
                                       :freeform_feedback "The answer was wrong"}
                   :source            "slack"
                   :conversation_data {:messages []}}
                  (first @harbormaster-calls)))))))

  (testing "modal submission with only freeform text submits"
    (let [harbormaster-calls (atom [])]
      (with-redefs [metabot.feedback/submit-to-harbormaster! (fn [feedback]
                                                               (swap! harbormaster-calls conj feedback)
                                                               true)]
        (let [payload {:type "view_submission"
                       :view {:callback_id      "metabot_feedback_modal"
                              :private_metadata (json/encode {:conversation_id "conv-123"
                                                              :positive        true
                                                              :user_id         (mt/user->id :rasta)
                                                              :channel_id      "C123"
                                                              :message_ts      "123.456"})
                              :state {:values {:freeform_feedback {:freeform_input {:value "Great response!"}}}}}}
              result (#'slackbot/handle-feedback-modal-submission payload)]
          @result
          (is (= 1 (count @harbormaster-calls)))
          (is (=? {:feedback {:positive          true
                              :freeform_feedback "Great response!"}
                   :source   "slack"}
                  (first @harbormaster-calls)))))))

  (testing "modal submission with no details still submits basic feedback"
    (let [harbormaster-calls (atom [])]
      (with-redefs [metabot.feedback/submit-to-harbormaster! (fn [feedback]
                                                               (swap! harbormaster-calls conj feedback)
                                                               true)]
        (let [payload {:type "view_submission"
                       :view {:callback_id      "metabot_feedback_modal"
                              :private_metadata (json/encode {:conversation_id "conv-123"
                                                              :positive        true
                                                              :user_id         (mt/user->id :rasta)
                                                              :channel_id      "C123"
                                                              :message_ts      "123.456"})
                              :state {:values {:freeform_feedback {:freeform_input {:value nil}}}}}}
              result (#'slackbot/handle-feedback-modal-submission payload)]
          @result
          (is (= 1 (count @harbormaster-calls)))
          (is (=? {:feedback {:positive          true
                              :freeform_feedback ""}
                   :source   "slack"}
                  (first @harbormaster-calls)))))))

  (testing "modal submission with only issue type submits"
    (let [harbormaster-calls (atom [])]
      (with-redefs [metabot.feedback/submit-to-harbormaster! (fn [feedback]
                                                               (swap! harbormaster-calls conj feedback)
                                                               true)]
        (let [payload {:type "view_submission"
                       :view {:callback_id      "metabot_feedback_modal"
                              :private_metadata (json/encode {:conversation_id "conv-123"
                                                              :positive        false
                                                              :user_id         (mt/user->id :rasta)
                                                              :channel_id      "C123"
                                                              :message_ts      "123.456"})
                              :state {:values {:issue_type        {:issue_type_select {:selected_option {:value "ui-bug"}}}
                                               :freeform_feedback {:freeform_input {:value nil}}}}}}
              result (#'slackbot/handle-feedback-modal-submission payload)]
          @result
          (is (= 1 (count @harbormaster-calls)))
          (is (=? {:feedback {:positive   false
                              :issue_type "ui-bug"}
                   :source   "slack"}
                  (first @harbormaster-calls)))))))

  (testing "feedback includes conversation messages from the database"
    (let [conv-id            (str (random-uuid))
          harbormaster-calls (atom [])]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :role            "user"
                     :profile_id      "slackbot"
                     :total_tokens    0
                     :data            [{:_type "TEXT" :role "user" :content "What is revenue?"}]})
        (t2/insert! :model/MetabotMessage
                    {:conversation_id conv-id
                     :role            "assistant"
                     :profile_id      "slackbot"
                     :total_tokens    10
                     :data            [{:_type "TEXT" :role "assistant" :content "Here are the results."}]})
        (with-redefs [metabot.feedback/submit-to-harbormaster! (fn [feedback]
                                                                 (swap! harbormaster-calls conj feedback)
                                                                 true)]
          (let [payload {:type "view_submission"
                         :view {:callback_id      "metabot_feedback_modal"
                                :private_metadata (json/encode {:conversation_id conv-id
                                                                :positive        true
                                                                :user_id         (mt/user->id :rasta)
                                                                :channel_id      "C123"
                                                                :message_ts      "123.456"})
                                :state {:values {:freeform_feedback {:freeform_input {:value "Great!"}}}}}}
                result (#'slackbot/handle-feedback-modal-submission payload)]
            @result
            (is (= 1 (count @harbormaster-calls)))
            (is (=? {:feedback          {:positive          true
                                         :message_id        conv-id
                                         :freeform_feedback "Great!"}
                     :source            "slack"
                     :conversation_data {:messages [{:role        :user
                                                     :data        [{:_type "TEXT" :role "user" :content "What is revenue?"}]
                                                     :profile_id  "slackbot"}
                                                    {:role        :assistant
                                                     :data        [{:_type "TEXT" :role "assistant" :content "Here are the results."}]
                                                     :profile_id  "slackbot"}]}}
                    (first @harbormaster-calls)))))))))

;; -------------------------------- Visualization Integration Tests --------------------------------

(deftest adhoc-viz-execution-test
  (testing "POST /events with adhoc_viz executes query and uploads image"
    (tu/with-slackbot-setup
      (let [mock-ai-text    "Here's your data"
            mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type "adhoc_viz" :value {:query mock-query :display "bar"}}]
            event-body      (update tu/base-dm-event :event merge
                                    {:text "Show me sales data" :channel "C789"
                                     :ts "1234567890.000003" :event_ts "1234567890.000003"
                                     :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text mock-ai-text :data-parts mock-data-parts}
          (fn [{:keys [stop-stream-calls image-calls generate-adhoc-output-calls fake-png-bytes]}]
            (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
            (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1) (>= (count @image-calls) 1))
                     :done? true? :timeout-ms 5000})
            (testing "generate-adhoc-output called with correct query and display"
              (is (= 1 (count @generate-adhoc-output-calls)))
              (is (= mock-query (:query (first @generate-adhoc-output-calls))))
              (is (= :bar (:display (first @generate-adhoc-output-calls)))))
            (testing "image uploaded with adhoc filename"
              (is (= 1 (count @image-calls)))
              (is (re-matches #"adhoc-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png" (:filename (first @image-calls))))
              (is (= (vec fake-png-bytes) (vec (:image-bytes (first @image-calls))))))
            (testing "stop-stream includes the uploaded image and feedback controls"
              (let [blocks (:blocks (first @stop-stream-calls))]
                (is (= ["section" "image" "context_actions"] (mapv :type blocks)))
                (is (re-matches #"FIMG-\d+" (get-in blocks [1 :slack_file :id])))))))))))

(deftest adhoc-viz-default-display-test
  (testing "POST /events with adhoc_viz uses :table when display not specified"
    (tu/with-slackbot-setup
      (let [mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type "adhoc_viz" :value {:query mock-query}}]
            event-body      (update tu/base-dm-event :event merge
                                    {:text "Show data" :ts "1234567890.000004" :event_ts "1234567890.000004"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here's your table" :data-parts mock-data-parts}
          (fn [{:keys [generate-adhoc-output-calls stop-stream-calls]}]
            (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
            (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1) (>= (count @generate-adhoc-output-calls) 1))
                     :done? true? :timeout-ms 5000})
            (testing "display defaults to :table"
              (is (= :table (:display (first @generate-adhoc-output-calls)))))))))))

(deftest mixed-viz-types-test
  (testing "POST /events handles both static_viz and adhoc_viz in same response"
    (tu/with-slackbot-setup
      (let [mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type "static_viz" :value {:entity_id 101}}
                             {:type "adhoc_viz" :value {:query mock-query :display "line"}}
                             {:type "static_viz" :value {:entity_id 202}}]
            event-body      (update tu/base-dm-event :event merge
                                    {:text "Show me everything" :channel "C456"
                                     :ts "1234567890.000005" :event_ts "1234567890.000005"
                                     :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here's everything" :data-parts mock-data-parts}
          (fn [{:keys [image-calls stop-stream-calls generate-card-output-calls generate-adhoc-output-calls]}]
            (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
            (u/poll {:thunk #(>= (count @image-calls) 3) :done? true? :timeout-ms 5000})
            (testing "static_viz cards rendered"
              (is (= #{101 202} (set (map :card-id @generate-card-output-calls)))))
            (testing "adhoc_viz query rendered"
              (is (= 1 (count @generate-adhoc-output-calls)))
              (is (= :line (:display (first @generate-adhoc-output-calls)))))
            (testing "all images uploaded"
              (is (= 3 (count @image-calls))))
            (testing "stop-stream includes all uploaded image blocks"
              (let [blocks (:blocks (first @stop-stream-calls))]
                (is (= ["section" "image" "section" "image" "section" "image" "context_actions"]
                       (mapv :type blocks)))))))))))

(deftest viz-error-posts-error-message-test
  (testing "posts error message when visualization generation fails"
    (tu/with-slackbot-setup
      (let [event-body (update tu/base-dm-event :event merge
                               {:text "Show me a chart" :channel "C456"
                                :ts "1234567890.000010" :event_ts "1234567890.000010"
                                :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here's your chart" :data-parts [{:type "static_viz" :value {:entity_id 999999}}]}
          (fn [{:keys [post-calls stop-stream-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.query/generate-card-output (fn [_card-id]
                                                     (throw (ex-info "Unexpected render error" {})))]
              (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
              (let [error-msg "Query execution failed, please try again."]
                (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1)
                                      (some (fn [m] (= error-msg (:text m))) @post-calls))
                         :done? true? :timeout-ms 5000})
                (is (some #(= error-msg (:text %)) @post-calls))))))))))

(deftest viz-error-does-not-block-other-vizs-test
  (testing "a failing viz does not prevent subsequent vizs from rendering"
    (tu/with-slackbot-setup
      (let [fake-png   (byte-array [0x89 0x50 0x4E 0x47])
            event-body (update tu/base-dm-event :event merge
                               {:text "Show me charts" :channel "C456"
                                :ts "1234567890.000011" :event_ts "1234567890.000011"
                                :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here are your charts"
           :data-parts [{:type "static_viz" :value {:entity_id 999999}}
                        {:type "static_viz" :value {:entity_id 123}}]}
          (fn [{:keys [post-calls image-calls stop-stream-calls]}]
            (mt/with-dynamic-fn-redefs
              [slackbot.query/generate-card-output (fn [card-id]
                                                     (if (= card-id 999999)
                                                       (throw (ex-info "Unexpected render error" {}))
                                                       {:type :image :content fake-png :card-name (str "Card " card-id)}))]
              (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
              (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1) (>= (count @image-calls) 1))
                       :done? true? :timeout-ms 5000})
              (testing "error message posted for failing viz"
                (is (some #(= "Query execution failed, please try again." (:text %)) @post-calls)))
              (testing "second card still uploads"
                (is (= 1 (count @image-calls)))))))))))

(deftest viz-caption-and-link-on-image-test
  (testing "image viz for static_viz uses the card name as caption, not the AI-provided caption"
    (tu/with-slackbot-setup
      (let [mock-data-parts [{:type "static_viz" :value {:entity_id 101 :title "AI-generated caption"}}]
            event-body      (update tu/base-dm-event :event merge
                                    {:text "Show revenue" :channel "C456"
                                     :ts "1234567890.000020" :event_ts "1234567890.000020"
                                     :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here's your chart" :data-parts mock-data-parts}
          (fn [{:keys [image-calls stop-stream-calls]}]
            (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
            (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1) (>= (count @image-calls) 1))
                     :done? true? :timeout-ms 5000})
            (let [img    (first @image-calls)
                  blocks (:blocks (first @stop-stream-calls))]
              (testing "filename uses slugified card name"
                (is (= "card_101.png" (:filename img))))
              (testing "caption block uses card name with link, not AI caption"
                (let [caption-text (get-in blocks [0 :text :text])]
                  (is (str/includes? caption-text "Card 101"))
                  (is (not (str/includes? caption-text "AI-generated caption")))
                  (is (str/includes? caption-text "/question/101"))))
              (testing "image block references the uploaded Slack file"
                (is (= (:file-id img) (get-in blocks [1 :slack_file :id])))))))))))

(deftest table-viz-with-caption-test
  (testing "table viz posts include caption block with link"
    (tu/with-slackbot-setup
      (let [mock-query      {:database 1 :type "query" :query {:source-table 2}}
            mock-data-parts [{:type "adhoc_viz" :value {:query mock-query :title "Sales Data" :link "/question#abc123"}}]
            event-body      (update tu/base-dm-event :event merge
                                    {:text "Show sales" :ts "1234567890.000021" :event_ts "1234567890.000021"
                                     :thread_ts "1234567890.000000"})]
        (tu/with-slackbot-mocks
          {:ai-text "Here's your table" :data-parts mock-data-parts}
          (fn [{:keys [stop-stream-calls generate-adhoc-output-calls]}]
            (mt/client :post 200 "metabot/slack/events" (tu/slack-request-options event-body) event-body)
            (u/poll {:thunk #(and (>= (count @stop-stream-calls) 1) (>= (count @generate-adhoc-output-calls) 1))
                     :done? true? :timeout-ms 5000})
            (let [viz-blocks (:blocks (first @stop-stream-calls))]
              (testing "table viz is finalized in stop-stream blocks"
                (is (seq viz-blocks)))
              (testing "first block is caption with mrkdwn text"
                (let [caption-block (first viz-blocks)]
                  (is (= "section" (:type caption-block)))
                  (is (= "mrkdwn" (get-in caption-block [:text :type])))
                  (is (str/includes? (get-in caption-block [:text :text]) "Sales Data"))))
              (testing "feedback controls are appended after table blocks"
                (is (= "context_actions" (get-in viz-blocks [2 :type])))
                (is (= "feedback_buttons" (get-in viz-blocks [2 :elements 0 :type])))))))))))

;; -------------------------------- Metrics Tests --------------------------------

(deftest dm-response-metrics-test
  (testing "Successful DM response increments prometheus counters and records duration"
    (mt/with-prometheus-system! [_ system]
      (tu/with-slackbot-setup
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options tu/base-dm-event) tu/base-dm-event)]
              (is (= "ok" response))
              (u/poll {:thunk #(>= (count @stop-stream-calls) 1) :done? true? :timeout-ms 5000})
              (testing "responses-generated counter is incremented for dm/success"
                (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-generated
                                                                {:source "dm" :result "success"}))))
              (testing "response-duration-ms histogram is recorded"
                (is (pos? (:sum (mt/metric-value system :metabase-slackbot/response-duration-ms {:source "dm"}))))))))))))

(deftest channel-response-metrics-test
  (testing "Successful channel response increments prometheus counters"
    (mt/with-prometheus-system! [_ system]
      (tu/with-slackbot-setup
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [update-calls remove-reaction-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options tu/base-mention-event) tu/base-mention-event)]
              (is (= "ok" response))
              (u/poll {:thunk #(and (>= (count @update-calls) 1) (>= (count @remove-reaction-calls) 1))
                       :done? true? :timeout-ms 5000})
              (testing "responses-generated counter is incremented for channel/success"
                (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-generated
                                                                {:source "channel" :result "success"})))))))))))

(deftest error-response-metrics-test
  (testing "Failed response increments error counter and records duration"
    (mt/with-prometheus-system! [_ system]
      (tu/with-slackbot-setup
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [_]
            (with-redefs [slackbot.streaming/send-response (fn [& _] (throw (Exception. "boom")))]
              (let [response (mt/client :post 200 "metabot/slack/events"
                                        (tu/slack-request-options tu/base-dm-event) tu/base-dm-event)]
                (is (= "ok" response))
                (u/poll {:thunk #(prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-generated
                                                                             {:source "dm" :result "error"}))
                         :done? true? :timeout-ms 5000})
                (testing "responses-generated error counter is incremented"
                  (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-generated
                                                                  {:source "dm" :result "error"}))))
                (testing "response-duration-ms histogram is recorded even on error"
                  (is (pos? (:sum (mt/metric-value system :metabase-slackbot/response-duration-ms {:source "dm"})))))))))))))

(deftest delete-response-metrics-test
  (testing "Deleting a response increments responses-deleted counter"
    (mt/with-prometheus-system! [_ system]
      (tu/with-slackbot-setup
        (let [channel-id "C123"
              message-ts "1234567890.000001"
              user-id    (mt/user->id :rasta)]
          (with-redefs [slackbot.client/update-message (constantly {:ok true})
                        slackbot.persistence/soft-delete-response! (constantly true)]
            (#'slackbot/replace-response-with-removed-notice!
             {:token "xoxb-test"} channel-id message-ts user-id)
            (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-deleted)))))))))
