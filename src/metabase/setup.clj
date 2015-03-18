(ns metabase.setup)


(def ^:private setup-token
  (atom nil))

(defn token-match?
  "Function for checking if the supplied string matches our setup token.
   Returns boolean `true` if supplied token matches `@setup-token`, `false` otherwise."
  [token]
  {:pre [(string? token)]}
  (= token @setup-token))

(defn token-create
  "Create and set a new `@setup-token`.
   Returns the newly created token."
  []
  (reset! setup-token (.toString (java.util.UUID/randomUUID))))

(defn token-clear
  "Clear the `@setup-token` if it exists and reset it to nil."
  []
  (reset! setup-token nil))


