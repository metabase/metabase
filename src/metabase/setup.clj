(ns metabase.setup)

(defonce ^:private setup-token
  (atom nil))

(defn token-value
  "Return the value of the setup token, if any."
  []
  @setup-token)

(defn token-match?
  "Function for checking if the supplied string matches our setup token.
   Returns boolean `true` if supplied token matches `@setup-token`, `false` otherwise."
  [token]
  {:pre [(string? token)]}
  (= token @setup-token))

(defn create-token!
  "Create and set a new `@setup-token`.
   Returns the newly created token."
  []
  (reset! setup-token (str (java.util.UUID/randomUUID))))

(defn clear-token!
  "Clear the `@setup-token` if it exists and reset it to nil."
  []
  (reset! setup-token nil))
