(ns metabase.lib.drill-thru.underlying-records
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn underlying-records-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.underlying-records]
  "When clicking on a particular broken-out group, offer a look at the details of all the rows that went into this
  bucket. Eg. distribution of People by State, then click New York and see the table of all People filtered by
  `STATE = 'New York'`."
  [query                             :- ::lib.schema/query
   stage-number                      :- :int
   {:keys [column dimensions value]} :- ::lib.schema.drill-thru/context]
  ;; Clicking on breakouts is weird. Clicking on Count(People) by State: Minnesota yields a FE `clicked` with:
  ;; - column is COUNT
  ;; - row[0] has col: STATE, value: "Minnesota"
  ;; - row[1] has col: count (source: "aggregation")
  ;; - dimensions which is [{column: STATE, value: "MN"}]
  ;; - value: the count.
  ;; So dimensions is exactly what we want.
  ;; It returns the table name and row count, since that's used for pluralization of the name.
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value)
             (not-empty dimensions)
             (not (lib.types.isa/structured? column)))
    {:lib/type   :metabase.lib.drill-thru/drill-thru
     :type       :drill-thru/underlying-records
     ;; TODO: This is a bit confused for non-COUNT aggregations. Perhaps it should just always be 10 or something?
     ;; Note that some languages have different plurals for exactly 2, or for 1, 2-5, and 6+.
     :row-count  (if (number? value) value 2)
     :table-name (some->> (lib.util/source-table-id query)
                          (lib.metadata/table query)
                          (lib.metadata.calculation/display-name query stage-number))}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/underlying-records
  [_query _stage-number {:keys [row-count table-name]}]
  {:type       :drill-thru/underlying-records
   :row-count  row-count
   :table-name table-name})

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/underlying-records
  [_query _stage-number _drill-thru & _]
  (throw (ex-info "Not implemented" {}))
  #_(lib.filter/filter query stage-number (lib.options/ensure-uuid [(keyword filter-op) {} (lib.ref/ref column) value])))
