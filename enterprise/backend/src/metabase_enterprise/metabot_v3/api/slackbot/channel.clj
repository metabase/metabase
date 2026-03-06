(ns metabase-enterprise.metabot-v3.api.slackbot.channel
  "Visible Slack channel reply/update flow for metabot."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.api.slackbot.client :as slackbot.client]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def ^:private min-flush-interval-ms
  "Minimum milliseconds between consecutive channel progress updates."
  600)

(def ^:private channel-response-style-suffix
  (str "\n\n"
       "For this Slack channel response: the user already saw tool progress updates. "
       "Do not narrate the steps you took, do not recap tool calls, and do not include preambles like "
       "\"I'll...\", \"Let me...\", or \"I found...\". Give a brief final answer focused on the result in "
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

(defn- progress-text
  "Build the in-progress text shown in a visible channel reply."
  [thinking-placeholder status text]
  (let [parts (cond-> []
                (seq status) (conj (str "_" status "_"))
                (seq text)   (conj text))]
    (or (not-empty (str/join "\n\n" parts))
        thinking-placeholder)))

(defn- progress-blocks
  "Build blocks for an in-progress visible channel reply."
  [thinking-placeholder status text]
  [{:type "section"
    :text {:type "mrkdwn"
           :text (progress-text thinking-placeholder status text)}}])

(defn- post-thread-reply
  "Post a threaded Slack reply using the provided message context."
  [client message-ctx text blocks]
  (slackbot.client/post-message client
                                (cond-> (assoc message-ctx :text text)
                                  blocks (assoc :blocks blocks))))

(defn- log-send-failure
  [op-label res blocks]
  (log/warnf "[slackbot] %s failed: %s (block_count=%d block_types=%s response_messages=%s)"
             op-label
             (:error res)
             (count (or blocks []))
             (pr-str (when blocks (mapv :type blocks)))
             (pr-str (get-in res [:response_metadata :messages]))))

(defn- update-message
  "Update an existing Slack message with the full intended payload."
  [client channel message-ts op-label text blocks]
  (let [res (slackbot.client/update-message client
                                            (cond-> {:channel channel
                                                     :ts      message-ts
                                                     :text    text}
                                              blocks (assoc :blocks blocks)))]
    (when-not (:ok res)
      (log-send-failure op-label res blocks))
    res))

(defn make-channel-callbacks
  "Create callback functions that update a single visible threaded reply in channels.
   Channel replies only surface tool-status updates progressively; text is accumulated
   and sent once in the final message update."
  [client {:keys [channel message-ts thinking-placeholder tool-name->friendly]}]
  (let [rendered-text     (atom thinking-placeholder)
        current-text      (atom "")
        current-status    (atom nil)
        update-failed?    (atom false)
        slack-writer      (agent nil
                                 :error-mode    :continue
                                 :error-handler (fn [_ e] (log/warn e "[slackbot] Async Slack update failed")))
        last-flush-timer  (volatile! nil)
        flush-progress!   (fn []
                            (when (and message-ts (not @update-failed?))
                              (let [rendered (progress-text thinking-placeholder @current-status nil)]
                                (when (not= rendered @rendered-text)
                                  (let [res (slackbot.client/update-message client {:channel channel
                                                                                    :ts      message-ts
                                                                                    :text    rendered
                                                                                    :blocks  (progress-blocks thinking-placeholder
                                                                                                              @current-status
                                                                                                              nil)})]
                                    (if (:ok res)
                                      (reset! rendered-text rendered)
                                      (do
                                        (reset! update-failed? true)
                                        (log/warnf "[slackbot] channel update failed: %s (channel=%s ts=%s)"
                                                   (:error res) channel message-ts))))))))]
    (letfn [(request-flush! ([] (request-flush! false))
              ([force?]
               (when (and message-ts (not @update-failed?))
                 (when (or force?
                           (nil? @last-flush-timer)
                           (>= (u/since-ms @last-flush-timer) min-flush-interval-ms))
                   (vreset! last-flush-timer (u/start-timer))
                   (send-off slack-writer (bound-fn* (fn [_] (flush-progress!) nil)))))))
            (set-status! [status]
              (reset! current-status status)
              (request-flush! true))
            (clear-status! []
              (reset! current-status nil)
              (request-flush! true))]
      {:on-text        (bound-fn* (fn [text]
                                    (when (seq text)
                                      (swap! current-text str text))))
       :on-tool-start  (fn [{:keys [tool-name]}]
                         (set-status! (str (tool-name->friendly tool-name) "...")))
       :on-tool-end    (constantly nil)
       :on-data        (constantly nil)
       :request-flush! request-flush!
       :set-status!    set-status!
       :clear-status!  clear-status!
       :slack-writer   slack-writer
       :current-text   current-text
       :update-failed? update-failed?})))

(defn send-channel-response
  "Send a visible threaded reply/update flow for non-DM Slack conversations."
  [client event extra-history {:keys [channel-id message-ctx channel thread-ts thread bot-user-id prompt conversation-id]}
   {:keys [thinking-placeholder tool-name->friendly
           make-streaming-ai-request collect-viz-blocks feedback-blocks post-viz-error!
           make-viz-prefetch-callback cancel-prefetched-viz!]}]
  (let [initial-response (slackbot.client/post-message client {:channel   channel
                                                               :thread_ts thread-ts
                                                               :text      thinking-placeholder})
        message-ts       (:ts initial-response)
        {:keys [on-text on-tool-start on-tool-end
                request-flush! set-status! clear-status! slack-writer current-text update-failed?]}
        (make-channel-callbacks client {:channel              channel
                                        :message-ts           message-ts
                                        :thinking-placeholder thinking-placeholder
                                        :tool-name->friendly  tool-name->friendly})
        prefetched-viz   (atom {})
        on-data          (make-viz-prefetch-callback prefetched-viz)]
    (when-not (:ok initial-response)
      (log/warnf "[slackbot] initial channel reply failed: %s (channel=%s thread_ts=%s)"
                 (:error initial-response) channel thread-ts))
    (try
      (let [_data-parts (make-streaming-ai-request
                         conversation-id
                         prompt
                         thread
                         bot-user-id
                         channel-id
                         extra-history
                         {:on-text              on-text
                          :on-tool-start        on-tool-start
                          :on-tool-end          on-tool-end
                          :on-data              on-data
                          :req-slack-msg-id     (:ts event)
                          :get-res-slack-msg-id (when message-ts (fn [] message-ts))
                          :request-prompt       (channel-request-prompt prompt)})]
        (request-flush! true)
        (when (seq @prefetched-viz)
          (set-status! "Rendering results..."))
        (await slack-writer)
        (let [{:keys [blocks errors]} (collect-viz-blocks client @prefetched-viz)
              answer-text             (str/trim @current-text)
              final-text              (if (or (seq answer-text) (seq blocks))
                                        answer-text
                                        "I wasn't able to generate a response. Please try again.")
              final-blocks            (into (into (final-text-blocks final-text) blocks)
                                            (feedback-blocks conversation-id))]
          (if (and message-ts (not @update-failed?))
            (let [update-result (update-message client
                                                channel
                                                message-ts
                                                "channel update-message"
                                                final-text
                                                final-blocks)]
              (when-not (:ok update-result)
                (let [fallback-result (post-thread-reply client
                                                         message-ctx
                                                         "I generated a response, but Slack could not render it. Please try again."
                                                         nil)]
                  (when-not (:ok fallback-result)
                    (log/errorf "[slackbot] channel fallback post-message failed after update error: %s" (:error fallback-result))))))
            (let [fallback-result (post-thread-reply client
                                                     message-ctx
                                                     "I generated a response, but Slack could not render it. Please try again."
                                                     nil)]
              (when-not (:ok fallback-result)
                (log/errorf "[slackbot] channel fallback post-message failed: %s" (:error fallback-result)))))
          (doseq [e errors]
            (post-viz-error! client channel thread-ts e))))
      (catch Exception e
        (cancel-prefetched-viz! prefetched-viz)
        (log/error e "[slackbot] Error in channel response")
        (clear-status!)
        (await slack-writer)
        (let [error-text "Something went wrong. Please try again."]
          (if (and message-ts (not @update-failed?))
            (let [update-result (slackbot.client/update-message client {:channel channel
                                                                        :ts      message-ts
                                                                        :text    error-text})]
              (when-not (:ok update-result)
                (let [fallback-result (post-thread-reply client
                                                         message-ctx
                                                         error-text
                                                         nil)]
                  (when-not (:ok fallback-result)
                    (log/errorf "[slackbot] channel cleanup fallback post-message failed: %s" (:error fallback-result))))))
            (let [fallback-result (post-thread-reply client
                                                     message-ctx
                                                     error-text
                                                     nil)]
              (when-not (:ok fallback-result)
                (log/errorf "[slackbot] channel cleanup fallback post-message failed: %s" (:error fallback-result))))))))))
