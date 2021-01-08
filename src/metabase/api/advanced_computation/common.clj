(ns metabase.api.advanced-computation.common
  "Common routines between the public and internal endpoints for /api/advanced_computation"
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [metabase.api.card :as api.card]
            [metabase.api.common :as api]
            [metabase.api.embed :as api.embed]
            [metabase.api.public :as api.public]
            [metabase.async.util :as async.u]
            [metabase.models.card :as card :refer [Card]]
            [metabase.query-processor :as qp]
            [metabase.query-processor.context :as qp.context]
            [metabase.query-processor.pivot :as pivot]
            [metabase.query-processor.store :as qp.store]
            [metabase.query-processor.streaming :as qp.streaming]
            [metabase.util :as u]
            [metabase.util.embed :as eu]
            [metabase.util.i18n :refer [tru]]
            [toucan.db :as db]))

(defn check-query-type
  "Check that a query type is of a specific type, for example pivot tables require MBQL queries"
  [expected-type query]
  (let [found-type (:type query)]
    (when (not= expected-type found-type)
      (throw (ex-info (tru "Queries must be of type ''{0}'', found ''{1}''" expected-type found-type) {:type found-type})))))

(defn- process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query rf init context]
  (if (a/poll! (qp.context/canceled-chan context))
    (ensure-reduced init)
    (qp/process-query-sync
     query
     {:canceled-chan (qp.context/canceled-chan context)
      :rff           (fn [_]
                       (fn
                         ([]        init)
                         ([acc]     acc)
                         ([acc row] (rf acc ((:row-mapping-fn context) row context)))))})))

(defn- process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [queries rf init context]
  (reduce
   (fn [acc query]
     (process-query-append-results query rf acc (assoc context
                                                       :pivot-column-mapping ((:column-mapping-fn context) query))))
   init
   queries))

(defn- append-queries-context
  "Update Query Processor `context` so it appends the rows fetched when running `more-queries`."
  [context more-queries]
  (cond-> context
    (seq more-queries)
    (update :rff (fn [rff]
                   (fn [metadata]
                     (let [rf (rff metadata)]
                       (fn
                         ([]        (rf))
                         ([acc]     (rf (process-queries-append-results more-queries rf acc context)))
                         ([acc row] (rf acc row)))))))))

(defn process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[first-query & more-queries] context]
  (qp/process-query first-query (append-queries-context context more-queries)))

(defn run-query
  "Run the pivot query. Unlike many query execution functions, this takes `context` as the first parameter to support
   its application via `partial`.

   You are expected to wrap this call in `qp.streaming/streaming-response` yourself."
  ([context query]
   (run-query context query {:executed-by api/*current-user-id*}))

  ([context query info]
   (qp.store/with-store
     (let [main-breakout           (:breakout (:query query))
           col-determination-query (pivot/add-grouping-field query main-breakout 0)
           all-expected-cols       (qp/query->expected-cols col-determination-query)
           all-queries             (pivot/generate-queries query)]
       (process-multiple-queries
        all-queries
        (assoc context
               :info (assoc info :context context)
               ;; this function needs to be executed at the start of every new query to
               ;; determine the mapping for maintaining query shape
               :column-mapping-fn (fn [query]
                                    (let [query-cols (map-indexed vector (qp/query->expected-cols query))]
                                      (map (fn [item]
                                             (some #(when (= (:name item) (:name (second %)))
                                                      (first %)) query-cols))
                                           all-expected-cols)))
               ;; this function needs to be called for each row so that it can actually
               ;; shape the row according to the `:column-mapping-fn` above
               :row-mapping-fn (fn [row context]
                                 ;; the first query doesn't need any special mapping, it already has all the columns
                                 (if-let [col-mapping (:pivot-column-mapping context)]
                                   (map (fn [mapping]
                                          (when mapping
                                            (nth row mapping)))
                                        col-mapping)
                                   row))))))))

(defn run-query-for-card-with-id-async
  "Run the query belonging to Card with `card-id` with `parameters` and other query options (e.g. `:constraints`).
  Returns a `StreamingResponse` object that should be returned as the result of an API endpoint."
  [card-id export-format parameters & options]
  {:pre [(integer? card-id)]}
  ;; run this query with full superuser perms
  ;;
  ;; we actually need to bind the current user perms here twice, once so `card-api` will have the full perms when it
  ;; tries to do the `read-check`, and a second time for when the query is ran (async) so the QP middleware will have
  ;; the correct perms
  (binding [api/*current-user-permissions-set* (atom #{"/"})]
    (apply api.card/run-query-for-card-async card-id export-format
           :parameters parameters
           :context    :public-question
           :run        (fn [query info]
                         (qp.streaming/streaming-response [{:keys [reducedf], :as context} export-format]
                           (check-query-type :query query)
                           (let [context  (assoc context :reducedf (api.public/public-reducedf reducedf))
                                 in-chan  (binding [api/*current-user-permissions-set* (atom #{"/"})]
                                            (run-query context query info))
                                 out-chan (a/promise-chan (map api.public/transform-results))]
                             (async.u/promise-pipe in-chan out-chan)
                             out-chan)))
           options)))

(defn public-dashcard-results-async
  "Return the results of running a query with `parameters` for Card with `card-id` belonging to Dashboard with
  `dashboard-id`. Throws a 404 immediately if the Card isn't part of the Dashboard. Returns a `StreamingResponse`."
  [dashboard-id card-id export-format parameters
   & {:keys [context constraints]
      :or   {context     :public-dashboard}}]
  (api.public/check-card-is-in-dashboard card-id dashboard-id)
  (let [params (api.public/resolve-params dashboard-id (if (string? parameters)
                                                         (json/parse-string parameters keyword)
                                                         parameters))]
    (run-query-for-card-with-id-async
     card-id export-format params
     :dashboard-id dashboard-id
     :context      context
     :constraints  constraints)))

(defn run-query-for-card-with-params-async
  "Run the query associated with Card with `card-id` using JWT `token-params`, user-supplied URL `query-params`,
   an `embedding-params` whitelist, and additional query `options`. Returns `StreamingResponse` that should be
  returned as the API endpoint result."
  {:style/indent 0}
  [& {:keys [export-format card-id embedding-params token-params query-params options]}]
  {:pre [(integer? card-id) (u/maybe? map? embedding-params) (map? token-params) (map? query-params)]}
  (let [merged-id->value (api.embed/validate-and-merge-params embedding-params token-params (api.embed/normalize-query-params query-params))
        parameters       (api.embed/apply-merged-id->value (api.embed/resolve-card-parameters card-id) merged-id->value)]
    (apply run-query-for-card-with-id-async
           card-id export-format parameters
           :context :embedded-question, options)))

(defn run-query-for-unsigned-token-async
  "Run the query belonging to Card identified by `unsigned-token`. Checks that embedding is enabled both globally and
  for this Card. Returns core.async channel to fetch the results."
  [unsigned-token export-format query-params & options]
  (let [card-id (eu/get-in-unsigned-token-or-throw unsigned-token [:resource :question])]
    (api.embed/check-embedding-enabled-for-card card-id)
    (run-query-for-card-with-params-async
      :export-format     export-format
      :card-id           card-id
      :token-params      (eu/get-in-unsigned-token-or-throw unsigned-token [:params])
      :embedding-params  (db/select-one-field :embedding_params Card :id card-id)
      :query-params      query-params
      :options           options)))

(defn dashcard-results-async
  "Return results for running the query belonging to a DashboardCard. Returns a `StreamingResponse`."
  {:style/indent 0}
  [& {:keys [dashboard-id dashcard-id card-id export-format embedding-params token-params
             query-params constraints]}]
  {:pre [(integer? dashboard-id) (integer? dashcard-id) (integer? card-id) (u/maybe? map? embedding-params)
         (map? token-params) (map? query-params)]}
  (let [merged-id->value (api.embed/validate-and-merge-params embedding-params token-params (api.embed/normalize-query-params query-params))
        parameters       (api.embed/apply-merged-id->value (api.embed/resolve-dashboard-parameters dashboard-id dashcard-id card-id)
                                                           merged-id->value)]
    (public-dashcard-results-async
     dashboard-id card-id export-format parameters
     :context     :embedded-dashboard
     :constraints constraints)))
