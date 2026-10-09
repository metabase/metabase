(ns metabase.util.api-error
  "Which parts of an exception's `ex-data` an API error response may send to the client.

  The API error handling ([[metabase.server.middleware.exceptions]], [[metabase.server.streaming-response]]) sends only
  client-facing keys of the ex-data. Everything else is server-side context (queries, ids, permissions) that stays out
  of the response, so each client-facing key is opted in rather than secrets being opted out. Keys keep their names, so
  code reading the ex-data is unaffected by what is sent.

  ## Keys always sent

  These are idiomatically sent whenever they are present, without being listed (see [[default-response-keys]]):

  - `:message`, `:error_message` a human-readable message, sent in place of the exception's own message
  - `:error`                      a human-readable message
  - `:errors`                     validation errors, usually field name -> message, with `:_error` for the whole form
  - `:error-code`, `:error_code`  a machine-readable error code; with a non-500 status the response has no stacktrace

  `:status-code` is not sent as a key: it becomes the response's HTTP status.

  ## Sending other keys

  List them under `:response/keys`:

    (throw (ex-info (tru \"Invalid {0}\" label) {:status-code 400, :field key, :card-id id, :response/keys #{:field}}))

  responds with `{:field ...}`, keeping `:card-id` server-side. When the data comes from elsewhere, like ex-data being
  rethrown, use [[extend-response-keys]], which adds to the keys already listed instead of replacing them.")

(defn extend-response-keys
  "Add `ks` to the `:response/keys` of `data`, the keys that are sent to the client, keeping any already listed. For
  data built elsewhere, like ex-data being rethrown; with a map literal, put `:response/keys` in it instead.

    (throw (ex-info (ex-message e) (merge {:status-code 400} (api-error/extend-response-keys (ex-data e) :details)) e))"
  [data & ks]
  (cond-> data
    (seq ks) (update :response/keys (fnil into #{}) ks)))

(def ^:private default-response-keys
  "Keys sent to the client whenever they are present in ex-data, without being listed under `:response/keys`."
  #{:message :error_message :error :errors :error-code :error_code})

(defn response-data
  "The client-facing part of an exception's `data`: the entries for its listed keys and [[default-response-keys]]."
  [data]
  (select-keys data (into default-response-keys (:response/keys data))))

(defn throwable->map
  "[[clojure.core/Throwable->map]] with each `:data` (the root cause's, and every `:via` entry's) reduced to its
  [[response-data]] and `:status-code`, dropping it when there is neither."
  [^Throwable e]
  (let [filter-data (fn [x]
                      (let [data (merge (response-data (:data x))
                                        (select-keys (:data x) [:status-code]))]
                        (if (seq data)
                          (assoc x :data data)
                          (dissoc x :data))))]
    (-> (Throwable->map e)
        filter-data
        (update :via #(mapv filter-data %)))))
