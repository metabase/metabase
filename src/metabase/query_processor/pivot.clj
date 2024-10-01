(ns metabase.query-processor.pivot
  "Pivot table query processor. Determines a bunch of different subqueries to run, then runs them one by one on the data
  warehouse and concatenates the result rows together, sort of like the way [[clojure.core/lazy-cat]] works. This is
  dumb, right? It's not just me? Why don't we just generate a big ol' UNION query so we can run one single query
  instead of running like 10 separate queries? -- Cam"
  (:require
   [medley.core :as m]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.metadata.jvm :as lib.metadata.jvm]
   [metabase.lib.query :as lib.query]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.middleware.add-dimension-projections :as qp.add-dimension-projections]
   [metabase.query-processor.middleware.permissions :as qp.perms]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.reducible :as qp.reducible]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.query-processor.setup :as qp.setup]
   [metabase.query-processor.store :as qp.store]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(set! *warn-on-reflection* true)

(defn- powerset
  "Generate a powerset while maintaining the original ordering as much as possible"
  [xs]
  (for [combo (reverse (range (int (Math/pow 2 (count xs)))))]
    (for [item  (range 0 (count xs))
          :when (not (zero? (bit-and (bit-shift-left 1 item) combo)))]
      (nth xs item))))

;;; these defs are just for readability, even tho they're all just ints > 0
(mr/def ::bitmask       ::lib.schema.common/int-greater-than-or-equal-to-zero)
(mr/def ::num-breakouts ::lib.schema.common/int-greater-than-or-equal-to-zero)
(mr/def ::index         ::lib.schema.common/int-greater-than-or-equal-to-zero)

(mr/def ::pivot-rows [:sequential ::index])
(mr/def ::pivot-cols [:sequential ::index])

(mu/defn ^:private group-bitmask :- ::bitmask
  "Come up with a display name given a combination of breakout `indexes` e.g.

  This is basically a bitmask of which breakout indexes we're excluding, but reversed. Why? This is how Postgres and
  other DBs determine group numbers. This implements basically what PostgreSQL does for grouping -- look at the original
  set of groups - if that column is part of *this* group, then set the appropriate bit (entry 1 sets bit 1, etc)

    (group-bitmask 3 [1])   ; -> [_ 1 _] -> 101 -> 101 -> 5
    (group-bitmask 3 [1 2]) ; -> [_ 1 2] -> 100 -> 011 -> 1"
  [num-breakouts :- ::num-breakouts
   indexes       :- [:sequential ::index]]
  (transduce
   (map (partial bit-shift-left 1))
   (completing bit-xor)
   (int (dec (Math/pow 2 num-breakouts)))
   indexes))

(mr/def ::breakout-combination
  [:sequential ::index])

(mr/def ::breakout-combinations
  [:and
   [:sequential ::breakout-combination]
   [:fn
    {:error/message "Distinct combinations"}
    #(or (empty? %)
         (apply distinct? %))]])

(mu/defn ^:private breakout-combinations :- ::breakout-combinations
  "Return a sequence of all breakout combinations (by index) we should generate queries for.

    (breakout-combinations 3 [1 2] nil) ;; -> [[0 1 2] [] [1 2] [2] [1]]"
  [num-breakouts :- ::num-breakouts
   pivot-rows    :- [:maybe ::pivot-rows]
   pivot-cols    :- [:maybe ::pivot-cols]]
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
   (partial group-bitmask num-breakouts)
   (distinct
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

(mu/defn ^:private keep-breakouts-at-indexes :- ::lib.schema/query
  "Keep the breakouts at indexes, reordering them if needed. Remove all other breakouts."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (reduce
     (fn [query i]
       (lib/breakout query (nth all-breakouts i)))
     (-> (lib/remove-all-breakouts query)
         (assoc :qp.pivot/breakout-combination breakout-indexes-to-keep))
     breakout-indexes-to-keep)))

(mu/defn ^:private add-pivot-group-breakout :- ::lib.schema/query
  "Add the grouping field and expression to the query"
  [query   :- ::lib.schema/query
   bitmask :- ::bitmask]
  (as-> query query
    ;;TODO: replace this value with a bitmask or something to indicate the source better
    (lib/expression query -1 "pivot-grouping" (lib/abs bitmask) {:add-to-fields? false})
    ;; in PostgreSQL and most other databases, all the expressions must be present in the breakouts. Add a pivot
    ;; grouping expression ref to the breakouts
    (lib/breakout query (lib/expression-ref query "pivot-grouping"))
    (do
      (log/tracef "Added pivot-grouping expression to query\n%s" (u/pprint-to-str 'yellow query))
      query)))

(mu/defn ^:private remove-non-aggregation-order-bys :- ::lib.schema/query
  "Only keep existing aggregations in `:order-by` clauses from the query. Since we're adding our own breakouts (i.e.
  `GROUP BY` and `ORDER BY` clauses) to do the pivot table stuff, existing `:order-by` clauses probably won't work --
  `ORDER BY` isn't allowed for fields that don't appear in `GROUP BY`."
  [query :- ::lib.schema/query]
  (reduce
   (fn [query [_tag _opts expr :as order-by]]
     ;; keep any order bys on :aggregation references. Remove all other clauses.
     (cond-> query
       (not (lib.util/clause-of-type? expr :aggregation))
       (lib/remove-clause order-by)))
   query
   (lib/order-bys query)))

(mu/defn ^:private generate-queries :- [:sequential ::lib.schema/query]
  "Generate the additional queries to perform a generic pivot table"
  [query                                               :- ::lib.schema/query
   {:keys [pivot-rows pivot-cols], :as _pivot-options} :- [:map
                                                           [:pivot-rows {:optional true} [:maybe ::pivot-rows]]
                                                           [:pivot-cols {:optional true} [:maybe ::pivot-cols]]]]
  (try
    (let [all-breakouts (lib/breakouts query)
          all-queries   (for [breakout-indexes (u/prog1 (breakout-combinations (count all-breakouts) pivot-rows pivot-cols)
                                                 (log/tracef "Using breakout combinations: %s" (pr-str <>)))
                              :let             [group-bitmask (group-bitmask (count all-breakouts) breakout-indexes)]]
                          (-> query
                              remove-non-aggregation-order-bys
                              (keep-breakouts-at-indexes breakout-indexes)
                              (add-pivot-group-breakout group-bitmask)))]
      (conj (rest all-queries)
            (assoc-in (first all-queries) [:info :pivot/original-query] query)))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(mr/def ::column-mapping-fn
  ;; not 100% on what the return value is supposed to be, need to figure out what exactly [[make-column-mapping-fn]]
  ;; returns
  [:=> [:cat ::lib.schema/query] ::pivot-column-mapping])

;;; something like [nil 0 1 2] or [0 nil 1 2]
(mr/def ::pivot-column-mapping
  [:sequential [:maybe ::index]])

;;; this schema is mostly just for documentation purposes
(mr/def ::row
  [:sequential :any])

(mu/defn ^:private row-mapping-fn :- [:=> [:cat ::row] ::row]
  "This function needs to be called for each row so that it can actually shape the row according to the
  `column-mapping-fn` we build at the beginning.

  Row mapping function is a function that can reorder the row and add `nil`s for columns that aren't present in a
  particular subquery, with the signature

    (f row) => row'

  e.g.

    (f [1 2 3]) => [2 nil 3 nil 1]"
  [pivot-column-mapping :- ::pivot-column-mapping]
  ;; the first query doesn't need any special mapping, it already has all the columns
  (if pivot-column-mapping
    (apply juxt (for [mapping pivot-column-mapping]
                  (if mapping
                    #(nth % mapping)
                    (constantly nil))))
    identity))

(mu/defn ^:private process-query-append-results
  "Reduce the results of a single `query` using `rf` and initial value `init`."
  [query                :- ::lib.schema/query
   rf                   :- ::qp.schema/rf
   init                 :- :any
   info                 :- [:maybe ::lib.schema.info/info]
   pivot-column-mapping :- ::pivot-column-mapping]
  (if (qp.pipeline/canceled?)
    (ensure-reduced init)
    (let [xform (map (row-mapping-fn pivot-column-mapping))
          rff   (fn [_metadata]
                  (let [rf (fn rf*
                             ([]        init)
                             ([acc]     acc)
                             ([acc row] (rf acc row)))]
                    (xform rf)))]
      (try
        (let [query (cond-> query
                      (seq info) (qp/userland-query info))]
          (qp/process-query query rff))
        (catch Throwable e
          (log/error e "Error processing additional pivot table query")
          (throw e))))))

(mu/defn ^:private process-queries-append-results
  "Reduce the results of a sequence of `queries` using `rf` and initial value `init`."
  [init
   queries           :- [:sequential ::lib.schema/query]
   rf                :- ::qp.schema/rf
   info              :- [:maybe ::lib.schema.info/info]
   column-mapping-fn :- ::column-mapping-fn]
  (reduce
   (fn [acc query]
     (let [pivot-column-mapping (column-mapping-fn query)]
       (process-query-append-results query rf acc info pivot-column-mapping)))
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
  [more-queries :- [:sequential ::lib.schema/query]]
  (when (seq more-queries)
    (fn multiple-execute [driver query respond]
      (respond {::driver driver} query))))

(mu/defn ^:private append-queries-reduce-fn :- fn?
  "Build the version of [[qp.pipeline/*reduce*]] used at the top level for running pivot queries."
  [info              :- [:maybe ::lib.schema.info/info]
   more-queries      :- [:sequential ::lib.schema/query]
   vrf               :- [:fn {:error/message "volatile"} volatile?]
   column-mapping-fn :- ::column-mapping-fn]
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
                            (process-queries-append-results more-queries @vrf info column-mapping-fn)))]
          ;; completion arity can't be threaded because the value is derefed too early
          (qp.pipeline/*result* (@vrf acc)))))))

(mu/defn ^:private append-queries-rff-and-fns
  "RFF and QP pipeline functions to use when executing pivot queries."
  [info              :- [:maybe ::lib.schema.info/info]
   rff               :- ::qp.schema/rff
   more-queries      :- [:sequential ::lib.schema/query]
   column-mapping-fn :- ::column-mapping-fn]
  (let [vrf (volatile! nil)]
    {:rff      (append-queries-rff rff vrf)
     :execute  (append-queries-execute-fn more-queries)
     :reduce   (append-queries-reduce-fn info more-queries vrf column-mapping-fn)}))

(mu/defn ^:private process-multiple-queries
  "Allows the query processor to handle multiple queries, stitched together to appear as one"
  [[{:keys [info], :as first-query} & more-queries] :- [:sequential ::lib.schema/query]
   rff                                              :- ::qp.schema/rff
   column-mapping-fn                                :- ::column-mapping-fn]
  (let [{:keys [rff execute reduce]} (append-queries-rff-and-fns info rff more-queries column-mapping-fn)
        first-query                  (cond-> first-query
                                       (seq info) qp/userland-query-with-default-constraints)]
    (binding [qp.pipeline/*execute* (or execute qp.pipeline/*execute*)
              qp.pipeline/*reduce*  (or reduce qp.pipeline/*reduce*)]
      (qp/process-query first-query rff))))

(mu/defn ^:private pivot-options :- [:map
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
                                                                            (cond-> col
                                                                              true                         (assoc ::i i)
                                                                              ;; if the col has a card-id, we swap the :lib/source to say source/card
                                                                              ;; this allows `lib/find-matching-column` to properly match a column that has a join-alias
                                                                              ;; but whose source is a model
                                                                              (contains? col :lib/card-id) (assoc :lib/source :source/card))))
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

(mu/defn ^:private column-mapping-for-subquery :- ::pivot-column-mapping
  [num-canonical-cols            :- ::lib.schema.common/int-greater-than-or-equal-to-zero
   num-canonical-breakouts       :- ::num-breakouts
   subquery-breakout-combination :- ::breakout-combination]
  ;; all pivot queries consist of *breakout columns* + *other columns*. Breakout columns are always first, and the only
  ;; thing that can change between subqueries. The other columns will always be the same, and in the same order.
  (let [;; one of the breakouts will always be for the pivot group breakout added by [[add-pivot-group-breakout]],
        ;; always added last, but this is not included in the breakout combination, so add it in so we make sure it's
        ;; mapped properly
        subquery-breakout-combination
        (conj subquery-breakout-combination (dec num-canonical-breakouts))

        ;; First, let's build a map of the canonical column index to the index in the current subquery. To build the
        ;; map, we build it in two parts:
        canonical-index->subquery-index
        (merge
         ;; 1. breakouts remapping, based on the `:qp.pivot/breakout-combination`
         (into {}
               (map (fn [[subquery-index canonical-index]]
                      [canonical-index subquery-index]))
               (m/indexed subquery-breakout-combination))
         ;; 2. other columns remapping, which just takes the other columns offset in the subquery and moves that column
         ;;    so it matches up with the position it is in the canonical query.
         (let [canonical-other-columns-offset num-canonical-breakouts
               subquery-other-columns-offset  (count subquery-breakout-combination)
               num-other-columns              (- num-canonical-cols num-canonical-breakouts)]
           (into {}
                 (map (fn [i]
                        [(+ canonical-other-columns-offset i) (+ subquery-other-columns-offset i)]))
                 (range num-other-columns))))]
    ;; e.g.
    ;;
    ;;    ;; column 1 in the subquery results corresponds to 2 in the canonical results, 3 corresponds to 0
    ;;    {1 2, 3 0}
    ;;
    ;; next, let's use that map to make a vector of like
    ;;
    ;;    [nil 2 nil 0]
    ;;
    ;; e.g.
    ;;
    ;; * canonical column 0 has no corresponding column in the subquery
    ;; * canonical column 2 corresponds to subquery column 1
    (mapv (fn [i]
            (get canonical-index->subquery-index i))
          (range num-canonical-cols))))

(defn- remapped-field
  [breakout]
  (when (and (vector? breakout)
             (= (first breakout) :field))
    (not-empty (select-keys (second breakout)
                            [::qp.add-dimension-projections/original-field-dimension-id
                             ::qp.add-dimension-projections/new-field-dimension-id]))))

(defn- remapped-indexes
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
          (map (juxt ::qp.add-dimension-projections/original-field-dimension-id
                     ::qp.add-dimension-projections/new-field-dimension-id))
          (vals remap-pairs))))

(mu/defn ^:private splice-in-remap :- ::breakout-combination
  "Returns the breakout combination corresponding to `breakout-combination` belonging to the base query (the one without
  remapped fields) accounting for the field remapping specified by `remap`.

  To produce the breakout combination for the real query, the target indexes have to be included whenever a source
  index is selected, we have to shift the indexes before which a mapped index is inserted."
  [breakout-combination :- ::breakout-combination
   remap                :- [:map-of ::index ::index]]
  (if (or (empty? remap)
          (empty? breakout-combination))
    breakout-combination
    (let [limit (apply max breakout-combination)
          selected (set breakout-combination)
          inserted (set (vals remap))]
      (loop [index 0, offset 0, combination #{}]
        (if (> index limit)
          (-> combination sort vec)
          (let [offset (cond-> offset
                         (inserted (+ index offset)) inc)
                spliced-index (+ index offset)
                selected? (selected index)
                mapped-index (when selected?
                               (remap spliced-index))]
            (recur (inc index)
                   offset
                   (cond-> combination
                     selected?    (conj spliced-index)
                     mapped-index (into (take-while some? (iterate remap mapped-index)))))))))))

(mu/defn ^:private make-column-mapping-fn :- ::column-mapping-fn
  "This returns a function with the signature

    (f query) => column-remapping

  Where `column-remapping` looks something like

    {0 2, 1 3, 2 4}

  `column-remapping` is a map of

    column number in subquery results => column number in the UNION-style overall pivot results

  Some pivot subqueries exclude certain breakouts, so we need to fill in those missing columns with `nil` in the overall
  results -- "
  [query :- ::lib.schema/query]
  (let [remapped-query          (->> query
                                     lib.convert/->legacy-MBQL
                                     qp.add-dimension-projections/add-remapped-columns
                                     (lib.query/query (qp.store/metadata-provider)))
        remap                   (remapped-indexes (lib/breakouts remapped-query))
        canonical-query         (add-pivot-group-breakout remapped-query 0) ; a query that returns ALL the result columns.
        canonical-cols          (lib/returned-columns canonical-query)
        num-canonical-cols      (count canonical-cols)
        num-canonical-breakouts (count (filter #(= (:lib/source %) :source/breakouts)
                                               canonical-cols))]
    (fn column-mapping-fn* [subquery]
      (let [breakout-combination (:qp.pivot/breakout-combination subquery)
            full-breakout-combination (splice-in-remap breakout-combination remap)]
        (column-mapping-for-subquery num-canonical-cols num-canonical-breakouts full-breakout-combination)))))

(mu/defn run-pivot-query
  "Run the pivot query. You are expected to wrap this call in [[metabase.query-processor.streaming/streaming-response]]
  yourself."
  ([query]
   (run-pivot-query query nil))

  ([query :- ::qp.schema/query
    rff   :- [:maybe ::qp.schema/rff]]
   (log/debugf "Running pivot query:\n%s" (u/pprint-to-str query))
   (binding [qp.perms/*card-id* (get-in query [:info :card-id])]
     (qp.setup/with-qp-setup [query query]
       (let [rff               (or rff qp.reducible/default-rff)
             query             (lib/query (qp.store/metadata-provider) query)
             pivot-options     (or
                                (not-empty (select-keys query [:pivot-rows :pivot-cols]))
                                (pivot-options query (get-in query [:info :visualization-settings])))
             query             (assoc-in query [:middleware :pivot-options] pivot-options)
             all-queries       (generate-queries query pivot-options)
             column-mapping-fn (make-column-mapping-fn query)]
         (process-multiple-queries all-queries rff column-mapping-fn))))))
