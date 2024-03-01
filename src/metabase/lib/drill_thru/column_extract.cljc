(ns metabase.lib.drill-thru.column-extract
  "Adds an expression clause based on the selected column and temporal unit.

  Entry points:

  - Column header

  Requirements:

  - Date column

  Query transformation:

  - Add an expression clause with the selected temporal unit.

  Question transformation:

  - None"
  (:require
    [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
    [metabase.lib.drill-thru.common :as lib.drill-thru.common]
    [metabase.lib.expression :as lib.expression]
    [metabase.lib.filter :as lib.filter]
    [metabase.lib.metadata.calculation :as lib.metadata.calculation]
    [metabase.lib.schema :as lib.schema]
    [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
    [metabase.lib.temporal-bucket :as lib.temporal-bucket]
    [metabase.lib.types.isa :as lib.types.isa]
    [metabase.util :as u]
    [metabase.util.malli :as mu]
    [metabase.shared.util.time :as shared.ut]))

(mu/defn column-extract-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-extract]
  "Adding an expression based on a clicked column."
  [query                       :- ::lib.schema/query
   stage-number                :- :int
   {:keys [column column-ref value]} :- ::lib.schema.drill-thru/context]
  (when (and column
             (nil? value)
             (lib.types.isa/temporal? column))
    (merge {:lib/type    :metabase.lib.drill-thru/drill-thru
            :type        :drill-thru/column-extract}
            (lib.drill-thru.column-filter/filter-drill-adjusted-query query stage-number column column-ref))))

(def column-extract-units
  "Available extraction units for this drill."
  [:hour-of-day :day-of-month :day-of-week :month-of-year :quarter-of-year :year])

(mu/defn column-extract-types :- [:sequential ::lib.schema.drill-thru/drill-thru.column-extract-type]
  "Available extraction types for this drill."
  [{:keys [column]} :- [:and ::lib.schema.drill-thru/drill-thru
                   [:map [:type [:= :drill-thru/column-extract]]]]]
  (when (lib.types.isa/temporal? column)
    (map (fn [unit]
           {:lib/type :drill-thru/column-extract-type
            :unit      unit})
         column-extract-units)))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-extract
  [_query _stage-number _drill]
  {:type :drill-thru/column-extract})

(defmethod lib.metadata.calculation/display-info-method :drill-thru/column-extract-type
  [_query _stage-number {:keys [unit]}]
  {:display-name (lib.temporal-bucket/describe-temporal-unit unit)})

(defn ^:private case-expression
  "Creates a case expression with a condition for each value of the unit."
  [expression unit count]
  (lib.expression/case
    (->> (range 1 (inc count))
         (map #(shared.ut/format-unit % unit))
         (map-indexed (fn [index option]
                        [(lib.filter/= expression (inc index)) option])))
   ""))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-extract
  [_query _stage-number {:keys [query stage-number column]} & [{:keys [unit]}]]
  (lib.expression/expression
    query
    stage-number
    (lib.temporal-bucket/describe-temporal-unit unit)
    (case unit
      :hour-of-day (lib.expression/get-hour column)
      :day-of-month (lib.expression/get-day column)
      :day-of-week (case-expression (lib.expression/get-day-of-week column) unit 7)
      :month-of-year (case-expression (lib.expression/get-month column) unit 12)
      :quarter-of-year (case-expression (lib.expression/get-quarter column) unit 4)
      :year (lib.expression/get-year column))))
