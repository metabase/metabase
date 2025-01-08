(ns metabase.lib.drill-thru.common
  (:require
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]))

(defn mbql-stage?
  "Is this query stage an MBQL stage?"
  [query stage-number]
  (-> (lib.util/query-stage query stage-number)
      :lib/type
      (= :mbql.stage/mbql)))

(defn- drill-thru-dispatch [_query _stage-number drill-thru & _args]
  (:type drill-thru))

(defmulti drill-thru-method
  "e.g.

    (drill-thru-method query stage-number drill-thru)`

  Applies the `drill-thru` to the query and stage. Keyed on the `:type` of the drill-thru.
  Returns the updated query."
  {:arglists '([query stage-number drill-thru & args])}
  drill-thru-dispatch
  :hierarchy lib.hierarchy/hierarchy)

(defmulti drill-thru-info-method
  "Helper for getting the display-info of each specific type of drill-thru."
  {:arglists '([query stage-number drill-thru])}
  drill-thru-dispatch
  :hierarchy lib.hierarchy/hierarchy)

(defmethod drill-thru-info-method :default
  [_query _stage-number drill-thru]
  ;; Several drill-thrus are rendered as a fixed label for that type, with no reference to the column or value,
  ;; so the default is simply the drill-thru type.
  (select-keys drill-thru [:type :display-name]))

(defn many-pks?
  "Does the source table for this `query` have more than one primary key?"
  [query]
  (> (count (lib.metadata.calculation/primary-keys query)) 1))

(defn drill-value->js
  "Convert a drill value to a JS value"
  [value]
  (if (= value :null) nil value))

(defn- has-source-or-underlying-source-fn
  [source]
  (fn has-source?
    ([column]
     (= (:lib/source column) source))
    ([query column]
     (and
      (seq column)
      (or (has-source? column)
          (has-source? (lib.underlying/top-level-column query column)))))))

(def aggregation-sourced?
  "Does column or top-level-column have :source/aggregations?"
  (has-source-or-underlying-source-fn :source/aggregations))

(def breakout-sourced?
  "Does column or top-level-column have :source/breakouts?"
  (has-source-or-underlying-source-fn :source/breakouts))

(defn strictly-underlying-aggregation?
  "Does the top-level-column for `column` in `query` have :source/aggregations?"
  [query column]
  (and (not (aggregation-sourced? column))
       (aggregation-sourced? query column)))

(defn dimensions-from-breakout-columns
  "Convert `row` data into dimensions for `column`s that come from an aggregation in a previous stage."
  [query column row]
  (when (strictly-underlying-aggregation? query column)
    (not-empty (filterv #(breakout-sourced? query (:column %))
                        row))))
