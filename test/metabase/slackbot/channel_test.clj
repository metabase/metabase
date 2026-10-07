(ns metabase.slackbot.channel-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.channel :as slackbot.channel]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.slackbot.test-util :as slackbot.tu]
   [metabase.test :as mt]))

(deftest channel-response-passes-slack-metadata-for-deep-linking-test
  (let [request-opts  (atom nil)
        backfill-args (atom nil)]
    (mt/with-dynamic-fn-redefs [slackbot.client/set-status (constantly {:ok true})
                                slackbot.client/post-thread-reply (constantly {:ok true :ts "1700000000.000002"})
                                metabot.persistence/set-response-slack-msg-id!
                                (fn [msg-id slack-msg-id]
                                  (reset! backfill-args {:msg-id msg-id :slack-msg-id slack-msg-id}))]
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
        :make-streaming-ai-request  (fn [& args]
                                      (reset! request-opts (last args))
                                      {:msg-id      42
                                       :external-id "message-external-id"})
        :collect-viz-blocks         (constantly {:blocks [] :errors []})
        :feedback-blocks            (constantly [])
        :post-viz-error!            (constantly nil)
        :make-viz-prefetch-callback (constantly (fn [& _]))
        :cancel-prefetched-viz!     (constantly nil)}))
    (is (= {:team-id          "T123"
            :thread-ts        "1700000000.000001"
            :req-slack-msg-id "1700000000.000001"}
           (select-keys @request-opts [:team-id :thread-ts :req-slack-msg-id])))
    (is (= {:msg-id 42 :slack-msg-id "1700000000.000002"}
           @backfill-args))))

;;; ---------------------------------- BOT-1606: over-long answers ----------------------------------

(def ^:private conversation-id "0f8a1c3e-0000-4000-8000-000000000001")

(def ^:private test-site-url "https://metabase.example.com")

(def ^:private viz-blocks
  [{:type "section" :text {:type "mrkdwn" :text "*Orders by month*"}}
   {:type "table" :rows []}])

(def ^:private feedback-blocks
  [{:type "context_actions" :elements []}])

(defn- drive-channel-response!
  "Drive [[slackbot.channel/send-channel-response]] to completion with `answer` as the model's text.
   `reply-result` stands in for what Slack returns from `post-thread-reply`, and is called with the
   number of posts made so far. Returns `{:posts [{:text .. :blocks ..} ..] :backfill ..}`, in the
   order the posts were made."
  [answer reply-result]
  (let [posts    (atom [])
        backfill (atom nil)]
    (mt/with-dynamic-fn-redefs [slackbot.client/set-status (constantly {:ok true})
                                slackbot.client/post-thread-reply
                                (fn [_client _message-ctx text & {:keys [blocks]}]
                                  (reply-result (count (swap! posts conj {:text text :blocks blocks}))))
                                metabot.persistence/set-response-slack-msg-id!
                                (fn [msg-id slack-msg-id]
                                  (reset! backfill {:msg-id msg-id :slack-msg-id slack-msg-id}))]
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
        :conversation-id conversation-id}
       {:tool-name->friendly        {}
        :make-streaming-ai-request  (fn [& args]
                                      ((:on-text (last args)) answer)
                                      {:msg-id      42
                                       :external-id "message-external-id"})
        :collect-viz-blocks         (constantly {:blocks viz-blocks :errors []})
        :feedback-blocks            (constantly feedback-blocks)
        :post-viz-error!            (constantly nil)
        :make-viz-prefetch-callback (constantly (fn [& _]))
        :cancel-prefetched-viz!     (constantly nil)}))
    {:posts @posts :backfill @backfill}))

(defn- send-channel-response!
  "Drive [[slackbot.channel/send-channel-response]] with a Slack that accepts everything.
   Returns `{:text .. :blocks ..}` as posted, plus the `:backfill` it recorded."
  [answer]
  (let [{:keys [posts backfill]} (drive-channel-response!
                                  answer
                                  (constantly {:ok true :ts "1700000000.000002"}))]
    (assoc (last posts) :backfill backfill)))

(deftest ^:parallel truncation-notice-test
  (testing "the notice points at the instance, and says what to do about the cut"
    (is (= (str "_This answer was longer than " slackbot.tu/slack-markdown-text-limit
                " characters. That is too long to post in Slack, "
                "so I cut it short._\n\n"
                "Ask a narrower question so the answer comes back smaller"
                ", or head to <https://metabase.example.com|Metabase> and try again.")
           (#'slackbot.channel/truncation-notice test-site-url))))
  (testing "an instance with no site URL still gets a sentence, just without the link"
    (is (= (str "_This answer was longer than " slackbot.tu/slack-markdown-text-limit
                " characters. That is too long to post in Slack, "
                "so I cut it short._\n\n"
                "Ask a narrower question so the answer comes back smaller.")
           (#'slackbot.channel/truncation-notice nil))))
  (testing "the notice never deep-links to the conversation -- continuing it on the web is unsupported"
    (is (not (str/includes? (#'slackbot.channel/truncation-notice test-site-url)
                            "/metabot/conversation/")))))

(deftest channel-response-truncates-oversized-answer-test
  (testing "an oversized answer is cut, and the same message explains why (BOT-1606)"
    (mt/with-temporary-setting-values [site-url test-site-url]
      (let [{:keys [text blocks backfill]} (send-channel-response! slackbot.tu/oversized-answer)
            [answer-block notice-block]    blocks
            answer-text                    (:text answer-block)]
        (testing "no block is over its limit -- so Slack no longer rejects the message"
          (is (nil? (slackbot.tu/oversized-block-error blocks))))
        (testing "the answer goes in one markdown block, cut to the limit (BOT-2010)"
          (is (= "markdown" (:type answer-block)))
          (is (= slackbot.tu/slack-markdown-text-limit (count answer-text)))
          (is (str/ends-with? answer-text "..."))
          (is (str/starts-with? slackbot.tu/oversized-answer (str/replace answer-text #"\.\.\.$" ""))
              "what survives the cut is a genuine prefix of the answer"))
        (testing "the notice rides in a context block of the same message, linking to the instance"
          (is (= "context" (:type notice-block)))
          (is (= [{:type "mrkdwn"
                   :text (#'slackbot.channel/truncation-notice test-site-url)}]
                 (:elements notice-block)))
          (is (not (str/includes? (get-in notice-block [:elements 0 :text]) "/metabot/conversation/"))
              "the link is the home page, not a conversation we cannot continue on the web"))
        (testing "the visualizations and the feedback buttons still ride the message"
          (is (= ["markdown" "context" "section" "table" "context_actions"]
                 (mapv :type blocks))))
        (testing "the notice stays out of `:text`, which `thread->history` replays back to the model"
          (is (= answer-text text))
          (is (not (str/includes? text "too long to post in Slack"))))
        (testing "one message is posted, and its ts is persisted -- it carries the feedback buttons"
          (is (= {:msg-id 42 :slack-msg-id "1700000000.000002"} backfill)))))))

(deftest channel-response-truncation-notice-without-site-url-test
  (testing "an instance with no site URL still gets the notice, just without a link"
    (mt/with-temporary-setting-values [site-url nil]
      (let [{:keys [blocks]} (send-channel-response! slackbot.tu/oversized-answer)
            notice-block     (second blocks)
            notice           (get-in notice-block [:elements 0 :text])]
        (is (= "context" (:type notice-block)))
        (is (str/includes? notice "too long to post in Slack"))
        (is (not (str/includes? notice "<"))
            "nothing to link to, so the sentence stands on its own")))))

(deftest channel-response-does-not-truncate-when-it-fits-test
  (testing "an answer within the limit is posted whole, with no notice"
    (let [answer                "Orders peaked in March. *1,204* of them."
          {:keys [text blocks]} (send-channel-response! answer)]
      (is (nil? (slackbot.tu/oversized-block-error blocks)))
      (is (= answer (:text (first blocks))))
      (is (= answer text))
      (is (= ["markdown" "section" "table" "context_actions"] (mapv :type blocks))
          "no context block, because nothing was cut"))))

;; Not ^:parallel: `with-prometheus-system!` redefs a process-global var.
(deftest channel-response-truncation-metric-test
  (mt/with-prometheus-system! [_ system]
    (mt/with-temporary-setting-values [site-url test-site-url]
      (testing "truncating an answer increments the truncation counter"
        (send-channel-response! slackbot.tu/oversized-answer)
        (is (= 1.0 (mt/metric-value system :metabase-slackbot/responses-truncated))))
      (testing "an answer that fits does not"
        (prometheus/clear! :metabase-slackbot/responses-truncated)
        (send-channel-response! "Short answer.")
        (is (= 0.0 (mt/metric-value system :metabase-slackbot/responses-truncated)))))))

(deftest channel-response-falls-back-to-plain-text-when-blocks-are-rejected-test
  (testing "a message Slack rejects still reaches the user as plain text, rather than silence"
    (let [{:keys [posts]}     (drive-channel-response!
                               "Orders peaked in March."
                               (fn [n] (if (= n 1)
                                         {:ok false :error "invalid_blocks"}
                                         {:ok true :ts "1700000000.000002"})))
          [rejected fallback] posts]
      (is (= 2 (count posts))
          "the rejected post is followed by a plain-text retry")
      (is (seq (:blocks rejected))
          "the first attempt carried blocks")
      (is (nil? (:blocks fallback))
          "the fallback carries none, so there is nothing left for Slack to reject")
      (is (= "I generated a response, but Slack could not render it. Please try again."
             (:text fallback)))))
  (testing "a message Slack accepts is posted once, with no fallback"
    (let [{:keys [posts]} (drive-channel-response!
                           "Orders peaked in March."
                           (constantly {:ok true :ts "1700000000.000002"}))]
      (is (= 1 (count posts))))))

;; Not ^:parallel: `with-prometheus-system!` redefs a process-global var.
(deftest channel-response-undeliverable-metric-test
  (mt/with-prometheus-system! [_ system]
    (testing "a response that fails even as plain text is counted as undeliverable"
      (drive-channel-response! "Orders peaked in March."
                               (constantly {:ok false :error "channel_not_found"}))
      (is (= 1.0 (mt/metric-value system :metabase-slackbot/responses-undeliverable))))
    (testing "a response saved by the fallback is not -- the user did get a reply"
      (prometheus/clear! :metabase-slackbot/responses-undeliverable)
      (drive-channel-response! "Orders peaked in March."
                               (fn [n] (if (= n 1)
                                         {:ok false :error "invalid_blocks"}
                                         {:ok true :ts "1700000000.000002"})))
      (is (= 0.0 (mt/metric-value system :metabase-slackbot/responses-undeliverable))))))
