(ns metabase.lib.drill-thru.column-extract
  ""
  (:require
    [metabase.lib.expression :as lib.expression]
    [metabase.lib.drill-thru.column-filter :as lib.drill-thru.column-filter]
    [metabase.lib.drill-thru.common :as lib.drill-thru.common]
    [metabase.lib.metadata.calculation :as lib.metadata.calculation]
    [metabase.lib.schema :as lib.schema]
    [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
    [metabase.lib.schema.temporal-bucketing
     :as lib.schema.temporal-bucketing]
    [metabase.lib.temporal-bucket :as lib.temporal-bucket]
    [metabase.lib.types.isa :as lib.types.isa]
    [metabase.util.malli :as mu]))

(mu/defn column-extract-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-extract]
  [query                       :- ::lib.schema/query
   stage-number                :- :int
   {:keys [column column-ref]} :- ::lib.schema.drill-thru/context]
  (when (lib.types.isa/temporal? column)
    (let [adjusted (lib.drill-thru.column-filter/filter-drill-adjusted-query query stage-number column column-ref)]
      (merge {:lib/type    :metabase.lib.drill-thru/drill-thru
              :type    :drill-thru/column-extract
              :actions (mapv
                         (fn [unit]
                           {:lib/type :drill-thru/column-extract-action
                           :unit      unit})
                          lib.schema.temporal-bucketing/ordered-date-truncation-units)}
             adjusted))))

(mu/defn column-extract-actions :- [:sequential ::lib.schema.drill-thru/drill-thru.column-extract-action]
  [drill-thru :- [:and ::lib.schema.drill-thru/drill-thru
                   [:map [:type [:= :drill-thru/column-extract]]]]]
  (:actions drill-thru))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-extract
  [_query _stage-number _drill]
  {:type :drill-thru/column-extract})

(defmethod lib.metadata.calculation/display-info-method :drill-thru/column-extract-action
  [query stage-number {:keys [unit]}]
  {:display-name (lib.temporal-bucket/describe-temporal-unit unit)})

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-extract
  [_query _stage-number {:keys [query stage-number column]} & [{:keys [unit]}]]
  (lib.expression/expression
    query
    stage-number
    (lib.temporal-bucket/describe-temporal-unit unit)
    (case unit
      :day (lib.expression/get-day column)
      :week (lib.expression/get-week column :iso)
      :month (lib.expression/get-month column)
      :quarter (lib.expression/get-quarter column)
      :year (lib.expression/get-year column))))
