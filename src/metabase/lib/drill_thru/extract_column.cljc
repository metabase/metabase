(ns metabase.lib.drill-thru.extract-column
  ""
  (:require
    [metabase.lib.schema :as lib.schema]
    [metabase.lib.drill-thru.common :as lib.drill-thru.common]
    [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
    [metabase.lib.schema.metadata :as lib.schema.metadata]
    [metabase.lib.schema.ref :as lib.schema.ref]
    [metabase.lib.types.isa :as lib.types.isa]
    [metabase.util.malli :as mu]))

(mu/defn extract-column-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.extract-column]
  ""
  [query        :- ::lib.schema/query
   stage-number :- :int
   {:keys [column]} :- ::lib.schema.drill-thru/context]
  (when (lib.types.isa/temporal? column)
    { :lib/type :metabase.lib.drill-thru/drill-thru
      :type     :drill-thru/extract-column }))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/extract-column
  [_query _stage-number _drill]
  {:type :drill-thru/extract-column})
