(ns metabase.api.advanced-computation
  "/api/advanced_computation endpoints, like pivot table generation"
  (:require [clojure.core.async :as a]
            [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.database :as database :refer [Database]]
            [metabase.query-processor :as qp]
            [metabase.query-processor
             [context :as qp.context]
             [pivot :as pivot]
             [store :as qp.store]
             [streaming :as qp.streaming]]
            [metabase.util.i18n :refer [tru]]
            [schema.core :as s]))

(defn- process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query rf init context]
  (if (a/poll! (qp.context/canceled-chan context))
    (ensure-reduced init)
    (qp/process-query
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

(api/defendpoint POST "/pivot/dataset"
  "Generate a pivoted dataset for an ad-hoc query"
  [:as {{:keys      [database]
         query-type :type
         :as        query} :body}]
  {database (s/maybe s/Int)}

  (when-not database
    (throw (Exception. (str (tru "`database` is required for all queries.")))))
  (api/read-check Database database)

  ;; aggregating the results (simulating a SQL union)
  ;; 1. find the combination of all the columns, which we get from taking the original query and adding a discriminator column
  ;; 2. run the first query
  ;; 3. Start returning from the API:
  ;;    {:data {:native_form nil ;; doesn't work for the fact that we're generating multiple queries
  ;;            :insights nil    ;; doesn't work for the fact that we're generating multiple queries
  ;;            :cols             <from step 1>
  ;;            :results_metadata <from step 1>
  ;;            :results_timezone <from first query>
  ;;            :rows []         ;; map the :rows responses from *all* queries together, using lazy-cat, adding breakout indicator and additional columns / setting to nil as necessary
  ;;            }
  ;;     :row_count <a total count from the rows collection above
  ;;     :status :completed}
  (qp.streaming/streaming-response [qp-context :api]
    (qp.store/with-store
      (let [main-breakout           (:breakout (:query query))
            col-determination-query (-> query
                                      ;; TODO: move this to a bitmask or something that scales better / easier to use
                                        (assoc-in [:query :expressions] {"pivot-grouping" [:ltrim (str (vec main-breakout))]})
                                        (assoc-in [:query :fields] [[:expression "pivot-grouping"]]))
            all-expected-cols       (qp/query->expected-cols (qp/query->preprocessed col-determination-query))
            all-queries             (pivot/generate-queries query)
            first-query             (first all-queries)
            rest-queries            (rest all-queries)]
        (process-multiple-queries
         (concat [first-query] rest-queries)
         (assoc qp-context
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
                                      row)))))))))

(api/define-routes)
