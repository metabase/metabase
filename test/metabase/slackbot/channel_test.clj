(ns metabase.slackbot.channel-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.prometheus-test :as prometheus-test]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.blocks :as slackbot.blocks]
   [metabase.slackbot.channel :as slackbot.channel]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.test-util :as tu]
   [metabase.system.core :as system]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private table-viz-blocks
  "The blocks `collect-viz-blocks` returns for a table visualization: a title section
   followed by the table itself."
  [{:type "section" :text {:type "mrkdwn" :text "*Query results*"}}
   {:type "table" :rows [] :column_settings []}])

(def ^:private feedback-block
  {:type "context_actions" :block_id "metabot_feedback" :elements []})

(def ^:private site-url
  "Pinned so the conversation link the truncation notice carries is deterministic. `site-url` is
   unset in the test environment, which would otherwise exercise only the unlinked branch."
  "https://metabase.example.com")

(defn- fake-slack
  "Validate blocks the way Slack does, handing back its error for a payload it would reject and a
   successful response -- with a distinct `ts` per message -- otherwise."
  []
  (let [n (atom 0)]
    (fn [{:keys [blocks]}]
      (or (tu/block-rejection blocks)
          {:ok true :ts (format "17000000%02d.000002" (swap! n inc))}))))

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
    (mt/with-dynamic-fn-redefs [system/site-url (constantly site-url)
                                slackbot.client/set-status (fn [_client opts]
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

(defn- long-answer
  "An answer past the 12000 characters one `markdown` block allows. The channel path concatenates
   every text part the agent loop emits, so a multi-round turn reaches this readily."
  []
  (repeat 30 (str (apply str (repeat 690 "x")) "\n\n")))

(deftest channel-response-passes-slack-metadata-for-deep-linking-test
  (let [{:keys [request-opts backfills]} (send-channel-response! {:feedback-blocks []})]
    (is (= {:team-id          "T123"
            :thread-ts        "1700000000.000001"
            :req-slack-msg-id "1700000000.000001"}
           (select-keys request-opts [:team-id :thread-ts :req-slack-msg-id])))
    (is (= [{:msg-id 42 :slack-msg-id "1700000000.000002"}] backfills))))

(deftest channel-response-posts-one-message-test
  (testing "an answer within budget is a single message carrying prose, viz and feedback"
    (let [{:keys [posts]} (send-channel-response! {:text-parts ["Here are your results."]
                                                   :viz-blocks table-viz-blocks
                                                   :post-fn    (fake-slack)})]
      (is (= 1 (count posts)))
      (is (= ["markdown" "section" "table" "context_actions"]
             (mapv :type (:blocks (first posts)))))
      (is (= "Here are your results." (:text (first posts)))))))

(deftest channel-response-truncates-oversized-answer-test
  (testing "an oversized answer is cut, and the same message explains why (BOT-1606)"
    (let [{:keys [posts backfills]} (send-channel-response! {:text-parts (long-answer)
                                                             :viz-blocks table-viz-blocks
                                                             :post-fn    (fake-slack)})
          answer                    (first posts)
          notice-text               (fn [blocks]
                                      (->> blocks
                                           (filter #(= "context" (:type %)))
                                           (mapcat :elements)
                                           (map :text)
                                           (str/join "\n")))]
      (is (= 1 (count posts))
          "one message only -- a second would be invisible to delete and to history replay")
      (is (every? #(:ok (:response %)) posts)
          "Slack accepted it, so nothing had to fall back")
      (testing "the answer is cut to the budget and keeps its visualizations and buttons"
        (is (>= @#'slackbot.blocks/markdown-text-limit (count (:text answer))))
        (is (= ["markdown" "section" "table" "context" "context_actions"]
               (mapv :type (:blocks answer)))))
      (testing "the notice rides in a context block, linking to the conversation"
        (is (str/starts-with? (notice-text (:blocks answer)) "_This answer was too long"))
        (is (re-find #"<https?://\S+/metabot/conversation/conversation-id\|see it in full in Metabase>"
                     (notice-text (:blocks answer)))
            "an absolute link to this conversation, so the full answer is one click away"))
      (testing "the notice stays out of `:text`, which `thread->history` replays back to the model"
        (is (not (str/includes? (:text answer) "too long to post in Slack"))))
      (testing "the answer's ts is persisted -- it carries the buttons and is what a delete targets"
        (is (= [{:msg-id 42 :slack-msg-id (:ts (:response answer))}] backfills))))))

(deftest channel-response-does-not-truncate-when-it-fits-test
  (testing "a short answer produces no notice and no second message"
    (let [{:keys [posts]} (send-channel-response! {:text-parts ["Short answer."]
                                                   :post-fn    (fake-slack)})]
      (is (= 1 (count posts)))
      (is (not-any? #(str/includes? (pr-str %) "too long to post in Slack") posts)))))

(deftest channel-response-falls-back-when-slack-rejects-blocks-test
  (testing "when Slack rejects the blocks the answer is still delivered, as plain text (BOT-1606)"
    (let [first-post? (atom true)
          answer      "Here are your results."
          {:keys [posts statuses backfills]}
          (send-channel-response! {:text-parts [answer]
                                   :viz-blocks table-viz-blocks
                                   :post-fn    (fn [_call]
                                                 (if (first (reset-vals! first-post? false))
                                                   {:ok false :error "invalid_blocks"}
                                                   {:ok true :ts "1700000000.000003"}))})
          fallback    (second posts)]
      (is (= 2 (count posts))
          "a fallback message is posted after Slack rejects the response")
      (is (str/includes? (:text fallback) answer)
          "the fallback carries the answer -- unlike the DM path, nothing has been sent yet")
      (is (str/includes? (:text fallback) "could not render")
          "the fallback explains why the response is unformatted")
      (is (= [{:msg-id 42 :slack-msg-id "1700000000.000003"}] backfills)
          "the fallback's ts is persisted, so the message can still be looked up and edited")
      (is (= "" (:status (last statuses)))
          "the thread status is cleared so the spinner does not linger"))))

(deftest channel-response-fallback-never-posts-the-preview-placeholder-test
  (testing "a rejected visualization-only reply falls back to something that actually says so"
    ;; The planned message's `:text` for a viz-only reply is the `Query results` notification
    ;; preview. Posting that as the fallback would deliver a message saying nothing at all, with
    ;; the tables silently dropped.
    (let [{:keys [posts]} (send-channel-response!
                           {:text-parts []
                            :viz-blocks table-viz-blocks
                            :post-fn    (constantly {:ok false :error "invalid_blocks"})})
          fallback        (last posts)]
      (is (= 2 (count posts)) "the blocks post, then the plain-text fallback")
      (is (not (str/includes? (:text fallback) slackbot.blocks/viz-only-preview-text))
          "the notification preview is never mistaken for the answer")
      (is (str/includes? (:text fallback) "visualizations could not be included")
          "plain text cannot carry the tables, so their loss is called out")))
  (testing "a rejected reply that does have prose falls back to the prose itself"
    (let [{:keys [posts]} (send-channel-response!
                           {:text-parts ["Here are your results."]
                            :viz-blocks table-viz-blocks
                            :post-fn    (constantly {:ok false :error "invalid_blocks"})})
          fallback        (last posts)]
      (is (str/includes? (:text fallback) "Here are your results."))
      (is (str/includes? (:text fallback) "visualizations could not be included")))))

(deftest channel-response-caps-total-blocks-test
  (testing "a message with many visualizations stays inside Slack's 50 block ceiling (BOT-1606)"
    (let [{:keys [posts]}  (send-channel-response!
                            {:text-parts ["Here are your results."]
                             :viz-blocks (vec (mapcat (constantly table-viz-blocks) (range 30)))
                             :post-fn    (fake-slack)})
          {:keys [blocks]} (first posts)]
      (is (>= tu/slack-max-blocks (count blocks))
          "Slack rejects a message with more than 50 blocks")
      (is (= ["context" "context_actions"] (mapv :type (take-last 2 blocks)))
          "the dropped visualizations are called out instead of vanishing silently"))))

;; Not ^:parallel: `with-prometheus-system!` redefs a process-global var. It is also slow, so both
;; cases share one deftest and the counter is cleared between them.
(deftest channel-response-truncation-metric-test
  (mt/with-prometheus-system! [_ system]
    (testing "truncating an answer increments the truncation counter"
      (prometheus/clear! :metabase-slackbot/responses-truncated)
      (send-channel-response! {:text-parts (long-answer) :post-fn (fake-slack)})
      (is (prometheus-test/approx= 1 (mt/metric-value system :metabase-slackbot/responses-truncated))))
    (testing "an answer that fits does not"
      (prometheus/clear! :metabase-slackbot/responses-truncated)
      (send-channel-response! {:text-parts ["Short answer."] :post-fn (fake-slack)})
      (is (prometheus-test/approx= 0 (mt/metric-value system :metabase-slackbot/responses-truncated))))))
