(ns metabase-enterprise.metabot-v3.envelope
  "(Because 'context' was already taken.)

  The 'envelope' holds the context for our conversation with the LLM. Specifically, it bundles up the history, and the
  context into one convenient location, with a simple API for querying and modifying."
  (:require
   [metabase-enterprise.metabot-v3.context :as metabot-v3.context]
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
