(ns metabase.slackbot.channel
  "Visible Slack channel reply/update flow for metabot."
  (:require
   [clojure.string :as str]
   [metabase.analytics-interface.core :as analytics]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.slackbot.blocks :as slackbot.blocks]
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

(def ^:private text-field-limit
  "Slack rejects a `chat.postMessage` whose `text` exceeds 40000 characters."
  40000)

(def ^:private fallback-prefix
  "I could not render the formatted response, so here it is as plain text:\n\n")

(def ^:private dropped-viz-suffix
  "\n\n_The visualizations could not be included._")

(defn- post-render-fallback!
  "Post the answer as plain text after Slack refused to render the block message. The DM path drops
   the text here (`streaming.clj`), but it has already delivered it via `chat.appendStream` -- the
   channel path has sent nothing yet, so dropping it would lose the answer outright.

   Takes the answer itself rather than the planned message's `:text`, which for a reply carrying
   only visualizations is the `Query results` notification preview -- posting that would deliver
   nothing at all. Plain text cannot carry the visualizations either, so say so when there were
   any, rather than dropping them silently."
  [client message-ctx text viz? feedback-blocks]
  (let [body (if (str/blank? text)
               "I generated a response, but Slack could not render it. Please try again."
               (str fallback-prefix
                    (u.str/elide text (- text-field-limit (count fallback-prefix) (count dropped-viz-suffix)))))
        body (cond-> body viz? (str dropped-viz-suffix))
        res  (slackbot.client/post-thread-reply client message-ctx body
                                                :blocks (not-empty feedback-blocks))]
    (when-not (:ok res)
      (log/errorf "[slackbot] channel fallback post-message failed: %s" (:error res)))
    res))

(defn- conversation-url
  "Web UI link to a Metabot conversation, or nil on an instance with no site URL configured.

   The route is declared in `frontend/src/metabase/urls/metabot.ts` (`CONVERSATION_BASE_PATH` and
   `metabotConversation`). There is no shared source, so a rename there has to be mirrored here."
  [conversation-id]
  (when-let [base (system/site-url)]
    (str base "/metabot/conversation/" conversation-id)))

(defn- post-message!
  "Post one planned message, logging Slack's rejection detail when it refuses the blocks."
  [client channel thread-ts {:keys [text blocks]}]
  (let [res (slackbot.client/post-thread-reply client {:channel channel :thread_ts thread-ts}
                                               (u.str/elide text text-field-limit)
                                               :blocks blocks)]
    (when-not (:ok res)
      (log/errorf "[slackbot] channel post-message failed: %s (block_count=%d block_types=%s response_messages=%s)"
                  (:error res)
                  (count blocks)
                  (pr-str (mapv :type blocks))
                  (pr-str (get-in res [:response_metadata :messages]))))
    res))

(defn- make-channel-callbacks
  "Create callback functions for channel replies.
   Uses the Slack assistant setStatus API for progress indication.
   Text is accumulated and sent once the answer is complete."
  [client {:keys [channel thread-ts tool-name->friendly]}]
  (let [current-text (atom "")]
    (letfn [(set-status! [status]
              (try
                (slackbot.client/set-status
                 client (if status
                          {:status           "is doing science..."
                           :channel-id       channel
                           :thread-ts        thread-ts
                           :loading-messages [status]}
                          ;; An empty `status` is how assistant.threads.setStatus clears the
                          ;; indicator. `loading-messages` is left out: `client/set-status` only
                          ;; sends the key when it is truthy.
                          {:status     ""
                           :channel-id channel
                           :thread-ts  thread-ts}))
                (catch Exception e
                  (log/warnf "[slackbot] set-status failed (channel=%s thread-ts=%s): %s" channel thread-ts (ex-message e)))))]
      ;; Every text part from every round of the agent loop lands here, so the accumulated answer
      ;; routinely outgrows one Slack message -- see `slackbot.blocks/message-payloads`.
      {:on-text       (bound-fn* (fn [text]
                                   (when (seq text)
                                     (swap! current-text str text))))
       :on-tool-start (fn [{:keys [tool-name]}]
                        (set-status! (str (tool-name->friendly tool-name "Thinking") "...")))
       :set-status!   set-status!
       :current-text  current-text})))

(defn send-channel-response
  "Send a visible threaded reply for non-DM Slack conversations.
   Accumulates AI text during streaming and posts the finalized response."
  [client event extra-history {:keys [channel-id message-ctx channel thread-ts auth-info thread bot-user-id prompt conversation-id]}
   {:keys [tool-name->friendly
           make-streaming-ai-request collect-viz-blocks feedback-blocks post-viz-error!
           make-viz-prefetch-callback cancel-prefetched-viz!]}]
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
        (let [{:keys [blocks errors]}       (collect-viz-blocks @prefetched-viz)
              answer-text                   (str/trim @current-text)
              final-text                    (if (or (seq answer-text) (seq blocks))
                                              answer-text
                                              "I wasn't able to generate a response. Please try again.")
              feedback                      (feedback-blocks conversation-id message-external-id)
              {:keys [message truncated?]}  (slackbot.blocks/message-payloads final-text blocks feedback
                                                                              (conversation-url conversation-id))]
          (when truncated?
            (analytics/inc! :metabase-slackbot/responses-truncated))
          ;; One message, always: the truncation notice rides inside it, so there is exactly one
          ;; `ts` to record and exactly one thing for a delete to resolve to.
          (let [posted (post-message! client channel thread-ts message)
                ;; Slack returns `{:ok false}` rather than throwing, so without a fallback the
                ;; thread just goes quiet. Plain text cannot be rejected the way the blocks were.
                res    (if (:ok posted)
                         posted
                         (do (set-status! nil)
                             (post-render-fallback! client message-ctx final-text (seq blocks) feedback)))]
            ;; The feedback buttons ride this message, so it is the one a rating or a delete has
            ;; to resolve to.
            (when-let [res-ts (:ts res)]
              (metabot.persistence/set-response-slack-msg-id! assistant-msg-id res-ts)))
          (doseq [e errors]
            (post-viz-error! client channel thread-ts e))))
      (catch Exception e
        (cancel-prefetched-viz! prefetched-viz)
        (log/errorf "[slackbot] Error in channel response: %s" (ex-message e))
        (set-status! nil)
        (let [res (slackbot.client/post-thread-reply client message-ctx
                                                     "Something went wrong. Please try again.")]
          (when-not (:ok res)
            (log/errorf "[slackbot] channel error post-message failed: %s" (:error res))))))))
