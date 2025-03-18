(ns metabase-enterprise.metabot-v3.envelope
  "(Because 'context' was already taken.)

  The 'envelope' holds the context for our conversation with the LLM. Specifically, it bundles up the history, and the
  context into one convenient location, with a simple API for querying and modifying.")

(defn history
  "Gets the history from the envelope."
  [e]
  (:history e))

(defn state
  "Gets the state from the envelope."
  [e]
  (:state e))

(defn- message->reactions
  [msg]
  (let [message-reaction (when-let [message (not-empty (:content msg))]
                           {:type :metabot.reaction/message
                            :repl/message-color :green
                            :repl/message-emoji "🤖"
                            :message message})
        navigate-reaction (when-let [nav-path (:navigate-to msg)]
                            {:type :metabot.reaction/redirect
                             :url nav-path})]
    (remove nil? [message-reaction navigate-reaction])))

(defn reactions
  "Gets the reactions from the LLM."
  [messages]
  (into []
        (comp (filter #(= (:role %) :assistant))
              (mapcat message->reactions))
        messages))

(defn user-message
  "Create a user message structure with `msg` as content."
  [msg]
  {:role :user :content msg})

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))
