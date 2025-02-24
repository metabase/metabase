(ns metabase.lib.drill-thru.common
  (:require
   [medley.core :as m]
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

(mu/defn breakout->resolved-column :- ::lib.schema.metadata/column
  "Given a breakout sourced column, return the resolved metadata for the column in this stage.

  In addition, preserve any existing binning or temporal bucketing on `column`."
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- ::lib.schema.metadata/column]
  (if (not= :source/breakouts (:lib/source column))
    column
    (let [resolved-column  (lib.metadata.calculation/metadata query stage-number (lib.ref/ref column))
          underlying-unit  (::lib.underlying/temporal-unit column)
          matching-column  (some->> resolved-column
                                    (#(m/assoc-some % ::lib.underlying/temporal-unit underlying-unit)))]
      (or matching-column column))))
