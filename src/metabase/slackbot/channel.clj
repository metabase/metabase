(ns metabase.slackbot.channel
  "Visible Slack channel reply/update flow for metabot."
  (:require
   [clojure.string :as str]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private channel-response-style-suffix
  (str "\n\n"
       "For this Slack channel response: the user already saw tool progress updates. "
       "Do not narrate the steps you took, do not recap tool calls, and do not include preambles like "
       "\"I'll...\", \"Let me...\", or \"I found...\". Give a brief final response in "
       "1-2 sentences before any table or chart."))

(defn- channel-request-prompt
  "Append channel-specific response style guidance without changing the stored user prompt."
  [prompt]
  (str prompt channel-response-style-suffix))

(defn- final-text-blocks
  "Build the leading text block(s) for a finalized non-streaming Slack message."
  [text]
  (if (str/blank? text)
    []
    [{:type "section"
      :text {:type "mrkdwn"
             :text text}}]))

(defn- make-channel-callbacks
  "Create callback functions for channel replies.
   Uses the Slack assistant setStatus API for progress indication.
   Text is accumulated and sent once in the final message post."
  [client {:keys [channel thread-ts tool-name->friendly]}]
  (let [current-text (atom "")]
    (letfn [(set-status! [status]
              (try
                (slackbot.client/set-status client {:status "is doing science..."
                                                    :channel-id channel
                                                    :thread-ts  thread-ts
                                                    :loading-messages [(or status "")]})
                (catch Exception e
                  (log/warnf e "[slackbot] set-status failed (channel=%s thread-ts=%s)" channel thread-ts))))]
      {:on-text       (bound-fn* (fn [text]
                                   (when (seq text)
                                     (swap! current-text str text))))
       :on-tool-start (fn [{:keys [tool-name]}]
                        (set-status! (str (tool-name->friendly tool-name "Thinking") "...")))
       :set-status!   set-status!
       :current-text  current-text})))

(defn send-channel-response
  "Send a visible threaded reply for non-DM Slack conversations.
   Accumulates AI text during streaming and posts the final response as a single message."
  [client event extra-history {:keys [channel-id message-ctx channel thread-ts thread bot-user-id prompt conversation-id]}
   {:keys [tool-name->friendly
           make-streaming-ai-request collect-viz-blocks feedback-blocks post-viz-error!
           make-viz-prefetch-callback cancel-prefetched-viz!]}]
  (let [{:keys [on-text on-tool-start set-status! current-text]}
        (make-channel-callbacks client {:channel              channel
                                        :thread-ts            thread-ts
                                        :tool-name->friendly  tool-name->friendly})
        prefetched-viz (atom {})
        on-data        (make-viz-prefetch-callback prefetched-viz)
        stored-msg-id  (atom nil)]
    (set-status! "Thinking...")
    (try
      (make-streaming-ai-request
       conversation-id
       prompt
       thread
       bot-user-id
       channel-id
       extra-history
       {:on-text              on-text
        :on-tool-start        on-tool-start
        :on-tool-end          nil
        :on-data              on-data
        :req-slack-msg-id     (:ts event)
        :get-res-slack-msg-id nil
        :request-prompt       (channel-request-prompt prompt)
        :stored-msg-id        stored-msg-id})
      (when (seq @prefetched-viz)
        (set-status! "Rendering results..."))
      (let [{:keys [blocks errors]} (collect-viz-blocks @prefetched-viz)
            answer-text             (str/trim @current-text)
            final-text              (if (or (seq answer-text) (seq blocks))
                                      answer-text
                                      "I wasn't able to generate a response. Please try again.")
            final-blocks            (into (into (final-text-blocks final-text) blocks)
                                          (feedback-blocks conversation-id))
            res                     (slackbot.client/post-thread-reply client {:channel channel :thread_ts thread-ts}
                                                                       final-text :blocks final-blocks)]
        (when-let [res-ts (:ts res)]
          (metabot.persistence/set-response-slack-msg-id! @stored-msg-id res-ts))
        (when-not (:ok res)
          (log/errorf "[slackbot] channel post-message failed: %s (block_count=%d block_types=%s response_messages=%s)"
                      (:error res)
                      (count (or final-blocks []))
                      (pr-str (when final-blocks (mapv :type final-blocks)))
                      (pr-str (get-in res [:response_metadata :messages]))))
        (doseq [e errors]
          (post-viz-error! client channel thread-ts e)))
      (catch Exception e
        (cancel-prefetched-viz! prefetched-viz)
        (log/error e "[slackbot] Error in channel response")
        (set-status! nil)
        (let [res (slackbot.client/post-thread-reply client message-ctx
                                                     "Something went wrong. Please try again.")]
          (when-not (:ok res)
            (log/errorf "[slackbot] channel error post-message failed: %s" (:error res))))))))
