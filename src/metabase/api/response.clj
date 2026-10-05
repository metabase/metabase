(ns metabase.api.response)

(set! *warn-on-reflection* true)

(def response-unauthentic
  "Generic `401 (Unauthenticated)` Ring response map."
  {:status 401, :body "Unauthenticated"})

(def response-forbidden
  "Generic `403 (Forbidden)` Ring response map."
  {:status 403, :body "Forbidden"})

(def ^:private ex-data-response-keys
  "The `ex-data` keys an API error response echoes to the client. Everything else in `ex-data` is server-side context
  (queries, permissions, ids) that the exception-to-response drops."
  #{;; `defendpoint` parameter validation
    :errors
    :specific-errors
    ;; a machine-readable code the client dispatches on; both spellings are in use
    :error-code
    :error_code
    ;; messages and statuses clients render or dispatch on
    :message
    :status
    :error
    :error_message
    :field
    ;; SCIM error responses
    :schemas
    :detail
    ;; remote-sync branch and dirty-content guards
    :branch_mismatch
    :current_branch
    :conflicts
    :dirty_objects
    ;; what a validation error expected, so the client can explain how to fix the request
    :allowed-models
    :allowed-parameters
    :invalid-parameter
    :allowed-namespaces
    :collection-namespace
    :expected-type
    :expected
    :actual
    :base-type
    :effective-type
    :coercion-strategy
    :tables})

(def ^:private response-authored-markers
  "A truthy value under one of these keys means the throw site wrote its whole `ex-data` as the response: the
  agent-facing diagnostics of `agent-lib` and the metabot tools, and the LLM provider errors. Everything in it is sent."
  #{:agent-error? :api-error})

(defn ex-data->response-data
  "The part of an exception's `ex-data` that may be sent to an API client: all of it when the throw site marked it as
  authored for the client (see [[response-authored-markers]]), otherwise only [[ex-data-response-keys]]."
  [data]
  (if (some #(get data %) response-authored-markers)
    data
    (select-keys data ex-data-response-keys)))

(defn throwable->response-map
  "[[clojure.core/Throwable->map]] with the `ex-data` of every exception in the chain dropped, except that the root
  cause's `:data` keeps its [[ex-data->response-data]] (with its `:status-code`, when there is any): the message,
  cause chain and stacktrace of `e` in the shape API error responses use."
  [^Throwable e]
  (let [{:keys [data], :as m} (Throwable->map e)
        response-data         (ex-data->response-data data)]
    (-> m
        (dissoc :data)
        (cond-> (seq response-data) (assoc :data (merge response-data (select-keys data [:status-code]))))
        (update :via (fn [via]
                       (mapv #(dissoc % :data) via))))))
