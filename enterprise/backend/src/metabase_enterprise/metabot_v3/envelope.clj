(ns metabase-enterprise.metabot-v3.envelope
  "(Because 'context' was already taken.)

  The 'envelope' holds the context for our conversation with the LLM. Specifically, it bundles up the history, and the
  context into one convenient location, with a simple API for querying and modifying."
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
   [metabase-enterprise.metabot-v3.reactions :as reactions]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]))

(def ^:constant max-round-trips
  "The maximum number of times we'll make a request to the LLM before responding to the user. Currently we'll just throw
  an exception if this limit is exceeded."
  6)

(defn create
  "Create a fresh envelope from a context and history. This envelope should be used for the lifetime of the request."
  ([base-context]
   (assoc base-context :dummy-history []))
  ([context history session-id]
   {:session-id session-id
    :history history
    :context context
    :max-round-trips max-round-trips
    :round-trips-remaining max-round-trips
    :dummy-history []}))

(defn full-history
  "History including the dummy tool invocations"
  [e]
  (concat (:dummy-history e) (:history e)))

(defn is-tool-call-response?
  "Is this message a response to a tool call?"
  [{:keys [role tool-call-id]}]
  (and (= role :tool)
       tool-call-id))

(defn- is-query? [content]
  (and (map? content)
       (contains? #{:query "query"} (:type content))))

(defn- stringified-content [{:keys [structured-content content]}]
  (or content
      (some-> structured-content json/encode)))

(defn- stringify-content [msg]
  (-> msg
      (dissoc :structured-content)
      (assoc :content (stringified-content msg))))

(defn- llm-message
  "Formats a message for the LLM. Removes things we don't want the LLM to see (e.g. `query`) and stringifies structured
  content."
  [msg]
  (-> msg
      stringify-content))

(defn llm-history
  "History shaped for the LLM"
  [e]
  (mapv llm-message (full-history e)))

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
                                         (let [msg (i18n/tru "I cannot answer your question.")]
                                           (throw (ex-info "Error: too many round trips."
                                                           {:envelope e
                                                            :assistant-message msg}))))))))

(defn history
  "Gets the history from the envelope."
  [e]
  (:history e))

(defn context
  "Gets the context from the envelope."
  [e]
  (:context e))

(defn state
  "Gets the state from the envelope."
  [e]
  (:state e))

(defn- message->reactions
  [msg]
  (let [message-reaction {:type :metabot.reaction/message
                          :repl/message-color :green
                          :repl/message-emoji "🤖"
                          :message (:content msg)}
        navigate-reaction (when-let [nav-path (:navigate-to msg)]
                            {:type :metabot.reaction/redirect
                             :url nav-path})]
    (filter some? [message-reaction navigate-reaction])))

(defn reactions
  "Gets the reactions from the envelope. Includes messages from the LLM itself if applicable."
  [e]
  (let [last-user-msg-idx (or (->> (history e)
                                   (map-indexed vector)
                                   (filter #(= (:role (second %)) :user))
                                   last
                                   first)
                              -1)
        llm-message-reactions (->> (history e)
                                   (drop (inc last-user-msg-idx))
                                   (filter #(= (:role %) :assistant))
                                   (filter #(not-empty (:content %)))
                                   (mapcat message->reactions)
                                   (into []))]
    (into llm-message-reactions (concat (:reactions e) (metabot-v3.context/create-reactions (:context e))))))

(defn add-user-message
  "Given a user message (a string) adds it to the envelope."
  [e msg]
  (update e :history conj {:role :user :content msg}))

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))

(defn add-dummy-message
  "Adds a message to the dummy history. This is sent to the LLM, but not part of the history we send to the frontend."
  [e msg]
  (update e :dummy-history conj msg))

(defn update-context
  "Given a new context, set it in the envelope."
  [e context]
  (cond-> e
    (some? context) (assoc :context context)))

(defn- update-reactions
  "Given reactions, add them to the envelope"
  [e reactions]
  (update e :reactions (fnil into []) reactions))

(defn add-tool-response
  "Given an output string and new context, adds them to the envelope."
  [e tool-call-id {:keys [output structured-output context reactions]}]
  (-> e
      (add-message (-> {:role :tool
                        :tool-call-id tool-call-id}
                       (m/assoc-some :content output)
                       (m/assoc-some :structured-content structured-output)))
      (update-context context)
      (update-reactions reactions)))

(defn is-tool-call?
  "Is this message a tool call?"
  [{:keys [tool-calls]}]
  (boolean (seq tool-calls)))

(defn find-query
  "Given an envelope and a query-id, find the query in the history."
  [e query-id]
  (->> e
       full-history
       (filter #(and (is-tool-call-response? %)
                     (-> % :structured-content is-query?)))
       (keep :structured-content)
       (filter #(= (:query_id %) query-id))
       first
       :query))

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
    (and (not (reactions/has-terminating-reaction? (:reactions e)))
         (or (is-tool-call-response? last-message)
             (is-user-message? last-message)))))

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
