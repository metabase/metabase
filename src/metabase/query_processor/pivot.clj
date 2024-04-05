(ns metabase.query-processor.pivot
  "Pivot table actions for the query processor"
  (:require
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(defn- group-bitmask
  "Come up with a display name given a combination of breakout `indices` e.g.

  This is basically a bitmask of which breakout indices we're excluding, but reversed. Why? This is how Postgres and
  other DBs determine group numbers. This implements basically what PostgreSQL does for grouping -- look at the
  original set of groups - if that column is part of *this* group, then set the appropriate bit (entry 1 sets bit 1,
  etc)

    (group-bitmask 3 [1])   ; -> [_ 1 _] -> 101 -> 101 -> 5
    (group-bitmask 3 [1 2]) ; -> [_ 1 2] -> 100 -> 011 -> 1"
  [num-breakouts indices]
  (transduce
   (map (partial bit-shift-left 1))
   (completing bit-xor)
   (int (dec (Math/pow 2 num-breakouts)))
   indices))

(defn- breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts pivot-rows pivot-cols]
  ;; validate pivot-rows/pivot-cols
  (doseq [[k pivots] {:pivot-rows pivot-rows, :pivot-cols pivot-cols}
          i          pivots]
    (when (>= i num-breakouts)
      (throw (ex-info (tru "Invalid {0}: specified breakout at index {1}, but we only have {2} breakouts"
                           (name k) i num-breakouts)
                      {:type          qp.error-type/invalid-query
                       :num-breakouts num-breakouts
                       :pivot-rows    pivot-rows
                       :pivot-cols    pivot-cols}))))
  (sort-by
   (partial group-bitmask num-breakouts)
   (distinct
    (map
     vec
     ;; this can happen for the public/embed endpoints, where we aren't given a pivot-rows / pivot-cols parameter, so
     ;; we'll just generate everything
     (if (empty? (concat pivot-rows pivot-cols))
       (powerset (range 0 num-breakouts))
       (concat
        ;; e.g. given num-breakouts = 4; pivot-rows = [0 1 2]; pivot-cols = [3]
        ;; primary data: return all breakouts
        ;; => [0 1 2 3] => 0000 => Group #15
        [(range num-breakouts)]
        ;; subtotal rows
        ;; _.range(1, pivotRows.length).map(i => [...pivotRow.slice(0, i), ...pivotCols])
        ;;  => [0 _ _ 3] [0 1 _ 3] => 0110 0100 => Group #6, #4
        (for [i (range 1 (count pivot-rows))]
          (concat (take i pivot-rows) pivot-cols))
        ;; “row totals” on the right
        ;; pivotRows
        ;; => [0 1 2 _] => 1000 => Group #8
        [pivot-rows]
        ;; subtotal rows within “row totals”
        ;; _.range(1, pivotRows.length).map(i => pivotRow.slice(0, i))
        ;; => [0 _ _ _] [0 1 _ _] => 1110 1100 => Group #14, #12
        (for [i (range 1 (count pivot-rows))]
          (take i pivot-rows))
        ;; “grand totals” row
        ;; pivotCols
        ;; => [_ _ _ 3] => 0111 => Group #7
        [pivot-cols]
        ;; bottom right corner [_ _ _ _] => 1111 => Group #15
        [[]]))))))

(defn- add-grouping-field
  "Add the grouping field and expression to the query"
  [query breakout bitmask]
  (as-> query query
    ;;TODO: replace this value with a bitmask or something to indicate the source better
    (update-in query [:query :expressions] assoc :pivot-grouping [:abs bitmask])
    ;; in PostgreSQL and most other databases, all the expressions must be present in the breakouts. Add a pivot
    ;; grouping expression ref to the breakouts
    (assoc-in query [:query :breakout] (concat breakout [[:expression "pivot-grouping"]]))
    (do
      (log/tracef "Added pivot-grouping expression to query\n%s" (u/pprint-to-str 'yellow query))
      query)))

(defn- remove-non-aggregation-order-bys
  "Only keep existing aggregations in `:order-by` clauses from the query.
   Since we're adding our own breakouts (i.e. `GROUP BY` and `ORDER BY` clauses)
   to do the pivot table stuff, existing `:order-by` clauses probably won't work
   -- `ORDER BY` isn't allowed for fields that don't appear in `GROUP BY`."
  [outer-query]
  (update
    outer-query
    :query
    (fn [query]
      (if-let [new-order-by (not-empty (filterv (comp #(= :aggregation %) first second) (:order-by query)))]
        (assoc query :order-by new-order-by)
        (dissoc query :order-by)))))

(defn- generate-queries
  "Generate the additional queries to perform a generic pivot table"
  [{{all-breakouts :breakout} :query, :keys [query], :as outer-query}
   {:keys [pivot-rows pivot-cols], :as _pivot-options}]
  (try
    (for [breakout-indices (u/prog1 (breakout-combinations (count all-breakouts) pivot-rows pivot-cols)
                             (log/tracef "Using breakout combinations: %s" (pr-str <>)))
          :let             [group-bitmask (group-bitmask (count all-breakouts) breakout-indices)
                            new-breakouts (for [i breakout-indices]
                                            (nth all-breakouts i))]]
      (-> outer-query
          remove-non-aggregation-order-bys
          (add-grouping-field new-breakouts group-bitmask)))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(def ^:private ^:dynamic ^{:arglists '([query])} *column-mapping-fn*
  nil)

(def ^:private ^:dynamic *pivot-column-mapping*
  nil)

(defn- row-mapping-fn
  "This function needs to be called for each row so that it can actually shape the row according to the
  [[*column-mapping-fn*]] above."
  [row]
  ;; the first query doesn't need any special mapping, it already has all the columns
  (if *pivot-column-mapping*
    (mapv (fn [mapping]
            (when mapping
              (nth row mapping)))
          *pivot-column-mapping*)
    row))

(mu/defn ^:private process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query :- ::qp.schema/query
   rf    :- ifn?
   init  :- :any
   info  :- [:maybe :map]]
  (if (qp.pipeline/canceled?)
    (ensure-reduced init)
    (let [rff (fn [_metadata]
                (fn
                  ([]        init)
                  ([acc]     acc)
                  ([acc row] (rf acc (row-mapping-fn row)))))]
      (try
        (let [query (cond-> query
                      (seq info) (qp/userland-query info))]
          (qp/process-query query rff))
        (catch Throwable e
          (log/error e (trs "Error processing additional pivot table query"))
          (throw e))))))

(mu/defn ^:private process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [init
   queries :- [:sequential ::qp.schema/query]
   rf      :- ifn?
   info    :- [:maybe :map]]
  (reduce
   (fn [acc query]
     (binding [*pivot-column-mapping* (*column-mapping-fn* query)]
       (process-query-append-results query rf acc info)))
   init
   queries))

;;; `vrf` in the next few functions is a volatile used to capture the original reducing function before composed with
;;; limit and other middleware

(mu/defn ^:private append-queries-rff :- ::qp.schema/rff
  [rff :- ::qp.schema/rff
   vrf :- [:fn {:error/message "volatile"} volatile?]]
  (fn rff* [metadata]
    (u/prog1 (rff metadata)
      (assert (ifn? <>) (format "rff %s did not return a valid reducing function" (pr-str rff)))
      ;; this captures
      (vreset! vrf <>))))

(mu/defn ^:private append-queries-execute-fn :- fn?
  "Build the version of [[qp.pipeline/*execute*]] used at the top level for running pivot queries."
  [more-queries :- [:sequential ::qp.schema/query]]
  (when (seq more-queries)
    (fn multiple-execute [driver query respond]
      (respond {::driver driver} query))))

(mu/defn ^:private append-queries-reduce-fn :- fn?
  "Build the version of [[qp.pipeline/*reduce*]] used at the top level for running pivot queries."
  [info         :- [:maybe :map]
   more-queries :- [:sequential ::qp.schema/query]
   vrf          :- [:fn {:error/message "volatile"} volatile?]]
  (when (seq more-queries)
    ;; execute holds open a connection from [[execute-reducible-query]] so we need to manage connections
    ;; in the reducing part reduce fn. The default run fn is what orchestrates this together and we just
    ;; pass the original execute fn to the reducing part so we can control our multiple connections.
    (let [orig-execute qp.pipeline/*execute*]
      ;; signature usually has metadata in place of driver but we are hijacking
      (fn multiple-reducing [rff {::keys [driver]} query]
        (assert driver (format "Expected 'metadata' returned by %s" `append-queries-execute-fn))
        (let [respond (fn [metadata reducible-rows]
                        (let [rf (rff metadata)]
                          (assert (ifn? rf))
                          (try
                            (transduce identity (completing rf) reducible-rows)
                            (catch Throwable e
                              (throw (ex-info (tru "Error reducing result rows")
                                              {:type qp.error-type/qp}
                                              e))))))
              ;; restore the bindings for the original execute function, otherwise we'd infinitely recurse back here and
              ;; we don't want that now do we. Replace the reduce function with something simple that's not going to do
              ;; anything crazy like close our output stream prematurely; we can let the top-level reduce function worry
              ;; about that.
              acc     (binding [qp.pipeline/*execute* orig-execute
                                qp.pipeline/*reduce* (fn [rff metadata reducible-rows]
                                                       (let [rf (rff metadata)]
                                                         (transduce identity rf reducible-rows)))]
                        (-> (qp.pipeline/*execute* driver query respond)
                            (process-queries-append-results more-queries @vrf info)))]
          ;; completion arity can't be threaded because the value is derefed too early
          (qp.pipeline/*result* (@vrf acc)))))))

(mu/defn ^:private append-queries-rff-and-fns
  "RFF and QP pipeline functions to use when executing pivot queries."
  [info         :- [:maybe :map]
   rff          :- ::qp.schema/rff
   more-queries :- [:sequential ::qp.schema/query]]
  (let [vrf (volatile! nil)]
    {:rff      (append-queries-rff rff vrf)
     :execute  (append-queries-execute-fn more-queries)
     :reduce   (append-queries-reduce-fn info more-queries vrf)}))

(defn- process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[{:keys [info], :as first-query} & more-queries] rff]
  (let [{:keys [rff execute reduce]} (append-queries-rff-and-fns info rff more-queries)
        first-query                  (cond-> first-query
                                       (seq info) qp/userland-query-with-default-constraints)]
    (binding [qp.pipeline/*execute* (or execute qp.pipeline/*execute*)
              qp.pipeline/*reduce*  (or reduce qp.pipeline/*reduce*)]
      (qp/process-query first-query rff))))

(mu/defn pivot-options :- [:map
                           [:pivot-rows [:maybe [:sequential [:int {:min 0}]]]]
                           [:pivot-cols [:maybe [:sequential [:int {:min 0}]]]]]
  "Given a pivot table query and a card ID, looks at the `pivot_table.column_split` key in the card's visualization
  settings and generates pivot-rows and pivot-cols to use for generating subqueries."
  [query        :- [:map
                    [:database ::lib.schema.id/database]]
   viz-settings :- [:maybe :map]]
  (let [column-split         (:pivot_table.column_split viz-settings)
        column-split-rows    (seq (:rows column-split))
        column-split-columns (seq (:columns column-split))
        index-in-breakouts   (when (or column-split-rows
                                       column-split-columns)
                               (let [metadata-provider (or (:lib/metadata query)
                                                           (lib.metadata.jvm/application-database-metadata-provider (:database query)))
                                     mlv2-query        (lib/query metadata-provider query)
                                     breakouts         (into []
                                                             (map-indexed (fn [i col]
                                                                            (assoc col ::i i)))
                                                             (lib/breakouts-metadata mlv2-query))]
                                 (fn [legacy-ref]
                                   (try
                                     (::i (lib.equality/find-column-for-legacy-ref
                                           mlv2-query
                                           -1
                                           legacy-ref
                                           breakouts))
                                     (catch Throwable e
                                       (log/errorf e "Error finding matching column for ref %s" (pr-str legacy-ref))
                                       nil)))))

        pivot-rows (when column-split-rows
                     (into [] (keep index-in-breakouts) column-split-rows))
        pivot-cols (when column-split-columns
                     (into [] (keep index-in-breakouts) column-split-columns))]
    {:pivot-rows pivot-rows
     :pivot-cols pivot-cols}))

(mu/defn run-pivot-query
  "Run the pivot query. You are expected to wrap this call in [[metabase.query-processor.streaming/streaming-response]]
  yourself."
  ([query]
   (run-pivot-query query nil))

  ([query :- ::qp.schema/query
    rff   :- [:maybe ::qp.schema/rff]]
   (binding [qp.perms/*card-id* (get-in query [:info :card-id])]
     (qp.setup/with-qp-setup [query query]
       (let [rff                     (or rff qp.reducible/default-rff)
             query                   (mbql.normalize/normalize query)
             pivot-options           (or
                                      (not-empty (select-keys query [:pivot-rows :pivot-cols]))
                                      (pivot-options query (get-in query [:info :visualization-settings])))
             main-breakout           (:breakout (:query query))
             col-determination-query (add-grouping-field query main-breakout 0)
             all-expected-cols       (qp.preprocess/query->expected-cols col-determination-query)
             all-queries             (generate-queries query pivot-options)]
         (binding [;; this function needs to be executed at the start of every new query to
                   ;; determine the mapping for maintaining query shape
                   *column-mapping-fn* (fn [query]
                                         (let [query-cols (map-indexed vector (qp.preprocess/query->expected-cols query))]
                                           (mapv (fn [item]
                                                   (some #(when (= (:name item) (:name (second %)))
                                                            (first %)) query-cols))
                                                 all-expected-cols)))]
           (process-multiple-queries all-queries rff)))))))
