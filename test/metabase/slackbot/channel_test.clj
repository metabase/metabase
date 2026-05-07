(ns metabase.slackbot.channel-test
  (:require
   [clojure.test :refer :all]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.channel :as slackbot.channel]
   [metabase.slackbot.client :as slackbot.client]))

(deftest channel-response-passes-slack-metadata-for-deep-linking-test
  (let [request-opts (atom nil)]
    (with-redefs [slackbot.client/set-status (constantly {:ok true})
                  slackbot.client/post-thread-reply (constantly {:ok true :ts "1700000000.000002"})
                  metabot.persistence/set-response-slack-msg-id! (constantly nil)]
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
                                      "message-external-id")
        :collect-viz-blocks         (constantly {:blocks [] :errors []})
        :feedback-blocks            (constantly [])
        :post-viz-error!            (constantly nil)
        :make-viz-prefetch-callback (constantly (fn [& _]))
        :cancel-prefetched-viz!     (constantly nil)}))
    (is (= {:team-id          "T123"
            :thread-ts        "1700000000.000001"
            :req-slack-msg-id "1700000000.000001"}
           (select-keys @request-opts [:team-id :thread-ts :req-slack-msg-id])))
    (is (some? (:stored-msg-id @request-opts)))))
