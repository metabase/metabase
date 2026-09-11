(ns metabase.slackbot.channel
  "Visible Slack channel reply/update flow for metabot."
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.client :as slackbot.client]
   [metabase.system.core :as system]
   [metabase.util.log :as log]
   [metabase.util.string :as u.str]))

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

(def section-text-limit
  "Slack rejects a `section` block whose `text.text` exceeds this many characters.
   The whole `chat.postMessage` fails with `invalid_blocks`.
   See https://docs.slack.dev/reference/block-kit/blocks/section-block."
  3000)

(def markdown-text-limit
  "Slack documents this as \"the cumulative limit for all `markdown` blocks in a single payload\" in characters.
   Today Slack enforces the figure per block rather than cumulatively.
   Budgeting cumulatively is a deliberate choice: enforcement can catch up with the documentation
   without notice, which would turn messages that fit today into rejections.
   See https://docs.slack.dev/reference/block-kit/blocks/markdown-block
       https://github.com/metabase/metabase/pull/80652#discussion_r3861967932."
  12000)

(defn- final-text-blocks
  "Build the leading text block(s) for a finalized non-streaming Slack message."
  [text]
  (if (str/blank? text)
    []
    ;; Slack expands one `markdown` block into several as it renders: a heading becomes a `header`,
    ;; a thematic break a `divider`, a table a `table` -- and those count against the 50-block limit.
    [{:type "markdown"
      :text text}]))

(defn- truncation-notice
  "Copy explaining that an answer was cut short.
   `url` points at the Metabase instance; nil leaves the sentence standing without a link."
  [url]
  (str "_This answer was longer than " markdown-text-limit " characters. That is too long to post in "
       "Slack, so I cut it short._\n\n"
       "Ask a narrower question so the answer comes back smaller"
       (if url
         (str ", or head to <" url "|Metabase> and try again.")
         ".")))

(defn- truncation-block
  "A muted aside explaining a cut answer, for the same message the answer was posted in."
  []
  ;; `context` rather than a second section: Slack renders it small and grey, so it reads as an
  ;; aside about the answer rather than as part of it.
  ;;
  ;; The instance home page, not the conversation that produced the answer: picking a Slack thread
  ;; back up on the web is not supported, so a deep link would only lead somewhere that cannot help.
  ;; `site-url` is guaranteed to carry no trailing slash, so it stands as a link on its own.
  {:type     "context"
   :elements [{:type "mrkdwn"
               :text (truncation-notice (system/site-url))}]})

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
                  (log/warnf "[slackbot] set-status failed (channel=%s thread-ts=%s): %s" channel thread-ts (ex-message e)))))]
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
  [client event extra-history {:keys [channel-id message-ctx channel thread-ts auth-info thread bot-user-id prompt conversation-id]}
   {:keys [tool-name->friendly
           make-streaming-ai-request collect-viz-blocks feedback-blocks post-viz-error!
           make-viz-prefetch-callback cancel-prefetched-viz! error-message]}]
  (let [{:keys [on-text on-tool-start set-status! current-text]}
        (make-channel-callbacks client {:channel              channel
                                        :thread-ts            thread-ts
                                        :tool-name->friendly  tool-name->friendly})
        prefetched-viz (atom {})
        on-data        (make-viz-prefetch-callback prefetched-viz)]
    (set-status! "Thinking...")
    (try
      (let [{message-external-id :external-id assistant-msg-id :msg-id}
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
              :team-id              (:team_id auth-info)
              :thread-ts            thread-ts
              :req-slack-msg-id     (:ts event)
              :get-res-slack-msg-id nil
              :request-prompt       (channel-request-prompt prompt)})]
        (when (seq @prefetched-viz)
          (set-status! "Rendering results..."))
        (let [{:keys [blocks errors]} (collect-viz-blocks @prefetched-viz)
              answer-text             (str/trim @current-text)
              answer                  (if (or (seq answer-text) (seq blocks))
                                        answer-text
                                        "I wasn't able to generate a response. Please try again.")
              ;; `final-text` doubles as the message's `:text` -- Slack's notification preview, and
              ;; what `streaming/thread->history` replays to the model as the assistant's own words.
              ;; The notice stays out of it, so the model is never told it said this.
              final-text              (u.str/elide answer markdown-text-limit)
              ;; Derived rather than re-tested: `elide` returns `answer` itself when it fits, so
              ;; the notice cannot disagree with whether a cut actually happened.
              truncated?              (not= final-text answer)
              final-blocks            (-> (final-text-blocks final-text)
                                          (cond-> truncated? (conj (truncation-block)))
                                          (into blocks)
                                          (into (feedback-blocks conversation-id message-external-id)))
              res                     (slackbot.client/post-thread-reply client {:channel channel :thread_ts thread-ts}
                                                                         final-text :blocks final-blocks)]
          (when truncated?
            (log/infof "[slackbot] channel answer truncated (answer_length=%d limit=%d)"
                       (count answer) markdown-text-limit)
            (analytics/inc! :metabase-slackbot/responses-truncated))
          (when-let [res-ts (:ts res)]
            (metabot.persistence/set-response-slack-msg-id! assistant-msg-id res-ts))
          (when-not (:ok res)
            (log/errorf "[slackbot] channel post-message failed: %s (block_count=%d block_types=%s response_messages=%s)"
                        (:error res)
                        (count final-blocks)
                        (pr-str (mapv :type final-blocks))
                        (pr-str (get-in res [:response_metadata :messages])))
            ;; The blocks were rejected for a reason we did not anticipate. A plain-text reply
            ;; carries no blocks for Slack to reject, so the user gets something back rather than
            ;; silence (BOT-1606).
            (let [fallback (slackbot.client/post-thread-reply
                            client message-ctx
                            "I generated a response, but Slack could not render it. Please try again.")]
              (when-not (:ok fallback)
                (log/errorf "[slackbot] channel fallback post-message failed: %s" (:error fallback))
                (analytics/inc! :metabase-slackbot/responses-undeliverable))))
          (doseq [e errors]
            (post-viz-error! client channel thread-ts e))))
      (catch Exception e
        (cancel-prefetched-viz! prefetched-viz)
        (log/errorf "[slackbot] Error in channel response: %s" (ex-message e))
        (set-status! nil)
        (let [res (slackbot.client/post-thread-reply client message-ctx (error-message (ex-data e)))]
          (when-not (:ok res)
            (log/errorf "[slackbot] channel error post-message failed: %s" (:error res))))))))
