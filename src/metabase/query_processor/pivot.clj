(ns metabase.query-processor.pivot
  "Pivot table query processor. Two execution strategies are available:

  1. **Legacy multi-query path** ([[run-pivot-query-multi]]): generates one subquery per breakout combination
     (powerset of pivot rows/cols), runs them sequentially, and stitches the results together with an
     application-level `pivot-grouping` bitmask column. Works with every driver.

  2. **Native single-query path** ([[run-native-pivot-query]]): for drivers that declare the
     `:native-pivot-tables` feature, a single SQL query with `GROUPING SETS` (or the driver's equivalent) produces
     all subtotal levels at once. The driver is responsible for returning a `\"pivot-grouping\"` column containing
     an integer bitmask. This path is driver-agnostic at the QP level -- any driver that fulfills the contract can
     use it.

  [[run-pivot-query]] dispatches between the two paths based on [[native-pivot-supported?]].

  Post-processing middleware to add the `pivot-grouping` column to results and to massage result rows into a standard
  shape lives in [[metabase.query-processor.pivot.middleware]]."
  (:refer-clojure :exclude [every? mapv some select-keys update-keys empty? not-empty get-in])
  (:require
   [medley.core :as m]
   [metabase.driver.util :as driver.u]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.middleware.normalize-query :as qp.middleware.normalize]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot.common :as pivot.common]
   [metabase.query-processor.pivot.middleware :as pivot.middleware]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty? every? get-in mapv not-empty select-keys some update-keys]])
  (:import
   (java.util.concurrent ConcurrentLinkedQueue)))

(set! *warn-on-reflection* true)

(defn- powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (long (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

(mr/def ::pivot-rows     [:sequential ::pivot.common/index])
(mr/def ::pivot-cols     [:sequential ::pivot.common/index])
(mr/def ::pivot-measures [:sequential ::pivot.common/index])

(mr/def ::pivot-opts [:maybe
                      [:map
                       [:pivot-rows         {:optional true} [:maybe ::pivot-rows]]
                       [:pivot-cols         {:optional true} [:maybe ::pivot-cols]]
                       [:pivot-measures     {:optional true} [:maybe ::pivot-measures]]
                       [:show-row-totals    {:optional true} [:maybe :boolean]]
                       [:show-column-totals {:optional true} [:maybe :boolean]]]])

(mr/def ::pivot.common/breakout-combinations
  [:and
   [:sequential ::pivot.common/breakout-combination]
   [:fn
    {:error/message "Distinct combinations"}
    #(or (empty? %)
         (apply distinct? %))]])

(mu/defn- breakout-combinations :- ::pivot.common/breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts      :- ::pivot.common/num-breakouts
   pivot-rows         :- [:maybe ::pivot-rows]
   pivot-cols         :- [:maybe ::pivot-cols]
   show-row-totals    :- [:maybe :boolean]
   show-column-totals :- [:maybe :boolean]]
  (let [row-totals (if (nil? show-row-totals)    true show-row-totals)
        col-totals (if (nil? show-column-totals) true show-column-totals)]
    ;; validate pivot-rows/pivot-cols
    (doseq [[k pivots] [[:pivot-rows pivot-rows]
                        [:pivot-cols pivot-cols]]
            i          pivots]
      (when (>= i num-breakouts)
        (throw (ex-info (tru "Invalid {0}: specified breakout at index {1}, but we only have {2} breakouts"
                             (name k) i num-breakouts)
                        {:type          qp.error-type/invalid-query
                         :num-breakouts num-breakouts
                         :pivot-rows    pivot-rows
                         :pivot-cols    pivot-cols}))))
    (sort-by
     (partial pivot.common/group-bitmask num-breakouts)
     (m/distinct-by
      (partial pivot.common/group-bitmask num-breakouts)
      (map
       (comp vec sort)
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
          (when col-totals
            (for [i (range 1 (count pivot-rows))]
              (concat (take i pivot-rows) pivot-cols)))
          ;; "row totals" on the right
          ;; pivotRows
          ;; => [0 1 2 _] => 1000 => Group #8
          (when row-totals
            [pivot-rows])
          ;; subtotal rows within "row totals"
          ;; _.range(1, pivotRows.length).map(i => pivotRow.slice(0, i))
          ;; => [0 _ _ _] [0 1 _ _] => 1110 1100 => Group #14, #12
          (when (and row-totals col-totals)
            (for [i (range 1 (count pivot-rows))]
              (take i pivot-rows)))
          ;; "grand totals" row
          ;; pivotCols
          ;; => [_ _ _ 3] => 0111 => Group #7
          (when col-totals
            [pivot-cols])
          ;; bottom right corner [_ _ _ _] => 1111 => Group #15
          (when (and row-totals col-totals)
            [[]]))))))))

(mu/defn- keep-breakouts-at-indexes :- ::lib.schema/query
  "Keep the breakouts at indexes, reordering them if needed. Remove all other breakouts."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::pivot.common/breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (reduce
     (fn [query i]
       (lib/breakout query (nth all-breakouts i)))
     (-> (lib/remove-all-breakouts query)
         (assoc :qp.pivot/remapped-breakout-combination breakout-indexes-to-keep))
     breakout-indexes-to-keep)))

(mu/defn- remove-non-aggregation-order-bys :- ::lib.schema/query
  "Only keep existing aggregations in `:order-by` clauses from the query. Since we're adding our own breakouts (i.e.
  `GROUP BY` and `ORDER BY` clauses) to do the pivot table stuff, existing `:order-by` clauses probably won't work --
  `ORDER BY` isn't allowed for fields that don't appear in `GROUP BY`."
  [query :- ::lib.schema/query]
  (reduce
   (fn [query [_tag _opts expr :as order-by]]
     ;; keep any order bys on :aggregation references. Remove all other clauses.
     (cond-> query
       (not (lib/clause-of-type? expr :aggregation))
       (lib/remove-clause order-by)))
   query
   (lib/order-bys query)))

(mu/defn- generate-queries :- [:sequential ::lib.schema/query]
  "Generate the additional queries to perform a generic pivot table"
  [query :- ::lib.schema/query
   {:keys [pivot-rows pivot-cols show-row-totals show-column-totals] :as _pivot-options} :- ::pivot-opts]
  (try
    (let [all-breakouts (lib/breakouts query)
          all-queries   (for [breakout-indexes (u/prog1 (breakout-combinations (count all-breakouts)
                                                                               pivot-rows
                                                                               pivot-cols
                                                                               show-row-totals
                                                                               show-column-totals)
                                                 (log/tracef "Using breakout combinations: %s" (pr-str <>)))]
                          (-> query
                              (assoc :qp.pivot/unremapped-breakout-combination breakout-indexes)
                              remove-non-aggregation-order-bys
                              (keep-breakouts-at-indexes breakout-indexes)))]
      (conj (rest (map #(assoc-in % [:info :pivot/result-metadata] :none) all-queries))
            (->
             (assoc-in (first all-queries) [:info :pivot/original-query] query)
             (assoc-in [:info :pivot/result-metadata] (qp.metadata/result-metadata query)))))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(mu/defn- process-query-append-results
  "Reduce the results of a single (sub)`query` using `rf` and initial value `init`."
  [query :- ::lib.schema/query
   rf    :- ::qp.schema/rf
   init  :- :any
   info  :- [:maybe ::lib.schema.info/info]]
  (if (qp.pipeline/canceled?)
    (ensure-reduced init)
    (let [rff (fn rff* [_metadata]
                (fn rf*
                  ([]        init)
                  ([acc]     acc)
                  ([acc row] (rf acc row))))]
      (try
        (let [query (cond-> query
                      (seq info) (qp/userland-query info))]
          (qp/process-query query rff))
        (catch Throwable e
          (log/error e "Error processing additional pivot table query")
          (throw e))))))

(mu/defn- process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [init
   queries :- [:maybe [:sequential ::lib.schema/query]]
   rf      :- ::qp.schema/rf
   info    :- [:maybe ::lib.schema.info/info]]
  (reduce
   (fn [acc query]
     (process-query-append-results query rf acc info))
   init
   queries))

;;; `vrf` in the next few functions is a volatile used to capture the original reducing function before composed with
;;; limit and other middleware

(mu/defn- append-queries-rff :- ::qp.schema/rff
  [rff :- ::qp.schema/rff
   vrf :- [:fn {:error/message "volatile"} volatile?]]
  (fn rff* [metadata]
    (u/prog1 (rff metadata)
      (assert (ifn? <>) (format "rff %s did not return a valid reducing function" (pr-str rff)))
      ;; this captures
      (vreset! vrf <>))))

(mu/defn- append-queries-execute-fn :- fn?
  "Build the version of [[qp.pipeline/*execute*]] used at the top level for running pivot queries."
  [more-queries :- [:sequential ::lib.schema/query]]
  (when (seq more-queries)
    (fn multiple-execute [driver query respond]
      (respond {::driver driver} query))))

(mu/defn- append-queries-reduce-fn :- fn?
  "Build the version of [[qp.pipeline/*reduce*]] used at the top level for running pivot queries."
  [info         :- [:maybe ::lib.schema.info/info]
   more-queries :- [:sequential ::lib.schema/query]
   vrf          :- [:fn {:error/message "volatile"} volatile?]
   pivot-limit  :- [:maybe nat-int?]]
  (when (seq more-queries)
    ;; execute holds open a connection from [[execute-reducible-query]] so we need to manage connections
    ;; in the reducing part reduce fn. The default run fn is what orchestrates this together and we just
    ;; pass the original execute fn to the reducing part so we can control our multiple connections.
    (let [orig-execute qp.pipeline/*execute*]
      ;; signature usually has metadata in place of driver but we are hijacking
      (fn multiple-reducing [rff {::keys [driver]} query]
        (assert driver (format "Expected 'metadata' returned by %s" `append-queries-execute-fn))
        (let [master-row-count (volatile! 0)
              respond (fn respond* [metadata reducible-rows]
                        (let [rf (rff metadata)
                              counting-rf (fn counting-rf*
                                            ([] (rf))
                                            ([acc] (rf acc))
                                            ([acc row]
                                             (vswap! master-row-count inc)
                                             (rf acc row)))]
                          (assert (ifn? rf))
                          (try
                            (transduce identity (completing counting-rf) reducible-rows)
                            (catch Throwable e
                              (throw (ex-info (tru "Error reducing result rows: {0}" (ex-message e))
                                              {:type qp.error-type/qp}
                                              e))))))
              ;; restore the bindings for the original execute function, otherwise we'd infinitely recurse back here and
              ;; we don't want that now do we. Replace the reduce function with something simple that's not going to do
              ;; anything crazy like close our output stream prematurely; we can let the top-level reduce function worry
              ;; about that.
              first-result (binding [qp.pipeline/*execute* orig-execute
                                     qp.pipeline/*reduce*  (fn [rff metadata reducible-rows]
                                                             (let [rf (rff metadata)]
                                                               (transduce identity rf reducible-rows)))]
                             (qp.pipeline/*execute* driver query respond))
              truncated?   (and pivot-limit (>= @master-row-count pivot-limit))
              acc          (if truncated?
                             first-result
                             (binding [qp.pipeline/*execute* orig-execute
                                       qp.pipeline/*reduce* (fn [rff metadata reducible-rows]
                                                              (let [rf (rff metadata)]
                                                                (transduce identity rf reducible-rows)))]
                               (process-queries-append-results first-result more-queries @vrf info)))
              result       (@vrf acc)]
          ;; completion arity can't be threaded because the value is derefed too early
          (qp.pipeline/*result* (cond-> result
                                  (and truncated? (map? result))
                                  (assoc-in [:data :pivot_rows_truncated] @master-row-count))))))))

(mu/defn- append-queries-rff-and-fns
  "RFF and QP pipeline functions to use when executing pivot queries."
  [info         :- [:maybe ::lib.schema.info/info]
   rff          :- ::qp.schema/rff
   more-queries :- [:sequential ::lib.schema/query]
   pivot-limit  :- [:maybe nat-int?]]
  (let [vrf (volatile! nil)]
    {:rff      (append-queries-rff rff vrf)
     :execute  (append-queries-execute-fn more-queries)
     :reduce   (append-queries-reduce-fn info more-queries vrf pivot-limit)}))

(mu/defn- process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[{:keys [info], :as first-query} & more-queries] :- [:sequential ::lib.schema/query]
   rff                                              :- ::qp.schema/rff
   pivot-limit                                      :- [:maybe nat-int?]]
  (if (empty? more-queries)
    ;; Single query - use normal QP pipeline to preserve userland metadata
    (qp/process-query (cond-> first-query
                        (seq info) qp/userland-query)
                      rff)
    ;; Multiple queries - use custom pivot pipeline
    (let [{:keys [rff execute reduce]} (append-queries-rff-and-fns info rff more-queries pivot-limit)
          first-query                  (cond-> first-query
                                         (seq info) qp/userland-query)]
      (binding [qp.pipeline/*execute* (or execute qp.pipeline/*execute*)
                qp.pipeline/*reduce*  (or reduce qp.pipeline/*reduce*)]
        (qp/process-query first-query rff)))))

(mu/defn- column-name-pivot-options :- ::pivot-opts
  "Looks at the `pivot_table.column_split` key in the card's visualization settings and generates `pivot-rows` and
  `pivot-cols` to use for generating subqueries. Supports column name-based settings only."
  [query        :- [:map
                    [:database ::lib.schema.id/database]]
   viz-settings :- [:maybe :map]]
  (let [{:keys [rows columns values]} (:pivot_table.column_split viz-settings)
        show-row-totals    (get viz-settings :pivot.show_row_totals true)
        show-column-totals (get viz-settings :pivot.show_column_totals true)
        metadata-provider  (or (:lib/metadata query)
                               (lib-be/application-database-metadata-provider (:database query)))
        query              (lib/query metadata-provider query)
        unique-name-fn     (lib/unique-name-generator)
        returned-columns   (->> (lib/returned-columns query)
                                (mapv #(update % :name unique-name-fn)))
        aggregations       (filter #(= (:lib/source %) :source/aggregations)
                                   returned-columns)
        breakouts          (filter :lib/breakout? returned-columns)
        column-name->index (into {}
                                 (map-indexed (fn [i column] [(:lib/deduplicated-name column) i]))
                                 (concat breakouts aggregations))
        process-columns    (fn process-columns [column-names]
                             (when (seq column-names)
                               (into [] (keep column-name->index) column-names)))
        pivot-opts         {:pivot-rows         (process-columns rows)
                            :pivot-cols         (process-columns columns)
                            :pivot-measures     (process-columns values)
                            :show-row-totals    show-row-totals
                            :show-column-totals show-column-totals}]
    (when (some some? (vals pivot-opts))
      pivot-opts)))

(mu/defn- column-sort-order :- ::pivot-opts
  "Looks at the `pivot_table.column_sort_order` key in the card's visualization settings and generates a map from the
  column's index to the setting (either ascending or descending)."
  [query        :- [:map
                    [:database ::lib.schema.id/database]]
   viz-settings :- [:maybe :map]]
  (let [metadata-provider  (or (:lib/metadata query)
                               (lib-be/application-database-metadata-provider (:database query)))
        query              (lib/query metadata-provider query)
        index-in-breakouts (into {}
                                 (comp (filter (some-fn :lib/breakout? #(= (:lib/source %) :source/aggregations)))
                                       (map-indexed (fn [i column] [(:name column) i])))
                                 (lib/returned-columns query))]
    (-> (or (:column_settings viz-settings)
            (::mb.viz/column-settings viz-settings))
        (update-keys (fn [k]
                       (if (string? k)
                         (-> k json/decode last index-in-breakouts)
                         (->> k ::mb.viz/column-name index-in-breakouts))))
        (update-vals (comp keyword :pivot_table.column_sort_order)))))

(mu/defn- field-ref-pivot-options :- ::pivot-opts
  "Looks at the `pivot_table.column_split` key in the card's visualization settings and generates `pivot-rows` and
  `pivot-cols` to use for generating subqueries. Supports field ref-based settings only."
  [query        :- [:map
                    [:database ::lib.schema.id/database]]
   viz-settings :- [:maybe :map]]
  (let [{:keys [rows columns values]} (:pivot_table.column_split viz-settings)
        show-row-totals    (get viz-settings "pivot.show_row_totals" true)
        show-column-totals (get viz-settings "pivot.show_column_totals" true)
        metadata-provider             (or (:lib/metadata query)
                                          (lib-be/application-database-metadata-provider (:database query)))
        mbql5-query                    (lib/query metadata-provider query)
        breakouts                     (into []
                                            (map-indexed (fn [i col]
                                                           (cond-> col
                                                             true                         (assoc ::idx i)
                                                             ;; if the col has a card-id, we swap the :lib/source to say
                                                             ;; source/card this allows `lib/find-matching-column` to properly
                                                             ;; match a column that has a join-alias but whose source is a
                                                             ;; model
                                                             (contains? col :lib/card-id) (assoc :lib/source :source/card))))
                                            (concat (lib/breakouts-metadata mbql5-query)
                                                    (lib/aggregations-metadata mbql5-query)))
        index-in-breakouts            (fn index-in-breakouts [legacy-ref]
                                        (try
                                          (::idx (lib.equality/find-column-for-legacy-ref
                                                  mbql5-query
                                                  -1
                                                  legacy-ref
                                                  breakouts))
                                          (catch Throwable e
                                            (log/errorf e "Error finding matching column for ref %s" (pr-str legacy-ref))
                                            nil)))
        process-refs                  (fn process-refs [refs]
                                        (when (seq refs)
                                          (into [] (keep index-in-breakouts) refs)))
        pivot-opts                    {:pivot-rows         (process-refs rows)
                                       :pivot-cols         (process-refs columns)
                                       :pivot-measures     (process-refs values)
                                       :show-row-totals    show-row-totals
                                       :show-column-totals show-column-totals}]
    (when (some some? (vals pivot-opts))
      pivot-opts)))

(mu/defn- pivot-options :- ::pivot-opts
  "Looks at the `pivot_table.column_split` key in the card's visualization settings and generates `pivot-rows` and
  `pivot-cols` to use for generating subqueries. Supports both column name and field ref-based settings.

  Field ref-based visualization settings are considered legacy and are not used for new questions. To not break existing
  questions we need to support both old- and new-style settings until they are fully migrated."
  [query        :- [:map
                    [:database ::lib.schema.id/database]]
   viz-settings :- [:maybe :map]]
  (when viz-settings
    (let [{:keys [rows columns]} (:pivot_table.column_split viz-settings)]
      (merge
       (if (and (every? string? rows) (every? string? columns))
         (column-name-pivot-options query viz-settings)
         (field-ref-pivot-options query viz-settings))
       {:column-sort-order (column-sort-order query viz-settings)}))))

(defn- remapped-field
  [breakout]
  (when (and (vector? breakout)
             (= (first breakout) :field))
    (not-empty (select-keys (second breakout)
                            [::qp.add-remaps/original-field-dimension-id
                             ::qp.add-remaps/new-field-dimension-id]))))

(mu/defn- remapped-indexes :- ::pivot.common/remapped-indexes
  [breakouts]
  (let [remap-pairs (first
                     (reduce (fn [[m i] breakout]
                               [(reduce-kv (fn [m remap-key id]
                                             (assoc-in m [id remap-key] i))
                                           m
                                           (remapped-field breakout))
                                (inc i)])
                             [{} 0]
                             breakouts))]
    (into {}
          (map (juxt ::qp.add-remaps/original-field-dimension-id
                     ::qp.add-remaps/new-field-dimension-id))
          (vals remap-pairs))))

(mu/defn- add-canonical-col-info
  "This returns a function with the signature

    (f query) => column-remapping

  Where `column-remapping` looks something like

    {0 2, 1 3, 2 4}

  `column-remapping` is a map of

    column number in subquery results => column number in the UNION-style overall pivot results

  Some pivot subqueries exclude certain breakouts, so we need to fill in those missing columns with `nil` in the overall
  results -- "
  [query :- ::lib.schema/query]
  (let [remapped-query           (qp.add-remaps/add-remapped-columns query)
        remap                    (remapped-indexes (lib/breakouts remapped-query))
        remapped-cols            (lib/returned-columns remapped-query)
        num-remapped-cols        (count remapped-cols)
        num-unremapped-breakouts (count (lib/breakouts query))
        num-remapped-breakouts   (count (filter :lib/breakout? remapped-cols))]
    (assoc query
           :qp.pivot/num-remapped-cols        num-remapped-cols
           :qp.pivot/num-unremapped-breakouts num-unremapped-breakouts
           :qp.pivot/num-remapped-breakouts   num-remapped-breakouts
           :qp.pivot/remapped-indexes         remap)))

(def ^:dynamic *force-legacy-pivot*
  "When true, [[run-pivot-query]] always uses the legacy multi-query path. Used by tests to compare native vs legacy results."
  false)

(def ^:dynamic ^:private *pivot-max-result-rows*
  "Maximum number of result rows for each pivot sub-query. Divided by the number of aggregations since each aggregation
  adds a column to the output, so fewer rows are needed to fill the pivot table."
  200000)

(defn- pivot-query-max-rows
  "Calculate the per-sub-query row limit for pivot queries: `floor(pivot-max-result-rows / num-aggregations)`.
  Falls back to `pivot-max-result-rows` if there are no aggregations (shouldn't happen for pivot queries)."
  [query]
  (let [num-aggs (count (lib/aggregations query))]
    (if (pos? num-aggs)
      (quot *pivot-max-result-rows* num-aggs)
      *pivot-max-result-rows*)))

(defn- has-window-fn-aggregation?
  "Window function aggregations cannot be computed correctly in a single GROUPING SETS query; use legacy pivot."
  [query]
  (let [window-fn-tags #{:offset :cum-count :cum-sum}]
    (some (fn [clause]
            (and (vector? clause) (window-fn-tags (first clause))))
          (lib/aggregations query))))

(mu/defn native-pivot-supported? :- :boolean
  "Does the database for this query support computing pivot subtotals in a single database-native query?
  Returns true when the driver declares `:native-pivot-tables`. The actual SQL construct used (e.g. `GROUPING SETS`,
  `WITH ROLLUP`) is driver-specific and opaque to this namespace."
  [query :- [:map
             [:database {:optional true} [:maybe ::lib.schema.id/database]]]]
  (boolean
   (when-let [database (u/ignore-exceptions (lib.metadata/database query))]
     (when-let [driver (driver.u/database->driver database)]
       (driver.u/supports? driver :native-pivot-tables database)))))

(defn- find-pivot-grouping-index
  "Return the index of the pivot-grouping column in `cols`, or nil if not found."
  [cols]
  (first (keep-indexed (fn [i col] (when (= (:name col) "pivot-grouping") i)) cols)))

(defn- vec-remove-at
  "Remove the element at `idx` from vector `v`."
  [v idx]
  (into (subvec v 0 idx) (subvec v (inc idx))))

(defn- vec-insert-at
  "Insert `val` at `idx` in vector `v`."
  [v idx val]
  (into (conj (subvec v 0 idx) val) (subvec v idx)))

(defn- strip-pivot-grouping-from-row
  "Remove the `pivot-grouping` column at `idx` from `row`, enqueueing its original database value."
  [idx ^ConcurrentLinkedQueue grouping-queue row]
  (let [row-v (vec row)]
    (.offer grouping-queue (nth row-v idx))
    (vec-remove-at row-v idx)))

(mu/defn- run-native-pivot-query
  "Run a pivot query using a single database-native query. This function is **driver-agnostic** -- it works for any
  driver that declares the `:native-pivot-tables` feature. The contract is:

  * The driver produces all subtotal levels in one query (e.g. via `GROUPING SETS` or equivalent).
  * The driver returns one extra column named `\"pivot-grouping\"` containing an integer bitmask that encodes which
    breakout columns are active for each row (see [[metabase.query-processor.pivot.common/group-bitmask]]).

  **Why the `*reduce*` strip/restore dance is needed:**

  The post-processing middleware chain (specifically `annotate/add-column-info`) compares driver-returned columns
  against the columns Lib calculates from the query structure. Lib knows nothing about the synthetic
  `pivot-grouping` column, so the count would mismatch and throw. To avoid this:

  1. We bind [[qp.pipeline/*reduce*]] to intercept the driver's metadata and rows, stripping out the
     `pivot-grouping` column before the post-processing middleware chain sees them.
  2. We wrap the outermost `rff` so that after all middleware has processed, `pivot-grouping` is re-inserted into
     the final metadata and every row at its original position.

  Data flow:

      Driver returns [breakouts... pivot-grouping aggs...]
        -> *reduce* binding strips pivot-grouping
        -> post-processing middleware sees [breakouts... aggs...] (matches Lib expectation)
        -> wrapped-rff re-inserts pivot-grouping
        -> final output: [breakouts... pivot-grouping aggs...]  (matches frontend expectation)"
  [query        :- ::qp.schema/any-query
   rff          :- ::qp.schema/rff
   pivot-opts   :- ::pivot-opts
   pivot-limit  :- [:maybe nat-int?]]
  (let [original-query query
        all-breakout-combinations (breakout-combinations (count (lib/breakouts query))
                                                         (:pivot-rows pivot-opts)
                                                         (:pivot-cols pivot-opts)
                                                         (:show-row-totals pivot-opts)
                                                         (:show-column-totals pivot-opts))
        query        (-> query
                         (assoc :qp.pivot/native-pivot? true
                                :qp.pivot/breakout-combinations all-breakout-combinations)
                         (assoc-in [:info :pivot/original-query] original-query)
                         ;; GROUPING SETS returns many aggregated rows; do not apply the unaggregated row limit.
                         (update :constraints dissoc :max-results-bare-rows)
                         ;; A stage `:limit` applies to the single GROUPING SETS query and can drop subtotal rows;
                         ;; legacy pivot runs one query per combination so each can return rows independently.
                         (lib/limit nil)
                         remove-non-aggregation-order-bys)
        grouping-queue (ConcurrentLinkedQueue.)
        pivot-col-info (volatile! nil)
        row-count      (volatile! 0)
        wrapped-rff  (fn [metadata]
                       (if-let [{:keys [pivot-idx pivot-col]} @pivot-col-info]
                         (let [restored-metadata (update metadata :cols #(vec-insert-at (vec %) pivot-idx pivot-col))
                               rf (rff restored-metadata)]
                           (fn native-pivot-restore-rf
                             ([] (rf))
                             ([result]
                              (let [result (rf result)]
                                (cond-> result
                                  (and pivot-limit (>= @row-count pivot-limit) (map? result))
                                  (assoc-in [:data :pivot_rows_truncated] @row-count))))
                             ([result row]
                              (vswap! row-count inc)
                              (rf result
                                  (vec-insert-at (vec row)
                                                 pivot-idx
                                                 (.poll grouping-queue))))))
                         (rff metadata)))]
    (log/debugf "Running native pivot query:\n%s" (u/pprint-to-str query))
    (binding [qp.pipeline/*reduce*
              (let [orig-reduce qp.pipeline/*reduce*]
                (fn native-pivot-reduce [rff metadata reducible-rows]
                  (let [cols (vec (:cols metadata))
                        idx  (find-pivot-grouping-index cols)]
                    (if (nil? idx)
                      (orig-reduce rff metadata reducible-rows)
                      (do
                        (vreset! pivot-col-info {:pivot-idx idx
                                                 :pivot-col (merge pivot.middleware/pivot-grouping-column-metadata
                                                                   (nth cols idx))})
                        (let [stripped-metadata (update metadata :cols #(vec-remove-at (vec %) idx))
                              stripped-rows     (eduction
                                                 (map (partial strip-pivot-grouping-from-row idx grouping-queue))
                                                 reducible-rows)]
                          (orig-reduce rff stripped-metadata stripped-rows)))))))]
      (qp/process-query (cond-> query
                          (seq (:info query)) qp/userland-query)
                        wrapped-rff))))

(mu/defn- run-pivot-query-multi
  "Run a pivot query using multiple subqueries (legacy path). One subquery is generated per breakout combination
  and they are executed sequentially; the `pivot-grouping` bitmask column is synthesized at the application level
  by [[metabase.query-processor.pivot.middleware/add-pivot-grouping]]. Used when the driver does not declare
  `:native-pivot-tables`."
  [query        :- ::qp.schema/any-query
   rff          :- ::qp.schema/rff
   pivot-opts   :- ::pivot-opts
   pivot-limit  :- [:maybe nat-int?]]
  (let [all-queries (generate-queries query pivot-opts)]
    (process-multiple-queries all-queries rff pivot-limit)))

(mu/defn run-pivot-query
  "Run the pivot query. Dispatches to [[run-native-pivot-query]] when the driver supports `:native-pivot-tables`,
  otherwise falls back to [[run-pivot-query-multi]]. You are expected to wrap this call in
  [[metabase.query-processor.streaming/streaming-response]] yourself."
  ([query]
   (run-pivot-query query nil))

  ([query :- ::qp.schema/any-query
    rff   :- [:maybe ::qp.schema/rff]]
   (log/debugf "Running pivot query:\n%s" (u/pprint-to-str query))
   (qp.setup/with-qp-setup [query query]
     (let [query       (qp.middleware.normalize/normalize-preprocessing-middleware query) ; normalize to MBQL 5 if needed.
           rff         (or rff qp.reducible/default-rff)
           pivot-opts  (or
                        (pivot-options query (get query :viz-settings))
                        (pivot-options query (get-in query [:info :visualization-settings]))
                        (not-empty (select-keys query [:pivot-rows :pivot-cols :pivot-measures :show-row-totals :show-column-totals])))
           pivot-limit (pivot-query-max-rows query)
           query       (-> query
                           (assoc-in [:middleware :pivot-options] pivot-opts)
                           (assoc-in [:constraints :max-results] pivot-limit)
                           (cond-> (get-in query [:constraints :max-results-bare-rows])
                             (update-in [:constraints :max-results-bare-rows] min pivot-limit))
                           add-canonical-col-info)]
       (if (and (not *force-legacy-pivot*)
                (native-pivot-supported? query)
                (not (has-window-fn-aggregation? query)))
         (run-native-pivot-query query rff pivot-opts pivot-limit)
         (run-pivot-query-multi query rff pivot-opts pivot-limit))))))
