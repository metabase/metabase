(ns metabase.query-processor.pivot.impl.new
  (:require
   [clojure.set :as set]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.util :as lib.util]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.query-processor.pivot.impl.common :as qp.pivot.impl.common]
   [metabase.query-processor.schema :as qp.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]))

(mu/defn ^:private add-pivot-group-breakout :- ::lib.schema/query
  "Add the grouping field and expression to the query"
  [query   :- ::lib.schema/query
   bitmask :- ::qp.pivot.impl.common/bitmask]
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

(mu/defn replace-breakouts-with-null-expressions :- ::lib.schema/query
  "Keep the breakouts at indexes. Replace other breakouts with expressions that return `NULL`."
  [query                    :- ::lib.schema/query
   breakout-indexes-to-keep :- [:maybe ::qp.pivot.impl.common/breakout-combination]]
  (let [all-breakouts (lib/breakouts query)]
    (reduce
     (fn [query i]
       (if (contains? (set breakout-indexes-to-keep) i)
         (lib/breakout query (nth all-breakouts i))
         (let [original-breakout    (nth all-breakouts i)
               null-expression-name (lib.metadata.calculation/column-name query original-breakout)
               original-type        (lib/type-of query (nth all-breakouts i))]
           (as-> query query
             (lib/expression query null-expression-name [:value {:lib/uuid       (str (random-uuid))
                                                                 :base-type      original-type
                                                                 :effective-type original-type}
                                                         nil])
             (lib/breakout query (lib/expression-ref query null-expression-name))))))
     (-> (lib/remove-all-breakouts query)
         (assoc :qp.pivot/breakout-combination breakout-indexes-to-keep))
     (range 0 (count all-breakouts)))))

(mr/def ::pivot-options
  [:map
   [:pivot-rows {:optional true} [:maybe ::qp.pivot.impl.common/pivot-rows]]
   [:pivot-cols {:optional true} [:maybe ::qp.pivot.impl.common/pivot-cols]]])

(mu/defn ^:private generate-queries :- [:sequential ::lib.schema/query]
  "Generate the additional queries to perform a generic pivot table"
  [query                                               :- ::lib.schema/query
   {:keys [pivot-rows pivot-cols], :as _pivot-options} :- ::pivot-options]
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
                              remove-non-aggregation-order-bys
                              (replace-breakouts-with-null-expressions breakout-indexes)
                              (add-pivot-group-breakout group-bitmask)))]
      (conj (rest all-queries)
            (assoc-in (first all-queries) [:info :pivot/original-query] query)))
    (catch Throwable e
      (throw (ex-info (tru "Error generating pivot queries")
                      {:type qp.error-type/qp, :query query}
                      e)))))

(mr/def ::compiled-query
  [:map
   [:lib/type [:= :mbql/query]]
   [:database ::lib.schema.id/database]
   [:stages   [:sequential {:min 1, :max 1} ::lib.schema/stage.native]]])

(mu/defn ^:private generate-compiled-queries :- [:sequential {:min 1} ::compiled-query]
  [query         :- ::lib.schema/query
   pivot-options :- ::pivot-options]
  (mapv (fn [query]
          (assoc query :stages [(merge {:lib/type :mbql.stage/native}
                                       (set/rename-keys (qp.compile/compile query) {:query :native}))]))
        (generate-queries query pivot-options)))

(mu/defmethod qp.pivot.impl.common/run-pivot-query :qp.pivot.impl/new
  "Legacy implementation for running pivot queries."
  [_impl-name
   query :- ::qp.schema/query
   rff   :- ::qp.schema/rff]
  (let [pivot-options (or (get-in query [:middleware :pivot-options])
                          (throw (ex-info "Missing pivot options" {:query query, :type qp.error-type/qp})))
        queries       (generate-compiled-queries query pivot-options)
        respond       (fn respond [metadata rows]
                        (let [rf (rff metadata)]
                          (transduce identity rf rows)))]
    (driver/EXPERIMENTAL-execute-multiple-queries driver/*driver* queries respond)))
