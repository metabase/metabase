(ns metabase.lib.underlying
  "Helpers for getting at \"underlying\" or \"top-level\" queries and columns.
  This logic is shared by a handful of things like drill-thrus."
  (:refer-clojure :exclude [empty? not-empty #?(:clj for)])
  (:require
   [clojure.set :as set]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.breakout :as lib.breakout]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.field :as lib.field]
   [metabase.lib.field.util :as lib.field.util]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [empty? not-empty #?(:clj for)]]))

(mu/defn- pop-until-aggregation-or-breakout :- [:tuple [:maybe ::lib.schema/query] [:int {:max -1}]]
  "Strips off any trailing stages that do not contain aggregations or breakouts.

  Returns a tuple of [query, stage-number] where `query` is the first stage with aggregations or breakouts and
  `stage-number` is the (negative) index of that stage relative to the original query.

  If there are no such stages, returns [nil, -1]."
  [query :- ::lib.schema/query]
  (loop [query query
         i -1]
    (if (and (empty? (lib.aggregation/aggregations query -1))
             (empty? (lib.breakout/breakouts query -1)))
      ;; No aggregations or breakouts in the last stage, so pop it off and recur.
      (let [popped (update query :stages pop)]
        (if (seq (:stages popped))
          (recur popped (dec i))
          [nil, -1]))
      [query, i])))

(mu/defn top-level-query :- ::lib.schema/query
  "Returns the \"top-level\" query for the given query.

  That means dropping any trailing filters, fields, etc. to get back to the last stage that has an aggregation or
  breakout. If there are no such stages, the original query is returned.

  If the database does not support nested queries, this also returns the original query."
  [query :- ::lib.schema/query]
  (or (when (lib.metadata/database-supports? query :nested-queries)
        (first (pop-until-aggregation-or-breakout query)))
      query))

(mu/defn top-level-stage-number :- :int
  "Returns the stage-number of the [[top-level-query]] for the given query.

  If there are no such stages, or if the database does not supported nested queries, returns -1."
  [query :- ::lib.schema/query]
  (or (when (lib.metadata/database-supports? query :nested-queries)
        (second (pop-until-aggregation-or-breakout query)))
      -1))

(def ^:private TopLevelColumnOptions
  [:map
   {:closed true}
   [:rename-superfluous-options? {:optional true} :boolean]])

(mu/defn top-level-column :- [:maybe ::lib.schema.metadata/column]
  "Given a column, returns the \"top-level\" equivalent.

  Top-level means to find the corresponding column in the [[top-level-query]], which requires walking back through the
  stages finding the equivalent column at each one.

  Returns nil if the column can't be traced back to the top-level query."
  ([query  :- ::lib.schema/query
    column :- ::lib.schema.metadata/column]
   (top-level-column query column :rename-superfluous-options? true))
  ([query                                  :- ::lib.schema/query
    column                                 :- ::lib.schema.metadata/column
    & {:keys [rename-superfluous-options?]} :- TopLevelColumnOptions]
   (let [top-query (top-level-query query)]
     (if (= query top-query)
       column ;; Unchanged if this is already a top-level query. That includes keeping the "superfluous" options!
       (loop [query  query
              column column]
         (if (= query top-query)
           (cond-> column
             rename-superfluous-options?
             ;; Once we've found it, rename superfluous options, unless disabled by the caller, because under normal
             ;; circumstances, you will not need them. On the off chance you do need them, they'll still be available.
             (set/rename-keys {::lib.field/temporal-unit ::temporal-unit
                               ::lib.field/binning       ::binning}))
           (let [prev-cols (for [col (lib.metadata.calculation/returned-columns query -2 (lib.util/previous-stage query -1))]
                             (-> col
                                 lib.field.util/update-keys-for-col-from-previous-stage
                                 (assoc ::original col)))
                 prev-col  (some-> (lib.equality/find-matching-column query -2 (lib.ref/ref column) prev-cols)
                                   ::original)]
             (when prev-col
               (recur (update query :stages pop) prev-col)))))))))

(mu/defn has-aggregation-or-breakout?
  "Whether the `query` has an aggregation or breakout clause in some query stage."
  [query :- ::lib.schema/query]
  (some? (first (pop-until-aggregation-or-breakout query))))

;;; TODO (Cam 7/1/25) -- give this a better name now that it takes
;;;
;;;    (f col) => boolean
;;;
;;; instead of source keyword; not sure what to name it because I don't really know what the hecc 'underlying' is
;;; supposed to mean here
(mu/defn- has-source-or-underlying-source-fn :- [:function
                                                 [:-> [:maybe ::lib.schema.metadata/column] :boolean]
                                                 [:->
                                                  ::lib.schema/query
                                                  [:maybe ::lib.schema.metadata/column]
                                                  :boolean]]
  [f :- [:=> [:cat ::lib.schema.metadata/column] :boolean]]
  (fn f?
    ([column]
     (f column))
    ([query column]
     (boolean
      (and (seq column)
           (or (f? column)
               (f? (top-level-column query column))))))))

(def ^{:arglists '([column] [query column])} aggregation-sourced?
  "Does column or top-level-column have :source/aggregations?"
  (has-source-or-underlying-source-fn #(= (:lib/source %) :source/aggregations)))

(def ^{:arglists '([column] [query column])} breakout-sourced?
  "Is column or top-level-column used in breakouts?"
  (has-source-or-underlying-source-fn :lib/breakout?))

(mu/defn strictly-underlying-aggregation? :- :boolean
  "Does the [[top-level-column]] (but not `column` itself) in `query` have :source/aggregations?"
  [query  :- ::lib.schema/query
   column :- [:maybe ::lib.schema.metadata/column]]
  (and (not (aggregation-sourced? column))
       (aggregation-sourced? query column)))

(mu/defn traceable-dimensions :- [:maybe [:sequential :map]]
  "Filter dimensions to only those whose columns can be traced back to the top-level query.

  Returns nil if the result would be empty. This is used by drill-thrus to ensure they don't try to create filters
  on columns (like expressions defined in later stages) that don't exist in the top-level query.

  See issue #66715."
  [query :- ::lib.schema/query
   dimensions :- [:maybe [:sequential :map]]]
  (not-empty
   (for [dim   dimensions
         :when (top-level-column query (:column dim))]
     dim)))
