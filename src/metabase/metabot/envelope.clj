(ns metabase.metabot.envelope
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

(defn user-message
  "Create a user message structure with `msg` as content."
  [msg]
  {:role :user :content msg})

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))
