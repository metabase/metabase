(ns metabase-enterprise.metabot-v3.envelope
  "(Because 'context' was already taken.)

  The 'envelope' holds the context for our conversation with the LLM. Specifically, it bundles up the history, and the
  context into one convenient location, with a simple API for querying and modifying."
  (:require
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase.util :as u]))

(def ^:constant max-round-trips
  "The maximum number of times we'll make a request to the LLM before responding to the user. Currently we'll just throw
  an exception if this limit is exceeded."
  6)

(defn create
  "Create a fresh envelope from a context and history. This envelope should be used for the lifetime of the request."
  [context history session-id]
  {:session-id session-id
   :history history
   :context context
   :max-round-trips max-round-trips
   :round-trips-remaining max-round-trips})

(defn session-id
  "Get the session ID from the envelope"
  [e]
  (:session-id e))

(defn decrement-round-trips
  "Decrement the remaining allowed round trips to the LLM, erroring if the maximum was exceeded."
  [e]
  (update e :round-trips-remaining (fn [v]
                                     (u/prog1 (dec v)
                                       (when (neg? <>)
                                         (throw (ex-info "Error: too many round trips." {:envelope e})))))))

(defn history
  "Gets the history from the envelope."
  [e]
  (:history e))

(defn context
  "Gets the context from the envelope."
  [e]
  (:context e))

(defn- message->reaction
  [msg]
  {:type :metabot.reaction/message
   :repl/message-color :green
   :repl/message-emoji "🤖"
   :message (:content msg)})

(defn reactions
  "Gets the reactions from the envelope. Includes messages from the LLM itself if applicable."
  [e]
  (let [last-user-msg-idx (->> (history e)
                               (map-indexed vector)
                               (filter #(= (:role (second %)) :user))
                               last
                               first)
        llm-message-reactions (->> (history e)
                                   (drop (inc last-user-msg-idx))
                                   (filter #(= (:role %) :assistant))
                                   (filter #(not-empty (:content %)))
                                   (map message->reaction)
                                   (into []))]
    (into llm-message-reactions
          (metabot-v3.context/create-reactions (:context e)))))

(defn add-user-message
  "Given a user message (a string) adds it to the envelope."
  [e msg]
  (update e :history conj {:role :user :content msg}))

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))

(defn update-context
  "Given a new context, set it in the envelope."
  [e context]
  (assoc e :context context))

(defn add-tool-response
  "Given an output string and new context, adds them to the envelope."
  [e tool-call-id output context]
  (-> e
      (add-message {:role :tool
                    :tool-call-id tool-call-id
                    :content output})
      (update-context context)))

(defn is-tool-call?
  "Is this message a tool call?"
  [{:keys [tool-calls]}]
  (boolean (seq tool-calls)))

(defn is-tool-call-response?
  "Is this message a response to a tool call?"
  [{:keys [role tool-call-id]}]
  (and (= role :tool)
       tool-call-id))

(defn requires-tool-invocation?
  "Does this envelope require tool call invocation?"
  [e]
  (->> e history peek is-tool-call?))

(defn is-user-message?
  "Is this message from the user?"
  [{:keys [role]}]
  (= role :user))

(defn is-assistant-message?
  "Is this message from the assistant (i.e. the LLM)?"
  [{:keys [role]}]
  (= role :assistant))

(defn requires-llm-response?
  "Does this envelope require a new response from the LLM?"
  [e]
  (let [last-message (->> e history peek)]
    (or (is-tool-call-response? last-message)
        (is-user-message? last-message))))

(defn tool-calls-requiring-invocation
  "Gets a list of all the tool calls in the chat history that have not yet been responded to."
  [e]
  (let [tool-call-id->response (->> e
                                    history
                                    (filter is-tool-call-response?)
                                    (map :tool-call-id)
                                    (into #{}))]

    (->> (history e)
         (filter is-tool-call?)
         (mapcat :tool-calls)
         (remove #(tool-call-id->response (:id %))))))

(defn last-assistant-message->reaction
  "This is a bit hacky. Right now we only respond to the user with reactions. So we take the last assistant message and
  turn it into a reaction."
  [e]
  {:type :metabot.reaction/message
   :repl/message-color :green
   :repl/message-emoji "🤖"
   :message (->> e
                 history
                 (filter is-assistant-message?)
                 last
                 :content)})
