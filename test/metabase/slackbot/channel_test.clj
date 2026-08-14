(ns metabase.slackbot.channel-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.channel :as slackbot.channel]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.test-util :as tu]
   [metabase.test :as mt]))

(def ^:private table-viz-blocks
  "The blocks `collect-viz-blocks` returns for a table visualization: a title section
   followed by the table itself."
  [{:type "section" :text {:type "mrkdwn" :text "*Query results*"}}
   {:type "table" :rows [] :column_settings []}])

(def ^:private feedback-block
  {:type "context_actions" :block_id "metabot_feedback" :elements []})

(defn- fake-slack-post
  "Validate `blocks` the way Slack does, returning its `invalid_blocks` error for the first
   oversized section block and a successful response otherwise."
  [{:keys [blocks]}]
  (if-let [idx (tu/oversized-section-index blocks)]
    (tu/invalid-blocks-response idx)
    {:ok true :ts "1700000000.000002"}))

(defn- send-channel-response!
  "Drive `send-channel-response` with stubbed collaborators, no DB, LLM or Slack required.

   `text-parts` are handed to `on-text` one at a time, mimicking the text parts the agent
   loop emits across a multi-round tool-calling turn. `post-fn` receives each recorded post
   and returns the Slack response to hand back; it defaults to accepting everything.

   Returns `{:posts [...] :statuses [...] :backfills [...] :request-opts {...}}`, where
   `request-opts` is the option map handed to `make-streaming-ai-request`."
  [{:keys [text-parts viz-blocks post-fn feedback-blocks]
    :or   {text-parts [] viz-blocks [] feedback-blocks [feedback-block]
           post-fn    (constantly {:ok true :ts "1700000000.000002"})}}]
  (let [posts        (atom [])
        statuses     (atom [])
        backfills    (atom [])
        request-opts (atom nil)]
    (mt/with-dynamic-fn-redefs [slackbot.client/set-status (fn [_client opts]
                                                             (swap! statuses conj opts)
                                                             {:ok true})
                                slackbot.client/post-thread-reply (fn [_client _ctx text & {:keys [blocks]}]
                                                                    (let [call     {:text text :blocks blocks}
                                                                          response (post-fn call)]
                                                                      (swap! posts conj (assoc call :response response))
                                                                      response))
                                metabot.persistence/set-response-slack-msg-id!
                                (fn [msg-id slack-msg-id]
                                  (swap! backfills conj {:msg-id msg-id :slack-msg-id slack-msg-id}))]
      (slackbot.channel/send-channel-response
       {}
       {:ts "1700000000.000001"}
       nil
       {:channel-id      "C123"
        :message-ctx     {:channel "C123" :thread_ts "1700000000.000001"}
        :channel         "C123"
        :thread-ts       "1700000000.000001"
        :auth-info       {:team_id "T123"}
        :thread          {:messages []}
        :bot-user-id     "U999"
        :prompt          "hello"
        :conversation-id "conversation-id"}
       {:tool-name->friendly        {}
        :make-streaming-ai-request  (fn [_conversation-id _prompt _thread _bot-user-id _channel-id _extra-history
                                         {:keys [on-text] :as opts}]
                                      (reset! request-opts opts)
                                      (run! on-text text-parts)
                                      {:msg-id 42 :external-id "message-external-id"})
        :collect-viz-blocks         (constantly {:blocks viz-blocks :errors []})
        :feedback-blocks            (constantly feedback-blocks)
        :post-viz-error!            (constantly nil)
        :make-viz-prefetch-callback (constantly (fn [& _]))
        :cancel-prefetched-viz!     (constantly nil)}))
    {:posts @posts :statuses @statuses :backfills @backfills :request-opts @request-opts}))

(defn- section-texts
  "The `text.text` of every `section` block, in order."
  [blocks]
  (->> blocks
       (filter #(= "section" (:type %)))
       (map #(get-in % [:text :text]))))

(defn- squish
  "Drop all whitespace so text can be compared across paragraph-boundary splits."
  [s]
  (str/replace s #"\s+" ""))

(deftest channel-response-passes-slack-metadata-for-deep-linking-test
  (let [{:keys [request-opts backfills]} (send-channel-response! {:feedback-blocks []})]
    (is (= {:team-id          "T123"
            :thread-ts        "1700000000.000001"
            :req-slack-msg-id "1700000000.000001"}
           (select-keys request-opts [:team-id :thread-ts :req-slack-msg-id])))
    (is (= [{:msg-id 42 :slack-msg-id "1700000000.000002"}] backfills))))

(deftest channel-response-splits-oversized-text-test
  (testing "a long answer is split so Slack accepts every section block (BOT-1606)"
    ;; Five ~690-character paragraphs, mirroring the narration the agent loop emits before
    ;; each tool call plus the final answer. `on-text` concatenates all of them, so the
    ;; answer is 3450 characters -- over Slack's 3000 character section limit.
    (let [parts           (mapv #(str (apply str (repeat 690 %)) "\n\n") ["a" "b" "c" "d" "e"])
          answer          (str/trim (apply str parts))
          {:keys [posts]} (send-channel-response! {:text-parts parts
                                                   :viz-blocks table-viz-blocks
                                                   :post-fn    fake-slack-post})
          {:keys [blocks]} (first posts)
          ;; The viz title is itself a section, so the answer is everything before the trailing
          ;; [viz title, table, feedback]. Slicing it explicitly beats dropping every leading
          ;; section, which would pass even with no answer blocks at all.
          answer-blocks    (drop-last 3 blocks)]
      (is (= 1 (count posts))
          "the response is delivered in a single post, not rejected and retried")
      (is (every? #(<= (count %) tu/slack-section-text-limit) (section-texts blocks))
          "no section block exceeds Slack's 3000 character limit")
      (is (= (squish answer) (squish (apply str (section-texts answer-blocks))))
          "splitting the answer preserves all of its text")
      (is (= ["section" "table" "context_actions"] (mapv :type (take-last 3 blocks)))
          "the viz and feedback blocks still follow the answer")
      (is (every? #(= "section" (:type %)) answer-blocks)
          "the answer is made up of section blocks")
      (is (< 1 (count answer-blocks))
          "the answer really was split across more than one block"))))

(deftest channel-response-falls-back-when-slack-rejects-blocks-test
  (testing "when Slack rejects the blocks the answer is still delivered, as plain text (BOT-1606)"
    (let [first-post? (atom true)
          answer      "Here are your results."
          {:keys [posts statuses backfills]}
          (send-channel-response! {:text-parts  [answer]
                                   :viz-blocks  table-viz-blocks
                                   :post-fn     (fn [_call]
                                                  (if (first (reset-vals! first-post? false))
                                                    (tu/invalid-blocks-response 1)
                                                    {:ok true :ts "1700000000.000003"}))})
          fallback    (second posts)]
      (is (= 2 (count posts))
          "a fallback message is posted after Slack rejects the response")
      (is (str/includes? (:text fallback) answer)
          "the fallback carries the answer -- unlike the DM path, nothing has been sent yet")
      (is (str/includes? (:text fallback) "could not render")
          "the fallback explains why the response is unformatted")
      (is (= ["context_actions"] (mapv :type (:blocks fallback)))
          "only the feedback block survives, so rating still works and nothing can be too long")
      (is (= [{:msg-id 42 :slack-msg-id "1700000000.000003"}] backfills)
          "the fallback's ts is persisted, so the message can still be looked up and edited")
      (is (= "" (:status (last statuses)))
          "the thread status is cleared so the spinner does not linger"))))

(deftest channel-response-caps-total-blocks-test
  (testing "a message with many visualizations stays inside Slack's 50 block ceiling (BOT-1606)"
    (let [{:keys [posts]}  (send-channel-response!
                            {:text-parts  ["Here are your results."]
                             :viz-blocks  (vec (mapcat (constantly table-viz-blocks) (range 30)))
                             :post-fn     fake-slack-post})
          {:keys [blocks]} (first posts)]
      (is (>= 50 (count blocks))
          "Slack rejects a message with more than 50 blocks")
      (is (= ["context" "context_actions"] (mapv :type (take-last 2 blocks)))
          "the dropped visualizations are called out instead of vanishing silently"))))

(deftest channel-response-caps-message-text-test
  (testing "the plain text field is capped too, not just the blocks (BOT-1606)"
    (let [{:keys [posts]} (send-channel-response!
                           {:text-parts  (repeat 20 (apply str (repeat 5000 "x")))
                            :post-fn     fake-slack-post})]
      (is (>= 40000 (count (:text (first posts))))
          "Slack rejects a chat.postMessage whose text exceeds 40000 characters"))))
