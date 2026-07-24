(ns metabase.query-processor.pivot
  "Pivot table query processor. Determines a bunch of different subqueries to run, then runs them one by one on the data
  warehouse and concatenates the result rows together, sort of like the way [[clojure.core/lazy-cat]] works. This is
  dumb, right? It's not just me? Why don't we just generate a big ol' UNION query so we can run one single query
  instead of running like 10 separate queries? -- Cam

  Note that this namespace is mostly responsible for generating the series of different queries to run and doing QP
  magic to combine the results together.

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
   [metabase.lib.options :as lib.options]
   [metabase.lib.pivot :as lib.pivot]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.aggregation :as lib.schema.aggregation]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.util :as lib.util]
   [metabase.models.visualization-settings :as mb.viz]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.middleware.nest-for-pivot :as qp.nest-for-pivot]
   [metabase.query-processor.middleware.normalize-query :as qp.middleware.normalize]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot.common :as pivot.common]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.util :as u]
   [metabase.util.experiment :as experiment]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.performance :refer [empty? every? get-in mapv not-empty select-keys some update-keys]]))

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

(mu/defn breakout-combinations :- ::pivot.common/breakout-combinations
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
                              qp.nest-for-pivot/remove-non-aggregation-order-bys
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

(defn- resolve-refs-to-uuids
  "Resolve `refs` to breakout `:lib/uuid` values from the last stage of `query`.

  `refs` is a sequence of pivot column references, either column-name strings (modern viz-settings) or legacy
  field-ref vectors. Refs that don't resolve (including ones that throw during resolution) are silently dropped.
  Returns nil when `refs` is empty."
  [query refs]
  (when (seq refs)
    (let [breakout-cols (filter :lib/breakout? (lib/returned-columns query))
          resolver      (if (every? string? refs)
                          (into {} (map (juxt :name :lib/source-uuid)) breakout-cols)
                          (fn ref-resolver [a-ref]
                            (try
                              (:lib/source-uuid (lib.equality/find-column-for-legacy-ref query -1 a-ref breakout-cols))
                              (catch Throwable _ nil))))]
      (into [] (keep resolver) refs))))

(mu/defn- build-pivot-clause :- [:maybe [:ref :metabase.lib.schema/pivot]]
  "Build the MBQL5 `:pivot` clause that expresses the pivot intent in `viz-settings`, with row/column refs resolved
  against the last stage's breakouts in `query`. Returns nil when there is no `:pivot_table.column_split` or when
  neither rows nor columns resolve."
  [query        :- :metabase.lib.schema/query
   viz-settings :- [:maybe :map]]
  (when-let [{:keys [rows columns]} (:pivot_table.column_split viz-settings)]
    (let [row-uuids (resolve-refs-to-uuids query rows)
          col-uuids (resolve-refs-to-uuids query columns)]
      (when (or (seq row-uuids) (seq col-uuids))
        {:rows               (or row-uuids [])
         :columns            (or col-uuids [])
         :show-row-totals    (lib.pivot/read-show-flag viz-settings :pivot.show_row_totals    "pivot.show_row_totals")
         :show-column-totals (lib.pivot/read-show-flag viz-settings :pivot.show_column_totals "pivot.show_column_totals")}))))

(mu/defn apply-pivot-viz-settings :- ::lib.schema/query
  "Attach a `:pivot` clause to the last stage of `query`, derived from `viz-settings` (see [[build-pivot-clause]]
  for the clause shape and resolution rules).

  Returns `query` unchanged when the last stage already has `:pivot`, when `viz-settings` is empty, or when no refs
  resolve."
  [query        :- ::lib.schema/query
   viz-settings :- [:maybe :map]]
  (let [clause (when (and (not (lib.pivot/has-pivot? query))
                          (seq viz-settings))
                 (build-pivot-clause query viz-settings))]
    (cond-> query
      clause (lib.pivot/with-pivot clause))))

(def ^:private legacy-pivot-keys
  [:pivot-rows :pivot_rows
   :pivot-cols :pivot_cols
   :pivot-measures :pivot_measures
   :show-row-totals :show_row_totals
   :show-column-totals :show_column_totals])

(mu/defn apply-legacy-pivot-keys :- ::lib.schema/query
  "Translate MBQL4 top-level pivot keys on `query` into an MBQL5 `:pivot` clause on the last stage, then strip the
  legacy keys.

  Reads positional-index keys (`:pivot-rows` / `:pivot_rows`, `:pivot-cols` / `:pivot_cols`) and the
  `show-*-totals` flags. Indices that fall outside the last stage's breakout vector are silently dropped.
  `:pivot-measures` is presentation-only and is discarded.

  If `query` already has a `:pivot` clause, only strips the legacy keys."
  [query :- ::lib.schema/query]
  (let [rows-idxs (or (:pivot-rows query) (:pivot_rows query))
        cols-idxs (or (:pivot-cols query) (:pivot_cols query))
        stripped  (reduce dissoc query legacy-pivot-keys)]
    (if (or (lib.pivot/has-pivot? query)
            (and (nil? rows-idxs) (nil? cols-idxs)))
      stripped
      (let [breakouts   (vec (:breakout (lib.util/query-stage query -1)))
            n           (count breakouts)
            index->uuid (fn [i]
                          (when (and (nat-int? i) (< i n))
                            (lib.options/uuid (nth breakouts i))))
            row-uuids   (into [] (keep index->uuid) (or rows-idxs []))
            col-uuids   (into [] (keep index->uuid) (or cols-idxs []))]
        (if (and (empty? row-uuids) (empty? col-uuids))
          stripped
          (lib.pivot/with-pivot stripped
            {:rows               row-uuids
             :columns            col-uuids
             :show-row-totals    (lib.pivot/read-show-flag query :show-row-totals    :show_row_totals)
             :show-column-totals (lib.pivot/read-show-flag query :show-column-totals :show_column_totals)}))))))

(defn- has-window-fn-aggregation?
  "True iff any aggregation in the last stage of `query` contains a window-function aggregation clause at any depth."
  [query]
  (boolean (some lib.schema.aggregation/window-aggregation-expression?
                 (lib/aggregations query))))

(defn native-pivot-compatible?
  "True iff the native MBQL5 pivot path can handle `query` end-to-end.

  Preprocesses the query first so the check sees the fully-expanded form — after metric/measure/segment
  expansion and source-card inlining — and then rejects only when a known incompatibility remains."
  [query]
  ;; The set of incompatibility reasons is intentionally small: each entry must point at a specific demonstrated
  ;; problem, never "just in case." Add new conditions by combining the existing predicates with `or` inside the
  ;; `not`.
  ;;
  ;; Window-function aggregations: a running total over `GROUPING SETS` results would span detail rows AND
  ;; subtotal rows, which is meaningless. The multi-query path runs one query per breakout combination, where
  ;; these aggregations behave as expected. Importantly, this check has to see the EXPANDED query — a metric
  ;; that resolves to `:cum-sum` is just as problematic as a `:cum-sum` written inline.
  (not (has-window-fn-aggregation? (qp.preprocess/preprocess query))))

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

(defn- pivot-opts-from-query
  "Return `query`'s pivot-options map — as downstream export middleware and streaming writers read it from
  `[:middleware :pivot-options]` — or `nil` when `query` carries no pivot intent."
  [query]
  (or
   (pivot-options query (get query :viz-settings))
   (pivot-options query (get-in query [:info :visualization-settings]))
   (not-empty (select-keys query [:pivot-rows :pivot-cols :pivot-measures :show-row-totals :show-column-totals]))))

(mu/defn- run-pivot-query-multi
  "Generate one subquery per breakout combination implied by `query`'s pivot intent (viz-settings or legacy keys),
  run each, and merge the results through `rff` into a single output."
  [query :- ::lib.schema/query
   rff   :- [:maybe ::qp.schema/rff]]
  (let [rff         (or rff qp.reducible/default-rff)
        pivot-opts  (pivot-opts-from-query query)
        pivot-limit (pivot-query-max-rows query)
        query       (-> query
                        (assoc-in [:middleware :pivot-options] pivot-opts)
                        (assoc-in [:constraints :max-results] pivot-limit)
                        (cond-> (get-in query [:constraints :max-results-bare-rows])
                          (update-in [:constraints :max-results-bare-rows] min pivot-limit))
                        add-canonical-col-info)
        all-queries (generate-queries query pivot-opts)]
    (process-multiple-queries all-queries rff pivot-limit)))

(defn- query-database
  "Return the Lib-style Database metadata for `query`, using its attached `:lib/metadata` provider or, failing that,
  one constructed from its `:database` id."
  [query]
  (lib.metadata/database
   (or (:lib/metadata query)
       (lib-be/application-database-metadata-provider (:database query)))))

(def ^:private ^:const float-compare-decimals
  "Decimal scale used when quantising fractional numbers for cross-path pivot row comparison. 6 is well below
  meaningful precision for pivot aggregates (SUM/AVG typically report 2–4 decimals) but well above the noise
  produced by different summation orders on doubles (order-of `10⁻¹⁴`)."
  6)

(defn- round-numeric
  "If `x` is fractional (Double / Float / BigDecimal), quantise it to a `BigDecimal` at
  [[float-compare-decimals]] scale. Integral numbers and non-numbers pass through unchanged. Normalising
  both floats and BigDecimals to `BigDecimal` at the same scale lets `=` succeed regardless of which type
  each path returned."
  [x]
  (cond
    (float? x)   (.setScale ^java.math.BigDecimal (bigdec x) (int float-compare-decimals) java.math.RoundingMode/HALF_UP)
    (decimal? x) (.setScale ^java.math.BigDecimal x          (int float-compare-decimals) java.math.RoundingMode/HALF_UP)
    :else        x))

(defn- pivot-rows-equivalent?
  "Compare pivot result maps from the two pivot paths. The candidate always uses `default-rff` and so carries
  `(:data :rows)` and `:row_count`; the control uses the caller's rff and may carry anything.

  When comparing rows, each cell is normalised via [[round-numeric]] to tolerate float-associativity noise
  between multi-`SUM` per-subquery and native `SUM` over `GROUPING SETS`."
  [r1 r2]
  (cond
    (-> r1 :data :rows) (= (frequencies (mapv #(mapv round-numeric %) (-> r1 :data :rows)))
                           (frequencies (mapv #(mapv round-numeric %) (-> r2 :data :rows))))
    (:row_count r1)     (= (:row_count r1) (:row_count r2))
    :else               true))

(defn- ensure-pivot-clause
  "Return `query` unchanged when its last stage already carries `:pivot`; otherwise attach a default `:pivot`
  clause so the SQL compiler emits every subset of breakouts as its own grouping set (the powerset)."
  [query]
  (cond-> query
    (not (lib.pivot/has-pivot? query))
    (lib.pivot/with-pivot {:rows [] :columns [] :show-row-totals true :show-column-totals true})))

(defn- run-native-pivot-query
  "Translate `query`'s pivot intent (legacy top-level keys and/or viz-settings) into an MBQL5 `:pivot` clause
  on the last stage and submit to the standard QP through `rff`."
  [query rff]
  (let [viz-settings (or (:viz-settings query)
                         (get-in query [:info :visualization-settings]))
        pivot-opts   (pivot-opts-from-query query)]
    (-> query
        apply-legacy-pivot-keys
        (apply-pivot-viz-settings viz-settings)
        ensure-pivot-clause
        (assoc-in [:middleware :pivot-options] pivot-opts)
        (cond-> (seq (:info query)) qp/userland-query)
        (qp/process-query rff))))

(mu/defn run-pivot-query
  "Run the pivot `query` through `rff` via the multi-query path (one query per breakout combination, results
  concatenated).

  Wrap this call in [[metabase.query-processor.streaming/streaming-response]] yourself.

  Experimental candidate: the native MBQL5 pivot path (single `GROUPING SETS` query), chosen when the target
  driver supports `:native-pivot-tables` and `query` is [[native-pivot-compatible?]]; otherwise falls back to
  the multi-query path."
  ([query]
   (run-pivot-query query nil))

  ([query :- ::qp.schema/any-query
    rff   :- [:maybe ::qp.schema/rff]]
   (log/debugf "Running pivot query:\n%s" (u/pprint-to-str query))
   ;; Do not bind *card-id* here. Callers that run pivot queries for saved cards
   ;; (e.g. card.clj, dashboards) bind *card-id* themselves before calling
   ;; run-pivot-query, so binding it here from the query's :info map would be
   ;; redundant and could mis-set it for ad-hoc queries that carry a :card-id in :info.
   (qp.setup/with-qp-setup [query query]
     (let [query (qp.middleware.normalize/normalize-preprocessing-middleware query)
           db    (query-database query)]
       (experiment/experiment {:name           :pivot-native-vs-multi
                               :comparator-fn  pivot-rows-equivalent?}
                              (run-pivot-query-multi query rff)
                              (binding [qp.pipeline/*result* qp.pipeline/default-result-handler]
                                (let [candidate-rff qp.reducible/default-rff]
                                  (if (and (driver.u/supports? (:engine db) :native-pivot-tables db)
                                           (native-pivot-compatible? query))
                                    (run-native-pivot-query query candidate-rff)
                                    (run-pivot-query-multi  query candidate-rff)))))))))
