(ns metabase.slackbot.streaming-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.premium-features.core :as premium-features]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.events :as slackbot.events]
   [metabase.slackbot.persistence :as slackbot.persistence]
   [metabase.slackbot.streaming :as slackbot.streaming]
   [metabase.slackbot.test-util :as tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(deftest ^:parallel slack-thread-conversation-id-test
  (testing "Same thread produces same conversation ID"
    (is (= (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456")
           (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456"))))

  (testing "Different threads produce different IDs"
    (is (not= (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456")
              (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "789.012"))))

  (testing "Different channels produce different IDs"
    (is (not= (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456")
              (#'slackbot.streaming/slack-thread->conversation-id "T1" "C2" "123.456"))))

  (testing "Different workspaces produce different IDs"
    (is (not= (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456")
              (#'slackbot.streaming/slack-thread->conversation-id "T2" "C1" "123.456"))))

  (testing "Result is valid UUID format"
    (is (re-matches #"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
                    (#'slackbot.streaming/slack-thread->conversation-id "T1" "C1" "123.456")))))

(deftest thread->history-strips-bot-mentions-test
  (testing "User messages have bot mentions stripped"
    (with-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "<@UBOT123> hello" :user "U123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= [{:role :user :content "hello"}] result))))))

(deftest thread->history-merges-tool-calls-test
  (testing "Bot messages include tool call data from DB before text"
    (with-redefs [slackbot.persistence/message-history
                  (constantly {"1709567890.000002"
                               [{:role :assistant :tool_calls [{:id "tc1" :name "run_query"}]}
                                {:role :tool :tool_call_id "tc1" :content "42"}]})]
      (let [thread {:messages [{:ts "1709567890.000002" :text "The answer is 42" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= 3 (count result)))
        (is (= [{:id "tc1" :name "run_query"}] (:tool_calls (first result))))
        (is (= "tc1" (:tool_call_id (second result))))
        (is (= {:role :assistant :content "The answer is 42"} (last result)))))))

(deftest thread->history-excludes-thinking-test
  (testing "Thinking placeholder messages are excluded from history"
    (with-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "question" :user "U123"}
                               {:ts "1709567890.000002" :text "_Thinking..._" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= 1 (count result)))
        (is (= :user (:role (first result))))))))

(deftest thread->history-excludes-blank-bot-messages-test
  (testing "Bot messages with blank text are excluded"
    (with-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "" :bot_id "B123"}
                               {:ts "1709567890.000002" :text "   " :bot_id "B123"}
                               {:ts "1709567890.000003" :text "real" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= [{:role :assistant :content "real"}] result))))))

(deftest thread->history-excludes-soft-deleted-bot-messages-test
  (testing "thread->history excludes bot messages that have been soft-deleted"
    (with-redefs [slackbot.persistence/message-history  (constantly {})
                  slackbot.persistence/deleted-message-ids
                  (fn [_conv-id _ids] #{"1709567890.000002"})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "User question" :user "U123"}
                               {:ts "1709567890.000002" :text "Deleted bot response" :bot_id "B123"}
                               {:ts "1709567890.000003" :text "Live bot response" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= 2 (count result)))
        (is (= :user (:role (first result))))
        (is (= "Live bot response" (:content (second result))))))))

(deftest format-viz-title-test
  (testing "format-viz-title builds correct title text"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (testing "title + link"
        (is (= "📊 <https://metabase.example.com/question/42|My Chart>"
               (#'slackbot.streaming/format-viz-title "My Chart" "/question/42"))))
      (testing "title only"
        (is (= "My Chart"
               (#'slackbot.streaming/format-viz-title "My Chart" nil))))
      (testing "link only"
        (is (= "📊 <https://metabase.example.com/question/42|Open in Metabase>"
               (#'slackbot.streaming/format-viz-title nil "/question/42"))))
      (testing "neither"
        (is (nil? (#'slackbot.streaming/format-viz-title nil nil))))
      (testing "special characters in title are escaped"
        (is (= "📊 <https://metabase.example.com/question/42|Sales &amp; Revenue>"
               (#'slackbot.streaming/format-viz-title "Sales & Revenue" "/question/42")))
        (is (= "📊 <https://metabase.example.com/question/42|Foo &lt;Bar&gt; │ Baz>"
               (#'slackbot.streaming/format-viz-title "Foo <Bar> | Baz" "/question/42"))))
      (testing "title-only does not escape (no link syntax)"
        (is (= "Sales & Revenue"
               (#'slackbot.streaming/format-viz-title "Sales & Revenue" nil)))))))

(deftest feedback-blocks-test
  (testing "feedback-blocks generates correct Slack context_actions block with feedback_buttons"
    (let [conversation-id "test-conv-123"
          blocks          (#'slackbot.streaming/feedback-blocks conversation-id)]
      (is (= 1 (count blocks)))
      (let [{:keys [type block_id elements]} (first blocks)]
        (is (= "context_actions" type))
        (is (= "metabot_feedback" block_id))
        (is (= 1 (count elements)))
        (let [fb (first elements)]
          (is (= "feedback_buttons" (:type fb)))
          (is (= "metabot_feedback" (:action_id fb)))
          (testing "positive button"
            (is (= {:conversation_id conversation-id :positive true}
                   (json/decode (get-in fb [:positive_button :value]) true))))
          (testing "negative button"
            (is (= {:conversation_id conversation-id :positive false}
                   (json/decode (get-in fb [:negative_button :value]) true)))))))))

(deftest streaming-response-includes-feedback-blocks-test
  (testing "send-response passes feedback blocks to stop-stream"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event]
        (tu/with-slackbot-mocks
          {:ai-text "Here is a response"}
          (fn [{:keys [stop-stream-calls]}]
            (let [response (mt/client :post 200 "metabot/slack/events"
                                      (tu/slack-request-options event-body)
                                      event-body)]
              (is (= "ok" response))
              (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                       :done?      true?
                       :timeout-ms 5000})
              (testing "stop-stream was called with feedback blocks"
                (let [{:keys [blocks]} (first @stop-stream-calls)]
                  (is (= 1 (count blocks)))
                  (is (= "metabot_feedback" (:block_id (first blocks))))
                  (is (= "feedback_buttons" (:type (first (:elements (first blocks)))))))))))))))

(deftest slackbot-posts-free-trial-limit-error-when-managed-provider-is-locked-test
  (let [posted-message (atom nil)
        event          {:channel "C1" :ts "123.456" :channel_type "im"}]
    (mt/with-premium-features #{:metabase-ai-managed}
      (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                         "metabase/anthropic/claude-sonnet-4-6"]
        (with-redefs [premium-features/token-status
                      (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value 1000000
                                                                                 :is-locked   true}}})
                      slackbot.events/event->reply-context
                      (constantly {:channel "C1" :thread_ts "123.456"})
                      slackbot.events/dm?
                      (constantly true)
                      slackbot.client/post-thread-reply
                      (fn [_ message-ctx text & _]
                        (reset! posted-message {:message-ctx message-ctx :text text})
                        {:ok true})]
          (slackbot.streaming/send-response {:token "xoxb-test"} event)
          (is (= {:message-ctx {:channel "C1" :thread_ts "123.456"}
                  :text        "You've used all of your included AI service tokens. To keep using AI features, end your trial early and start your subscription, or add your own AI provider API key."}
                 @posted-message)))))))

(deftest slackbot-streaming-sets-ai-proxied-on-messages-test
  (testing "store-message! receives ai-proxy? = true for metabase/ prefixed provider"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            store-opts (atom [])]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-premium-features #{:metabase-ai-managed}
              (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
                (with-redefs [premium-features/token-status
                              (constantly nil)
                              metabot.persistence/store-message!
                              (fn [_conv-id _profile-id _messages & {:as opts}]
                                (swap! store-opts conj opts)
                                nil)]
                  (mt/client :post 200 "metabot/slack/events"
                             (tu/slack-request-options event-body)
                             event-body)
                  (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                           :done?      true?
                           :timeout-ms 5000}))))
            (testing "user + assistant store-message! calls both received ai-proxy? = true"
              (is (=? [{:ai-proxy? true}
                       {:ai-proxy? true}]
                      @store-opts)))))))))

(deftest slackbot-streaming-sets-ai-proxied-false-for-byok-test
  (testing "store-message! receives ai-proxy? = false for direct BYOK provider"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            store-opts (atom [])]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-haiku-4-5"]
              (with-redefs [metabot.persistence/store-message!
                            (fn [_conv-id _profile-id _messages & {:as opts}]
                              (swap! store-opts conj opts)
                              nil)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event-body)
                           event-body)
                (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                         :done?      true?
                         :timeout-ms 5000})))
            (testing "user + assistant store-message! calls both received ai-proxy? = false"
              (is (=? [{:ai-proxy? false}
                       {:ai-proxy? false}]
                      @store-opts)))))))))

;;; ------------------------------------------------ Flush throttle tests ------------------------------------------------

(defn- make-test-callbacks
  "Create streaming callbacks with mocked Slack client functions.
   Returns the callbacks map plus atoms tracking append calls."
  []
  (let [append-calls (atom [])
        client       {:token "xoxb-test"}]
    (mt/with-dynamic-fn-redefs
      [slackbot.client/start-stream         (fn [_ opts]
                                              {:stream_ts "s1" :channel (:channel opts) :thread_ts (:thread_ts opts)})
       slackbot.client/append-stream        (constantly {:ok true})
       slackbot.client/append-markdown-text (fn [_ _ _ text]
                                              (swap! append-calls conj text)
                                              {:ok true})
       slackbot.client/delete-message       (constantly {:ok true})]
      (let [cbs (#'slackbot.streaming/make-streaming-callbacks
                 client {:channel "C1" :thread-ts "t1" :team-id "T1" :user-id "U1"})]
        {:cbs          cbs
         :append-calls append-calls}))))

(deftest on-text-respects-batch-size-test
  (testing "on-text does not flush until pending text reaches min-text-batch-size"
    (let [{:keys [cbs append-calls]} (make-test-callbacks)
          {:keys [on-text request-flush! slack-writer]} cbs
          batch-size @#'slackbot.streaming/min-text-batch-size]
      ;; Send text just under the threshold — should not trigger a flush
      (on-text (apply str (repeat (dec batch-size) "a")))
      (await slack-writer)
      (is (= 0 (count @append-calls))
          "No flush should occur when text is under the batch size threshold")
      ;; Push over the threshold
      (on-text "ab")
      (await slack-writer)
      (is (= 1 (count @append-calls))
          "Flush should occur once text crosses the batch size threshold")
      ;; Force-flush to clean up
      (request-flush! true)
      (await slack-writer))))

(deftest flush-throttle-test
  (testing "rapid flushes are throttled by min-flush-interval-ns"
    (let [{:keys [cbs append-calls]} (make-test-callbacks)
          {:keys [on-text request-flush! slack-writer]} cbs
          batch-size @#'slackbot.streaming/min-text-batch-size
          big-text   (apply str (repeat (inc batch-size) "x"))]
      ;; First flush should go through immediately (last-flush-at starts at 0)
      (on-text big-text)
      (await slack-writer)
      (is (= 1 (count @append-calls)) "First flush should succeed immediately")
      ;; Second flush right after should be throttled
      (on-text big-text)
      (await slack-writer)
      (is (= 1 (count @append-calls)) "Second flush should be throttled")
      ;; Force flush bypasses throttle
      (request-flush! true)
      (await slack-writer)
      (is (= 2 (count @append-calls)) "Force flush should bypass throttle"))))
