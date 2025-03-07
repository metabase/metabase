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
  (let [message-reaction {:type :metabot.reaction/message
                          :repl/message-color :green
                          :repl/message-emoji "🤖"
                          :message (:content msg)}
        navigate-reaction (when-let [nav-path (:navigate-to msg)]
                            {:type :metabot.reaction/redirect
                             :url nav-path})]
    (filter some? [message-reaction navigate-reaction])))

(defn reactions
  "Gets the reactions from the LLM."
  [e]
  (let [last-user-msg-idx (or (->> (history e)
                                   (map-indexed vector)
                                   (filter #(= (:role (second %)) :user))
                                   last
                                   first)
                              -1)]
    (->> (history e)
         (drop (inc last-user-msg-idx))
         (filter #(= (:role %) :assistant))
         (filter #(not-empty (:content %)))
         (mapcat message->reactions)
         (into []))))

(defn add-user-message
  "Given a user message (a string) adds it to the envelope."
  [e msg]
  (update e :messages (fnil conj []) {:role :user :content msg}))

(defn add-message
  "Given a raw message, add it to the envelope."
  [e msg]
  (update e :history conj msg))
