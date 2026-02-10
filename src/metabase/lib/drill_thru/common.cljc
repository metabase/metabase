(ns metabase.lib.drill-thru.common
  (:refer-clojure :exclude [select-keys not-empty])
  (:require
   [medley.core :as m]
   [metabase.lib.card :as lib.card]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.hierarchy :as lib.hierarchy]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.schema.ref :as lib.schema.ref]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]
   [metabase.util.performance :refer [select-keys not-empty]]))

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

(defn- find-column-in-visible-columns-ignoring-joins
  [query stage-number column]
  (->> (lib.metadata.calculation/visible-columns
        query
        stage-number
        {:include-joined?                              false
         :include-expressions?                         false
         :include-implicitly-joinable?                 false
         :include-implicitly-joinable-for-source-card? false})
       (lib.equality/find-matching-column query stage-number column)))

(defn primary-key?
  "Is `column` a primary key of `query`?

  Returns true iff `column` satisfies [[lib.types.isa/primary-key?]] and `column` is found in the stage's non-joined
  visible-columns."
  [query stage-number column]
  (boolean (and (lib.types.isa/primary-key? column)
                (find-column-in-visible-columns-ignoring-joins query stage-number column))))

(defn foreign-key?
  "Is `column` a foreign key of `query`?

  Returns true iff `column` satisfies [[lib.types.isa/foreign-key?]] and `column` is found in the stage's non-joined
  visible-columns."
  [query stage-number column]
  (boolean (and (lib.types.isa/foreign-key? column)
                (find-column-in-visible-columns-ignoring-joins query stage-number column))))

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

(mu/defn- card-sourced-name-based-breakout-column? :- :boolean
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [breakout-sourced? (boolean (:lib/breakout? column))
        card-sourced? (boolean (lib.util/source-card-id query))
        has-id? (boolean (:id column))]
    (and breakout-sourced? card-sourced? (not has-id?))))

(mu/defn- possible-model-mapped-breakout-column? :- :boolean
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [breakout-sourced? (boolean (:lib/breakout? column))
        model-sourced? (lib.card/source-card-is-model? query)
        has-id? (boolean (:id column))]
    (and breakout-sourced? model-sourced? has-id?)))

(mu/defn- possible-expression-breakout-column? :- :boolean
  [query  :- ::lib.schema/query
   column :- ::lib.schema.metadata/column]
  (let [breakout-sourced?   (boolean (:lib/breakout? column))
        has-id?             (boolean (:id column))
        matching-expression (lib.expression/maybe-resolve-expression query -1 (:name column))]
    (and breakout-sourced? (boolean matching-expression) (not has-id?))))

(mu/defn- day-bucketed-breakout-column? :- :boolean
  [column :- ::lib.schema.metadata/column]
  (let [breakout-sourced? (boolean (:lib/breakout? column))
        day-bucketed? (= (:metabase.lib.field/temporal-unit column) :day)]
    (and breakout-sourced? day-bucketed?)))

(mu/defn matching-filterable-column :- [:maybe ::lib.schema.metadata/column]
  "Return the matching column found in the stage's [[lib.filter/filterable-columns]]."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-ref   :- ::lib.schema.ref/ref
   column       :- ::lib.schema.metadata/column]
  (let [columns (lib.filter/filterable-columns query stage-number)]
    (or (lib.equality/find-matching-column query stage-number column-ref columns)
        ;; If [[lib.equality/find-matching-column]] fails to find a match use the more advanced resolution
        ;; in [[lib.metadata.calculation/metadata]] (for `:field` refs, this is [[metabase.lib.field.resolution]])
        ;;
        ;; TODO (Cam 2026-02-10) we should probably be using [[metabase.lib.metadata.calculation/metadata]] for all
        ;; types of refs here since if can match even bad refs but there are a bunch of cases where the `stage-number`
        ;; passed in here is wrong relative to `column` and `column-ref`... see for
        ;; example [[metabase.lib.drill-thru.column-filter/prepare-query-for-drill-addition]] which appends an
        ;; additional stage and then passes in that new stage as `stage-number` even tho `column-ref` and `column` are
        ;; from the previous stage. We need to go in and fix that, but doing so seems to break a lot of other stuff so
        ;; it should be done as part of a larger project.
        (when (lib.util/clause-of-type? column-ref :field)
          (when-let [col (lib.metadata.calculation/metadata query stage-number column-ref)]
            (when-not (:metabase.lib.field.resolution/fallback-metadata? col)
              col)))
        (and (:lib/source-uuid column)
             (m/find-first #(= (:lib/source-uuid %) (:lib/source-uuid column))
                           columns)))))

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
   ;; column where `:lib/breakout?` is no longer true, and the `:lib/source` is now `:source/card`, which
   ;; allows [[metabase.lib.field/column-metadata->field-ref]] to recognize that it needs to generate a named-based
   ;; ref. This is required because an id-based ref will wind up generating SQL that matches the underlying mapped
   ;; column's name, not the name of the column from the model's native query (which was renamed via "AS").
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
           resolved-column  (lib.metadata.calculation/metadata query stage-number field-ref)]
       (or resolved-column column)))))

(mu/defn breakout->filterable-column :- ::lib.schema.metadata/column
  "Given a breakout sourced column, return the matching filterable-column in this stage."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column-ref   :- ::lib.schema.ref/ref
   column       :- ::lib.schema.metadata/column]
  ;; TODO: This is a hack to workaround field refs confusion that should be fixed by the field refs overhaul. Remove
  ;; this function once the field refs overhaul lands.
  ;;
  ;; https://github.com/metabase/metabase/issues/53604
  (if-not (or (card-sourced-name-based-breakout-column? query column)
              (possible-model-mapped-breakout-column? query column)
              (possible-expression-breakout-column? query column)
              (day-bucketed-breakout-column? column))
    column
    (let [filterable-column (matching-filterable-column query stage-number column-ref column)]
      (or filterable-column column))))
