(ns metabase.query-processor.pivot.impl.legacy
  "Legacy implementation of the pivot table query processor. Determines a bunch of different subqueries to run, then
  runs them one by one on the data warehouse and concatenates the result rows together, sort of like the
  way [[clojure.core/lazy-cat]] works. Deprecated in favor of the [[metabase.query-processor.pivot.impl.new]]]
  implementation that runs all constituent queries at the same time, but here for drivers that don't
  implement [[metabase.driver/EXPERIMENTAL-execute-multiple-queries]]."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.info :as lib.schema.info]
   [metabase.query-processor :as qp]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn ^:private keep-breakouts-at-indexes :- ::lib.schema/query
  "Keep the breakouts at indexes, reordering them if needed. Remove all other breakouts."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::qp.pivot.impl.common/breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (reduce
     (fn [query i]
       (lib/breakout query (nth all-breakouts i)))
     (-> (lib/remove-all-breakouts query)
         (assoc :qp.pivot/breakout-combination breakout-indexes-to-keep))
     breakout-indexes-to-keep)))

(mu/defn ^:private generate-queries :- [:sequential ::lib.schema/query]
  "Generate the additional queries to perform a generic pivot table"
  [query                                               :- ::lib.schema/query
   {:keys [pivot-rows pivot-cols], :as _pivot-options} :- [:maybe
                                                           [:map
                                                            [:pivot-rows {:optional true} [:maybe ::qp.pivot.impl.common/pivot-rows]]
                                                            [:pivot-cols {:optional true} [:maybe ::qp.pivot.impl.common/pivot-cols]]]]]
  (try
    (let [all-breakouts (lib/breakouts query)
          all-queries   (for [breakout-indexes (u/prog1 (qp.pivot.impl.common/breakout-combinations
                                                         (count all-breakouts)
                                                         pivot-rows
                                                         pivot-cols)
                                                 (log/tracef "Using breakout combinations: %s" (pr-str <>)))
                              :let             [group-bitmask (qp.pivot.impl.common/group-bitmask
                                                               (count all-breakouts)
                                                               breakout-indexes)]]
                          (-> query
                              qp.pivot.impl.common/remove-non-aggregation-order-bys
                              (keep-breakouts-at-indexes breakout-indexes)
                              (qp.pivot.impl.common/add-pivot-group-breakout group-bitmask)))]
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
  [:sequential [:maybe ::qp.pivot.impl.common/index]])

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

(mu/defn ^:private column-mapping-for-subquery :- ::pivot-column-mapping
  [num-canonical-cols            :- ::lib.schema.common/int-greater-than-or-equal-to-zero
   num-canonical-breakouts       :- ::qp.pivot.impl.common/num-breakouts
   subquery-breakout-combination :- ::qp.pivot.impl.common/breakout-combination]
  ;; all pivot queries consist of *breakout columns* + *other columns*. Breakout columns are always first, and the only
  ;; thing that can change between subqueries. The other columns will always be the same, and in the same order.
  (let [;; one of the breakouts will always be for the pivot group breakout added
        ;; by [[qp.pivot.impl.common/add-pivot-group-breakout]], always added last, but this is not included in the
        ;; breakout combination, so add it in so we make sure it's mapped properly
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
  (let [canonical-query         (qp.pivot.impl.common/add-pivot-group-breakout query 0) ; a query that returns ALL the result columns.
        canonical-cols          (lib/returned-columns canonical-query)
        num-canonical-cols      (count canonical-cols)
        num-canonical-breakouts (count (filter #(= (:lib/source %) :source/breakouts)
                                               canonical-cols))]
    (fn column-mapping-fn* [subquery]
      (column-mapping-for-subquery num-canonical-cols num-canonical-breakouts (:qp.pivot/breakout-combination subquery)))))

(mu/defmethod qp.pivot.impl.common/run-pivot-query :qp.pivot.impl/legacy
  "Legacy implementation for running pivot queries."
  [_impl-name
   query :- ::qp.schema/query
   rff   :- ::qp.schema/rff]
  (let [pivot-options     (or (get-in query [:middleware :pivot-options])
                              (throw (ex-info "Missing pivot options" {:query query, :type qp.error-type/qp})))
        all-queries       (generate-queries query pivot-options)
        column-mapping-fn (make-column-mapping-fn query)]
    (process-multiple-queries all-queries rff column-mapping-fn)))
