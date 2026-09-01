(ns metabase.slackbot.streaming-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.app-db.encryption-test-util :as encryption-tu]
   [metabase.channel.slack :as channel.slack]
   [metabase.metabot.agent.core :as agent]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.scope :as metabot.scope]
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
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(use-fixtures :once
  (fixtures/initialize :test-users)
  (encryption-tu/with-encrypted-app-db-fixture tu/test-encryption-key))

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
    (mt/with-dynamic-fn-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "<@UBOT123> hello" :user "U123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= [{:role :user :content "hello"}] result))))))

(deftest thread->history-merges-tool-calls-test
  (testing "Bot messages include tool call data from DB before text"
    (mt/with-dynamic-fn-redefs [slackbot.persistence/message-history
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
    (mt/with-dynamic-fn-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "question" :user "U123"}
                               {:ts "1709567890.000002" :text "_Thinking..._" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= 1 (count result)))
        (is (= :user (:role (first result))))))))

(deftest thread->history-excludes-blank-bot-messages-test
  (testing "Bot messages with blank text are excluded"
    (mt/with-dynamic-fn-redefs [slackbot.persistence/message-history (constantly {})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "" :bot_id "B123"}
                               {:ts "1709567890.000002" :text "   " :bot_id "B123"}
                               {:ts "1709567890.000003" :text "real" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= [{:role :assistant :content "real"}] result))))))

(deftest thread->history-excludes-soft-deleted-bot-messages-test
  (testing "thread->history excludes bot messages that have been soft-deleted"
    (mt/with-dynamic-fn-redefs [slackbot.persistence/message-history  (constantly {})
                                slackbot.persistence/deleted-message-ids
                                (fn [_conv-id _ids] #{"1709567890.000002"})]
      (let [thread {:messages [{:ts "1709567890.000001" :text "User question" :user "U123"}
                               {:ts "1709567890.000002" :text "Deleted bot response" :bot_id "B123"}
                               {:ts "1709567890.000003" :text "Live bot response" :bot_id "B123"}]}
            result (#'slackbot.streaming/thread->history thread "UBOT123" "conv-123")]
        (is (= 2 (count result)))
        (is (= :user (:role (first result))))
        (is (= "Live bot response" (:content (second result))))))))

(deftest thread->history-drops-errored-turns-tool-calls-test
  (testing "an errored turn's tool calls are not replayed, but its Slack text still is"
    (let [conv-id    (str (random-uuid))
          clean-ts   "1712200000.000002"
          errored-ts "1712200000.000004"
          insert!    (fn [slack-ts call-id & {:keys [error]}]
                       (t2/insert! :model/MetabotMessage
                                   (cond-> {:conversation_id conv-id
                                            :slack_msg_id    slack-ts
                                            :role            "assistant"
                                            :profile_id      "slackbot"
                                            :total_tokens    0
                                            :data            [{:type       "tool-search"
                                                               :toolCallId call-id
                                                               :state      "output-available"
                                                               :input      {:query "orders"}
                                                               :output     {:output "<result>orders</result>"}}]
                                            :data_version    2
                                            :finished        true}
                                     error (assoc :error error))))]
      (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
        (t2/insert! :model/MetabotConversation {:id conv-id :user_id (mt/user->id :rasta)})
        ;; The clean row is the control: without it a green assertion cannot tell the filter
        ;; working apart from the fixture never producing tool parts at all.
        (insert! clean-ts   "call-clean")
        (insert! errored-ts "call-errored" :error "boom")
        (let [thread   {:messages [{:ts "1712200000.000001" :text "First question"  :user   "U123"}
                                   {:ts clean-ts            :text "Here you go"     :bot_id "B123"}
                                   {:ts "1712200000.000003" :text "Second question" :user   "U123"}
                                   {:ts     errored-ts
                                    :text   "Something went wrong. Please try again."
                                    :bot_id "B123"}]}
              result   (#'slackbot.streaming/thread->history thread "UBOT123" conv-id)
              call-ids (into #{} (comp (mapcat :tool_calls) (map :id)) result)]
          (testing "the clean turn's tool call is replayed, the errored turn's is not"
            (is (= #{"call-clean"} call-ids)))
          (testing "both bot messages keep their Slack text -- the thread still shows the failure"
            (is (= ["First question"
                    "Here you go"
                    "Second question"
                    "Something went wrong. Please try again."]
                   (into [] (comp (remove #(= :tool (:role %))) (keep :content)) result)))))))))

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
               (#'slackbot.streaming/format-viz-title "Sales & Revenue" nil))))
      (testing "an over-long link is dropped, not cut -- a truncated URL is a broken URL (BOT-1606)"
        (let [huge-link (str "/question#" (apply str (repeat 4000 "Q")))]
          (is (= "My Chart"
                 (#'slackbot.streaming/format-viz-title "My Chart" huge-link))
              "the title survives; the link that cannot fit does not")
          (is (nil? (#'slackbot.streaming/format-viz-title nil huge-link))
              "nothing left to keep, so viz-output->blocks falls back to Query results"))))))

(deftest viz-blocks-fit-slack-section-limit-test
  (testing "a viz whose query link runs past the section limit still posts (BOT-1606)"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [huge-link (str "/question#" (apply str (repeat 4000 "Q")))
            blocks    (#'slackbot.streaming/viz-output->blocks
                       {:type :table :content [{:type "table" :rows []}]}
                       "revenue-by-month"
                       "Revenue by month"
                       huge-link)]
        (is (nil? (tu/oversized-block-error blocks))
            "Slack no longer rejects the whole message")
        (is (some? (tu/oversized-block-error
                    [{:type "section"
                      :text {:type "mrkdwn"
                             :text (str "📊 <https://metabase.example.com" huge-link "|Revenue by month>")}}]))
            "the linked title really is past the limit, so the case under test is the real one")
        (is (= "Revenue by month" (get-in (first blocks) [:text :text])))
        (is (= ["section" "table"] (mapv :type blocks)))))))

;; Not ^:parallel: `with-prometheus-system!` redefs a process-global var.
(deftest viz-title-over-limit-is-observable-test
  (testing "dropping an over-long query link is logged and counted (BOT-1606)"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (let [huge-link (str "/question#" (apply str (repeat 4000 "Q")))]
        (testing "the drop is recorded in the log"
          ;; `log/infof` only evaluates its args once the level is enabled, so without this the
          ;; line never runs under test and a bad format arg would ship unnoticed.
          (mt/with-log-messages-for-level [messages [metabase.slackbot.streaming :info]]
            (#'slackbot.streaming/format-viz-title "Revenue by month" huge-link)
            (is (some (fn [{:keys [message]}]
                        (str/includes? message "viz title over limit, dropping query link"))
                      (messages)))))
        (testing "and counted on its own metric, separate from answer truncation"
          (mt/with-prometheus-system! [_ system]
            (#'slackbot.streaming/format-viz-title "Revenue by month" huge-link)
            (is (= 1.0 (mt/metric-value system :metabase-slackbot/viz-links-dropped)))
            (is (= 0.0 (mt/metric-value system :metabase-slackbot/responses-truncated))
                "an over-long link is not an over-long answer")
            (testing "a link that fits is not counted"
              (prometheus/clear! :metabase-slackbot/viz-links-dropped)
              (#'slackbot.streaming/format-viz-title "Revenue by month" "/question/42")
              (is (= 0.0 (mt/metric-value system :metabase-slackbot/viz-links-dropped))))))))))

;; Not ^:parallel: `with-prometheus-system!` redefs a process-global var.
(deftest viz-title-over-limit-without-link-is-not-a-dropped-link-test
  (testing "an over-long title with no link to drop is elided, but not counted as a dropped link"
    (mt/with-prometheus-system! [_ system]
      (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
        (let [long-title (apply str (repeat 4000 "T"))]
          (is (= tu/slack-section-text-limit
                 (count (#'slackbot.streaming/format-viz-title long-title nil)))
              "the title itself is cut to the limit")
          (is (= 0.0 (mt/metric-value system :metabase-slackbot/viz-links-dropped))
              "nothing was dropped -- there was no link to begin with")
          (mt/with-log-messages-for-level [messages [metabase.slackbot.streaming :info]]
            (#'slackbot.streaming/format-viz-title long-title nil)
            (is (some (fn [{:keys [message]}]
                        (str/includes? message "no link to drop"))
                      (messages))
                "and the log says so, rather than claiming a link was dropped")))))))

(deftest viz-image-alt-text-fits-slack-limit-test
  (testing "alt_text is capped to Slack's tighter image limit, which a title can exceed alone (BOT-1606)"
    (mt/with-temporary-setting-values [site-url "https://metabase.example.com"]
      (mt/with-dynamic-fn-redefs [channel.slack/upload-file! (constantly {:id "F123" :url "https://x/y.png"})]
        ;; 2500 chars clears the 3000 section limit untouched, so only the alt_text cap catches it.
        (let [long-title (apply str (repeat 2500 "T"))
              blocks     (#'slackbot.streaming/viz-output->blocks
                          {:type :image :content (byte-array [1 2 3])}
                          "chart" long-title nil)
              image      (second blocks)]
          (is (= ["section" "image"] (mapv :type blocks)))
          (is (= 2500 (count (get-in (first blocks) [:text :text])))
              "the section text is under its own limit, so nothing there would have caught this")
          (is (= 2000 (count (:alt_text image)))
              "alt_text is cut to Slack's 2000-character limit")
          (is (str/starts-with? long-title (:alt_text image)))
          (testing "a title that fits is left alone"
            (let [ok (#'slackbot.streaming/viz-output->blocks
                      {:type :image :content (byte-array [1 2 3])}
                      "chart" "Revenue by month" nil)]
              (is (= "Revenue by month" (:alt_text (second ok)))))))))))

(deftest feedback-blocks-test
  (testing "feedback-blocks generates correct Slack context_actions block with feedback_buttons"
    (let [conversation-id     "test-conv-123"
          message-external-id "msg-ext-abc"
          blocks              (#'slackbot.streaming/feedback-blocks conversation-id message-external-id)]
      (is (= 1 (count blocks)))
      (let [{:keys [type block_id elements]} (first blocks)]
        (is (= "context_actions" type))
        (is (= "metabot_feedback" block_id))
        (is (= 1 (count elements)))
        (let [fb (first elements)]
          (is (= "feedback_buttons" (:type fb)))
          (is (= "metabot_feedback" (:action_id fb)))
          (testing "positive button"
            (is (= {:conversation_id     conversation-id
                    :message_external_id message-external-id
                    :positive            true}
                   (json/decode (get-in fb [:positive_button :value]) true))))
          (testing "negative button"
            (is (= {:conversation_id     conversation-id
                    :message_external_id message-external-id
                    :positive            false}
                   (json/decode (get-in fb [:negative_button :value]) true)))))))))

(deftest ^:synchronized streaming-response-includes-feedback-blocks-test
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
    (mt/with-temporary-setting-values [metabot.settings/llm-metabot-provider
                                       "metabase/anthropic/claude-sonnet-4-6"]
      (mt/with-dynamic-fn-redefs [premium-features/token-status
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
               @posted-message))))))

(defn- dm-error-part-appended-text!
  "Run a DM turn whose agent loop emits `error-part` instead of text, returning
   everything appended to the Slack stream."
  [error-part]
  (tu/with-slackbot-setup
    (let [event-body tu/base-dm-event]
      (tu/with-slackbot-mocks
        {}
        (fn [{:keys [append-text-calls stop-stream-calls]}]
          (mt/with-dynamic-fn-redefs [agent/run-agent-loop
                                      (fn [_opts]
                                        (reify clojure.lang.IReduceInit
                                          (reduce [_ rf init]
                                            (rf init error-part))))
                                      metabot.persistence/start-turn!
                                      (fn [& _] {:assistant-msg-id 1 :assistant-external-id "ext"})
                                      metabot.persistence/finalize-assistant-turn!
                                      (fn [& _] nil)]
            (mt/client :post 200 "metabot/slack/events"
                       (tu/slack-request-options event-body)
                       event-body)
            (u/poll {:thunk      #(pos? (count @stop-stream-calls))
                     :done?      true?
                     :timeout-ms 5000})
            (str/join "\n" @append-text-calls)))))))

(deftest ^:synchronized slackbot-streamed-error-part-uses-known-error-copy-test
  (testing "a permission_denied error part becomes access copy, not the raw permission keyword"
    (let [text (dm-error-part-appended-text!
                {:type :error :error {:message    "Permission denied: :permission/metabot-nlq required"
                                      :error-code "permission_denied"}})]
      (is (str/includes? text "You do not have permission to use the AI assistant."))
      (is (not (str/includes? text ":permission/")))))
  (testing "a permission throw the agent loop caught mid-stream also becomes access copy"
    (let [text (dm-error-part-appended-text!
                {:type :error :error {:message "Permission denied"
                                      :type    "clojure.lang.ExceptionInfo"
                                      :data    {:type                :metabot/permission-denied
                                                :required-permission :permission/metabot-nlq}}})]
      (is (str/includes? text "You do not have permission to use the AI assistant."))))
  (testing "a provider config error the agent loop caught becomes check-your-settings copy"
    (let [text (dm-error-part-appended-text!
                {:type :error :error {:message "No LLM provider connection named \"anthropic\" is configured."
                                      :type    "clojure.lang.ExceptionInfo"
                                      :data    {:status-code 400 :api-error true :error-code :llm-not-configured}}})]
      (is (str/includes? text "The AI provider isn't configured correctly. Ask your Metabase admin to check the AI settings."))))
  (testing "an unrecognized error keeps the generic copy and leaks nothing from the provider"
    (let [text (dm-error-part-appended-text!
                {:type :error :error {:message "upstream rejected key sk-ant-oops"}})]
      (is (str/includes? text "Something went wrong. Please try again."))
      (is (not (str/includes? text "sk-ant-oops"))))))

(deftest ^:synchronized slackbot-dm-posts-permission-copy-when-metabot-access-denied-test
  (testing "the 403 the agent loop's access check throws reaches the DM as access copy"
    (let [run-agent-loop (mt/original-fn #'agent/run-agent-loop)]
      (tu/with-slackbot-setup
        (let [event-body tu/base-dm-event]
          (tu/with-slackbot-mocks
            {}
            (fn [{:keys [append-text-calls stop-stream-calls]}]
              (mt/with-dynamic-fn-redefs [agent/run-agent-loop run-agent-loop
                                          metabot.scope/resolve-user-permissions
                                          (constantly {:permission/metabot :no})
                                          metabot.persistence/start-turn!
                                          (fn [& _] {:assistant-msg-id 1 :assistant-external-id "ext"})
                                          metabot.persistence/finalize-assistant-turn!
                                          (fn [& _] nil)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event-body)
                           event-body)
                (u/poll {:thunk      #(pos? (count @stop-stream-calls))
                         :done?      true?
                         :timeout-ms 5000})
                (let [text (str/join "\n" @append-text-calls)]
                  (is (str/includes? text "You do not have permission to use the AI assistant."))
                  (is (not (str/includes? text "Something went wrong"))))))))))))

(deftest ^:synchronized slackbot-channel-posts-permission-copy-when-metabot-access-denied-test
  (testing "the visible channel reply flow posts access copy for the 403, not the generic line"
    (let [run-agent-loop (mt/original-fn #'agent/run-agent-loop)]
      (tu/with-slackbot-setup
        (let [event-body tu/base-mention-event]
          (tu/with-slackbot-mocks
            {}
            (fn [{:keys [post-calls]}]
              (mt/with-dynamic-fn-redefs [agent/run-agent-loop run-agent-loop
                                          metabot.scope/resolve-user-permissions
                                          (constantly {:permission/metabot :no})
                                          metabot.persistence/start-turn!
                                          (fn [& _] {:assistant-msg-id 1 :assistant-external-id "ext"})
                                          metabot.persistence/finalize-assistant-turn!
                                          (fn [& _] nil)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event-body)
                           event-body)
                (u/poll {:thunk      #(pos? (count @post-calls))
                         :done?      true?
                         :timeout-ms 5000})
                (let [texts (keep :text @post-calls)]
                  (is (some #{"You do not have permission to use the AI assistant."} texts))
                  (is (not-any? #(str/includes? % "Something went wrong") texts)))))))))))

(deftest ^:synchronized slackbot-streaming-sets-ai-proxied-on-messages-test
  (testing "start-turn! receives ai-proxy? = true (and writes it to both user and assistant rows)
            for metabase/ prefixed provider"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            start-opts (atom [])]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-temporary-setting-values [llm-metabot-provider "metabase/anthropic/claude-sonnet-4-6"]
              (mt/with-dynamic-fn-redefs [premium-features/token-status
                                          (constantly nil)
                                          metabot.persistence/start-turn!
                                          (fn [_conv-id _profile-id _user-message & {:as opts}]
                                            (swap! start-opts conj opts)
                                            {:assistant-msg-id 1 :assistant-external-id "ext"})
                                          metabot.persistence/finalize-assistant-turn!
                                          (fn [& _] nil)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event-body)
                           event-body)
                (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                         :done?      true?
                         :timeout-ms 5000})))
            (testing "start-turn! received ai-proxy? = true"
              (is (=? [{:ai-proxy? true}] @start-opts)))))))))

(deftest ^:synchronized slackbot-streaming-seeds-state-from-db-test
  (testing "a turn seeds the agent loop with the state earlier turns in the thread persisted (BOT-522)"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event]
        (mt/with-model-cleanup [:model/MetabotMessage [:model/MetabotConversation :created_at]]
          (tu/with-slackbot-mocks
            {:ai-text "Hello!"}
            (fn [{:keys [ai-request-calls stop-stream-calls]}]
              (letfn [(send! []
                        (mt/client :post 200 "metabot/slack/events"
                                   (tu/slack-request-options event-body)
                                   event-body))
                      (wait! [n]
                        (u/poll {:thunk      #(>= (count @stop-stream-calls) n)
                                 :done?      true?
                                 :timeout-ms 5000}))]
                (send!)
                (wait! 1)
                (testing "the opening turn of a thread starts from an empty baseline"
                  (is (= {} (:state (last @ai-request-calls)))))
                ;; Stand in for the state a real first turn would have written: the mocked
                ;; agent loop produces no turn-state of its own. Taking the conversation id
                ;; from the captured opts keeps this independent of how it is derived.
                (t2/insert! :model/MetabotMessage
                            {:conversation_id (:conversation-id (last @ai-request-calls))
                             :role            "assistant"
                             :profile_id      "slackbot"
                             :total_tokens    0
                             :data            []
                             :data_version    2
                             :finished        true
                             :state           {:queries {"q1" {:database 1}}}})
                (send!)
                (wait! 2)
                (testing "the next turn in the same thread picks it up instead of {}"
                  (is (= {:queries {:q1 {:database 1}}}
                         (:state (last @ai-request-calls)))))))))))))

(deftest ^:synchronized slackbot-streaming-records-streamed-error-test
  (testing "an :error part the agent loop emits instead of throwing is still recorded on the row,
            so conversation-state does not later replay a failed turn's partial state (BOT-522)"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            finalized  (promise)]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [_ctx]
            (mt/with-dynamic-fn-redefs [agent/run-agent-loop
                                        (fn [_opts]
                                          (reify clojure.lang.IReduceInit
                                            (reduce [_ rf init]
                                              (rf init {:type :error :error {:message "boom"}}))))
                                        metabot.persistence/finalize-assistant-turn!
                                        (fn [_msg-id _parts & {:as opts}]
                                          (deliver finalized opts)
                                          nil)]
              (mt/client :post 200 "metabot/slack/events"
                         (tu/slack-request-options event-body)
                         event-body)
              (let [opts (deref finalized 5000 ::timeout)]
                (is (not= ::timeout opts))
                (is (= {:message "boom"} (:error opts)))))))))))

(deftest ^:synchronized slackbot-streaming-persists-failed-conversations-test
  (testing "User row is persisted even if setup throws after it (BOT-1279). With placeholders,
            start-turn! inserts user + placeholder atomically before any setup runs."
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            stored     (promise)]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [_ctx]
            (mt/with-dynamic-fn-redefs [metabot.persistence/start-turn!
                                        (fn [_conv-id _profile-id _user-message & {:as opts}]
                                          (deliver stored opts)
                                          {:assistant-msg-id 1 :assistant-external-id "ext"})
                                        ;; Force setup to throw *after* start-turn! has run.
                                        slackbot.persistence/message-history
                                        (fn [& _] (throw (ex-info "boom" {})))]
              (mt/client :post 200 "metabot/slack/events"
                         (tu/slack-request-options event-body)
                         event-body)
              (let [opts (deref stored 5000 ::timeout)]
                (testing "start-turn! was called before the failure"
                  (is (not= ::timeout opts))
                  (is (some? (:slack-msg-id opts))))))))))))

(deftest ^:synchronized slackbot-streaming-never-writes-pii-columns-test
  (testing "Slack-originated rows leave ip_address/embedding_*/user_agent NULL regardless of analytics-pii-retention-enabled"
    (mt/with-premium-features #{:audit-app}
      (tu/with-slackbot-setup
        (let [event-body tu/base-dm-event]
          (doseq [flag-on? [true false]]
            (testing (str "with analytics-pii-retention-enabled=" flag-on?)
              (let [start-opts (atom [])]
                (tu/with-slackbot-mocks
                  {:ai-text "Hello!"}
                  (fn [{:keys [stop-stream-calls]}]
                    (mt/with-temporary-setting-values [analytics-pii-retention-enabled flag-on?]
                      (mt/with-dynamic-fn-redefs [metabot.persistence/start-turn!
                                                  (fn [_conv-id _profile-id _user-message & {:as opts}]
                                                    (swap! start-opts conj opts)
                                                    {:assistant-msg-id 1 :assistant-external-id "ext"})
                                                  metabot.persistence/finalize-assistant-turn!
                                                  (fn [& _] nil)]
                        (mt/client :post 200 "metabot/slack/events"
                                   (tu/slack-request-options event-body)
                                   event-body)
                        (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                                 :done?      true?
                                 :timeout-ms 5000})))
                    (testing "start-turn! never received :hostname or :pii-info from the slackbot path"
                      (doseq [opts @start-opts]
                        (is (not (contains? opts :hostname)))
                        (is (not (contains? opts :pii-info)))))))))))))))

(deftest ^:synchronized slackbot-streaming-sets-ai-proxied-false-for-byok-test
  (testing "start-turn! receives ai-proxy? = false (and writes it to both user and assistant rows)
            for direct BYOK provider"
    (tu/with-slackbot-setup
      (let [event-body tu/base-dm-event
            start-opts (atom [])]
        (tu/with-slackbot-mocks
          {:ai-text "Hello!"}
          (fn [{:keys [stop-stream-calls]}]
            (mt/with-temporary-setting-values [llm-metabot-provider "anthropic/claude-haiku-4-5"]
              (mt/with-dynamic-fn-redefs [metabot.persistence/start-turn!
                                          (fn [_conv-id _profile-id _user-message & {:as opts}]
                                            (swap! start-opts conj opts)
                                            {:assistant-msg-id 1 :assistant-external-id "ext"})
                                          metabot.persistence/finalize-assistant-turn!
                                          (fn [& _] nil)]
                (mt/client :post 200 "metabot/slack/events"
                           (tu/slack-request-options event-body)
                           event-body)
                (u/poll {:thunk      #(>= (count @stop-stream-calls) 1)
                         :done?      true?
                         :timeout-ms 5000})))
            (testing "start-turn! received ai-proxy? = false"
              (is (=? [{:ai-proxy? false}] @start-opts)))))))))

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
