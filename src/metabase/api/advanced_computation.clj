(ns metabase.api.advanced-computation
  "/api/advanced_computation endpoints, like pivot table generation"
  (:require [cheshire.core :as json]
            [clojure.core.async :as a]
            [compojure.core :refer [POST]]
            [metabase.api
             [card :as api.card]
             [common :as api]]
            [metabase.models.database :as database :refer [Database]]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [context :as qp.context]
             [pivot :as pivot]
             [store :as qp.store]
             [streaming :as qp.streaming]]
            [metabase.query-processor.middleware.cache :as cache]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

;; TODO: FIX THIS TO WORK WITH ASYNC

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
  "Run the pivot query"
  ([query]
   (run-query query {:executed-by api/*current-user-id*}))

  ([query info]
   (qp.streaming/streaming-response [qp-context :api]
     (qp.store/with-store
       (let [main-breakout           (:breakout (:query query))
             col-determination-query (-> query
                                         ;; TODO: move this to a bitmask or something that scales better / easier to use
                                         (assoc-in [:query :expressions] {"pivot-grouping" [:ltrim (json/generate-string main-breakout)]})
                                         (assoc-in [:query :fields] [[:expression "pivot-grouping"]]))
             all-expected-cols       (qp/query->expected-cols (qp/query->preprocessed col-determination-query))
             all-queries             (pivot/generate-queries query)
             first-query             (first all-queries)
             rest-queries            (rest all-queries)]
         (process-multiple-queries
          (concat [first-query] rest-queries)
          (assoc qp-context
                 :info (assoc info :context qp-context)
                 ;; this function needs to be executed at the start of every new query to
                 ;; determine the mapping for maintaining query shape
                 :column-mapping-fn (fn [query]
                                      (let [query-cols (map-indexed vector (qp/query->expected-cols (qp/query->preprocessed query)))]
                                        (map (fn [item]
                                               (some #(when (= (:name item) (:name (second %)))
                                                        (first %)) query-cols))
                                             all-expected-cols)))
                 ;; this function needs to be called for each row so that it can actually
                 ;; shape the row according to the `:column-mapping-fn` above
                 :row-mapping-fn (fn [row context]
                                  ;; the first query doesn't need any special mapping, it already has all the columns
                                   (let [col-mapping (:pivot-column-mapping context)]
                                     (if col-mapping
                                       (map (fn [mapping]
                                              (when mapping
                                                (nth row mapping)))
                                            (:pivot-column-mapping context))
                                       row))))))))))

(api/defendpoint POST "/pivot/dataset"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys      [database]
         query-type :type
         :as        query} :body}]
  {database (s/maybe s/Int)}

  (when-not database
    (throw (Exception. (str (tru "`database` is required for all queries.")))))
  (api/read-check Database database)

  (run-query (assoc query :async? true)))

(api/defendpoint ^:streaming POST "/pivot/card/:card-id/query"
  "Run the query associated with a Card."
  [card-id :as {{:keys [parameters ignore_cache]
                 :or   {ignore_cache false}} :body}]
  {ignore_cache (s/maybe s/Bool)}
  (binding [cache/*ignore-cached-results* ignore_cache]
    (api.card/run-query-for-card-async card-id :api, :parameters parameters, :run run-query)))

(api/define-routes)
