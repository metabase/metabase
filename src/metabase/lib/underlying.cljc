(ns metabase.lib.underlying
  "Helpers for getting at \"underlying\" or \"top-level\" queries and columns.
  This logic is shared by a handful of things like drill-thrus."
  (:require
   [clojure.set :as set]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn ^:private pop-until-aggregation-or-breakout :- [:maybe ::lib.schema/query]
  "Strips off any trailing stages that do not contain aggregations.

  If there are no such stages, returns nil."
  [query :- ::lib.schema/query]
  (if (and (empty? (lib.aggregation/aggregations query -1))
           (empty? (lib.breakout/breakouts query -1)))
    ;; No aggregations or breakouts in the last stage, so pop it off and recur.
    (let [popped (update query :stages pop)]
      (when (seq (:stages popped))
        (recur popped)))
    query))

(mu/defn top-level-query :- ::lib.schema/query
  "Returns the \"top-level\" query for the given query.

  That means dropping any trailing filters, fields, etc. to get back to the last stage that has an aggregation. If there
  are no stages with aggregations, the original query is returned.

  If the database does not support nested queries, this also returns the original."
  [query :- ::lib.schema/query]
  (or (when ((-> query lib.metadata/database :features) :nested-queries)
        (pop-until-aggregation-or-breakout query))
      query))

(mu/defn top-level-column :- ::lib.schema.metadata/column
  "Given a column, returns the \"top-level\" equivalent.

  Top-level means to find the corresponding column in the [[top-level-query]], which requires walking back through the
  stages finding the equivalent column at each one.

  Returns nil if the column can't be traced back to the top-level query."
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [top-query (top-level-query query)]
    (if (= query top-query)
      column ;; Unchanged if this is already a top-level query. That includes keeping the "superfluous" options!
      (loop [query  query
             column column]
        (if (= query top-query)
          ;; Once we've found it, rename superfluous options, because under normal circumstances you will not need
          ;; them. On the off chance you do need them, they'll still be available.
          (set/rename-keys column {::lib.field/temporal-unit ::temporal-unit
                                   ::lib.field/binning       ::binning})
          (let [prev-cols (lib.metadata.calculation/returned-columns query -2 (lib.util/previous-stage query -1))
                prev-col  (lib.equality/find-matching-column query -2 (lib.ref/ref column) prev-cols)]
            (when prev-col
              (recur (update query :stages pop) prev-col))))))))
