(ns metabase.lib.drill-thru.common
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

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
  "Convert a drill value to a JS value."
  [value]
  (if (= value :null) nil value))

(defn js->drill-value
  "Convert a JS value to a drill value."
  [value]
  (if (nil? value) :null value))

(defn dimensions-from-breakout-columns
  "Convert `row` data into dimensions for `column`s that come from an aggregation in a previous stage."
  [query column row]
  (when (lib.underlying/strictly-underlying-aggregation? query column)
    (not-empty (filterv #(lib.underlying/breakout-sourced? query (:column %))
                        row))))

(mu/defn- possible-model-mapped-breakout-column? :- :boolean
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [breakout-sourced? (= :source/breakouts (:lib/source column))
        model-sourced? (lib.card/source-card-is-model? query)
        has-id? (:id column)]
    (and breakout-sourced? model-sourced? (boolean has-id?))))

(mu/defn- day-bucketed-breakout-column? :- :boolean
  [column :- ::lib.schema.metadata/column]
  (let [breakout-sourced? (= :source/breakouts (:lib/source column))
        day-bucketed? (= (:metabase.lib.field/temporal-unit column) :day)]
    (and breakout-sourced? day-bucketed?)))

(mu/defn breakout->resolved-column :- ::lib.schema.metadata/column
  "Given a breakout sourced column, return the resolved metadata for the column in this stage."
  ([query stage-number column] (breakout->resolved-column query stage-number column nil))
  ([query        :- ::lib.schema/query
    stage-number :- :int
    column       :- ::lib.schema.metadata/column
    {:keys [preserve-type?]}]
   ;; TODO: This is a hack to workaround field refs confusion that should be fixed by the field refs overhaul. Remove
   ;; this function and possible-model-mapped-breakout-column?, above, once the field refs overhaul lands.
   ;;
   ;; If a breakout-sourced column comes from a model based on a native query that renames the column with an "AS"
   ;; alias, AND where the column has been mapped to a real DB field, then we can't use the breakout column directly
   ;; and must instead lookup the equivalent "resolved" column metadata. This results in a (hopefully) equivalent
   ;; column where the :lib/source is no longer :source/breakouts, but rather :source/card, which allows
   ;; column-metadata->field-ref to recognize that it needs to generate a named-based ref. This is required because an
   ;; id-based ref will wind up generating SQL that matches the underlying mapped column's name, not the name of the
   ;; column from the model's native query (which was renamed via "AS").
   ;;
   ;; When a breakout column is bucketed by day, it is cast to type/Date. If we create filters for such a column,
   ;; the QP will assume that there is no time component and, for example, it can generate a simple equality clause
   ;; instead of a greater-than-or-equal and a less-than clause pair.  But (in most cases) we are removing the
   ;; bucketing and add filters on the column that's the source of the breakout column. To find the "source" column
   ;; we create a ref without the type specification and search for that.
   ;;
   ;; https://github.com/metabase/metabase/issues/53556
   ;; https://metaboat.slack.com/archives/C0645JP1W81/p1739904084459979
   (if-not (or (possible-model-mapped-breakout-column? query column)
               (day-bucketed-breakout-column? column))
     column
     (let [field-ref (cond-> (lib.ref/ref column)
                       (not preserve-type?) (update 1 dissoc :base-type :effective-type))
           resolved-column  (lib.metadata.calculation/metadata query stage-number field-ref)
           underlying-unit  (::lib.underlying/temporal-unit column)
           matching-column  (some-> resolved-column
                                    (m/assoc-some ::lib.underlying/temporal-unit underlying-unit))]
       (or matching-column column)))))
