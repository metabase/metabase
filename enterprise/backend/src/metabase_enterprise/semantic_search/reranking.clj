(ns metabase-enterprise.semantic-search.reranking
  "Voyage cross-encoder reranking client for semantic search.

  A single direct-Voyage client (POST api.voyageai.com/v1/rerank, `Authorization: Bearer`), deliberately
  *without* the provider multimethod of [[metabase-enterprise.semantic-search.embedding]] -- the ai-service
  proxy `/v1/rerank` route is unverified and out of scope, so this is one fn, not a `dispatch-provider`.

  This is the relevance-ordering (precision) step layered on top of RRF's recall/pool selection: the caller
  (`query-index`) takes the top-N of the permission-filtered, boost-scored candidate list, hands their
  `content` here, and reblends the returned per-doc relevance scores. Reranking cannot surface a target the
  SQL never returned -- it only reorders the pool."
  (:require
   [clj-http.client :as http]
   [metabase-enterprise.semantic-search.settings :as semantic-settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.retry :as retry]))

(set! *warn-on-reflection* true)

(def ^:private voyage-rerank-url "https://api.voyageai.com/v1/rerank")

(def ^:private max-rerank-retries
  "Retry budget for a rate-limited / transient Voyage call. Deliberately small: the rerank runs
  synchronously inside a single `/api/search` request, so the cumulative backoff must stay well under
  the client request timeout. Four retries over the default 500ms-base exponential backoff is ~7.5s of
  sleeping -- enough to ride out a short 429 burst without blowing the request budget. Sustained
  rate-limit saturation still surfaces (the last attempt rethrows) rather than blocking indefinitely."
  4)

(defn- retryable-rerank-error?
  "True when a failed Voyage rerank call should be retried: a 429 (rate limit), a provider 5xx, or a
  transport-level error (connection reset / timeout, which carries no HTTP status in its ex-data). Real
  client errors (400/401/422) carry a 4xx status and are not retried."
  [e]
  (let [status (:status (ex-data e))]
    (or (nil? status)
        (= 429 status)
        (<= 500 status 599))))

(defn rerank
  "Rerank `documents` (a vector of strings) against `query` with the Voyage cross-encoder.

  Returns `{:order [doc-idx ...] :scores {doc-idx relevance-score} :tokens n}` where `:order` is the document
  indices best-first and `:scores` maps each index to its [0,1] relevance score. `total_tokens` is the
  provider-reported usage (the billable figure, not a local estimate).

  Options: `:model` (defaults to the `ee-reranking-model` setting) and `:top-k`. `:top-k` is left unset by
  default so Voyage returns *all* documents reordered -- truncating the final result list is the caller's job
  (it must keep the count above the min-results threshold so the appdb fallback stays predictable). Throws if
  the API key is unset."
  [query documents {:keys [model top-k] :or {model (semantic-settings/ee-reranking-model)}}]
  (let [api-key (semantic-settings/ee-reranking-api-key)]
    (when (empty? api-key)
      (throw (ex-info "ee-reranking-api-key not set" {})))
    (let [body (cond-> {:model model :query query :documents documents :truncation true}
                 top-k (assoc :top_k top-k))
          ;; Retry the provider round-trip on rate-limit (429) / 5xx / transport errors with the house
          ;; exponential backoff. `:max-retries` is pinned here rather than taken from the global
          ;; `retry-max-retries` setting (which defaults to 0 in dev, where the eval runs) so the rerank
          ;; actually retries regardless of environment; the backoff curve + jitter are still operator-tunable.
          resp (-> (retry/with-retry (assoc (retry/retry-configuration)
                                            :max-retries max-rerank-retries
                                            :retry-if    (fn [_result e]
                                                           (boolean (and e (retryable-rerank-error? e))))
                                            :on-retry    (fn [_result e]
                                                           (log/warn e "Voyage rerank call failed; retrying")))
                     (http/post voyage-rerank-url
                                {:headers {"Authorization" (str "Bearer " api-key)
                                           "Content-Type"  "application/json"}
                                 :body    (json/encode body)}))
                   :body
                   (json/decode true))
          data (:data resp)]
      (log/debug "Voyage rerank" {:model model :documents (count documents) :tokens (get-in resp [:usage :total_tokens])})
      {:order  (mapv :index data)
       :scores (into {} (map (juxt :index :relevance_score)) data)
       :tokens (get-in resp [:usage :total_tokens] 0)})))
