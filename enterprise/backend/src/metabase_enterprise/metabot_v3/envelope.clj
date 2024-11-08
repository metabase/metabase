(ns metabase-enterprise.metabot-v3.envelope
  "(Because 'context' was already taken.)

  The 'envelope' holds the context for our conversation with the LLM. Specifically, it bundles up the history, the
  reactions, and the context into one convenient location, with a simple API for querying and modifying."
  (:require [metabase-enterprise.metabot-v3.tools :as tools]
            [metabase-enterprise.metabot-v3.tools.registry :as tools.registry]
            [metabase.util :as u]))

(def ^:constant max-round-trips
  "The maximum number of times we'll make a request to the LLM before responding to the user. Currently we'll just throw
  an exception if this limit is exceeded."
  6)

(defn create
  "Create a fresh envelope from a context and history. This envelope should be used for the lifetime of the request."
  [context history]
  {:history history
   :context context
   :reactions []
   :max-round-trips max-round-trips
   :round-trips-remaining max-round-trips})

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
          (:reactions e))))

(defn add-reactions
  "Add new reactions to the envelope."
  [e reactions]
  (update e :reactions into reactions))

(defn add-user-message
  "Given a user message (a string) adds it to the envelope."
  [e msg]
  (update e :history conj {:role :user :content msg}))

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))

(defn add-tool-response
  "Given an output string and a collection of reactions, adds them to the envelope."
  [e tool-call-id output]
  (cond-> e
    output (add-message {:role :tool :tool-call-id tool-call-id :content output})))

(defn is-tool-call?
  "Is this message a tool call?"
  [{:keys [tool-calls]}]
  (boolean (seq tool-calls)))

(defn is-tool-call-response?
  "Is this message a response to a tool call?"
  [{:keys [role tool-call-id]}]
  (and (= role :tool)
       tool-call-id))

(defn is-user-message?
  "Is this message from the user?"
  [{:keys [role]}]
  (= role :user))

(defn is-assistant-message?
  "Is this message from the assistant (i.e. the LLM)?"
  [{:keys [role]}]
  (= role :assistant))

(defn requires-llm-response?
  "Does this envelope require a new response from the LLM?

  True in two cases:
  - one, we've responded to all tool calls in the previous LLM response
  - two, we have a message from the user"
  [e]
  (let [tool-call-responses (->> e history reverse (take-while is-tool-call-response?))
        all-tool-calls-handled? (and
                                 (seq tool-call-responses)
                                 (= (map :tool-call-id tool-call-responses)
                                    (map :id (:tool-calls (->> e history reverse (take-while is-assistant-message?))))))
        last-message (peek (history e))]
    (or all-tool-calls-handled?
        (is-user-message? last-message))))

(defn tool-calls-requiring-invocation
  "Gets a list of all the tool calls in the chat history that have not yet been invoked."
  [e]
  (let [last-msg (peek (history e))]
    (when (is-tool-call? last-msg)
      (filter tools/requires-invocation? (:tool-calls last-msg)))))

(defn tool-calls
  "Get a list of all tool calls still requiring invocation. Intended to be sent to the FE."
  [e]
  (->> (tool-calls-requiring-invocation e)
       (map #(assoc % :tool-info (tools.registry/resolve-tool (:name %))))))

(defn requires-tool-invocation?
  "Does the env require tool invocation?"
  [e]
  (seq (tool-calls-requiring-invocation e)))
