(ns metabase.lib.drill-thru.underlying-records
  (:require
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn underlying-records-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.underlying-records]
  "When clicking on a particular broken-out group, offer a look at the details of all the rows that went into this
  bucket. Eg. distribution of People by State, then click New York and see the table of all People filtered by
  `STATE = 'New York'`."
  [query                                        :- ::lib.schema/query
   stage-number                                 :- :int
   {:keys [column column-ref dimensions value]} :- ::lib.schema.drill-thru/context]
  ;; Clicking on breakouts is weird. Clicking on Count(People) by State: Minnesota yields a FE `clicked` with:
  ;; - column is COUNT
  ;; - row[0] has col: STATE, value: "Minnesota"
  ;; - row[1] has col: count (source: "aggregation")
  ;; - dimensions which is [{column: STATE, value: "MN"}]
  ;; - value: the aggregated value (the count, the sum, etc.)
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
                          (lib.metadata.calculation/display-name query stage-number))
     :dimensions dimensions
     :column-ref column-ref}))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/underlying-records
  [_query _stage-number {:keys [row-count table-name]}]
  {:type       :drill-thru/underlying-records
   :row-count  row-count
   :table-name table-name})

(mu/defn ^:private drill-filter :- ::lib.schema/query
  [query        :- ::lib.schema/query
   stage-number :- :int
   column       :- lib.metadata/ColumnMetadata
   value        :- :any]
  (lib.filter/filter query stage-number (lib.filter/= column value)))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/underlying-records
  [query _stage-number {:keys [column-ref dimensions]} & _]
  (let [top-query   (lib.underlying/top-level-query query)
        ;; Drop all aggregations, breakouts, sort orders, etc. to get the underlying records.
        ;; Note that the input _stage-number is deliberately ignored. The top-level query may have fewer stages than the
        ;; input query; all operations are performed on the final stage of the top-level query.
        base-query  (lib.util/update-query-stage top-query -1
                                                 dissoc :aggregation :breakout :order-by :limit :fields)
        ;; Turn any non-aggregation dimensions into filters.
        ;; eg. if we drilled into a temporal bucket, add a filter for the [:= breakout-column that-month].
        filtered    (reduce (fn [q {:keys [column value]}]
                              (drill-filter q -1 column value))
                            base-query
                            (for [dimension dimensions
                                  :let [top (update dimension :column #(lib.underlying/top-level-column query %))]
                                  :when (-> top :column :lib/source (not= :source/aggregations))]
                              top))
        ;; The column-ref should be an aggregation ref - look up the full aggregation.
        aggregation (when-let [agg-uuid (last column-ref)]
                      (m/find-first #(= (lib.options/uuid %) agg-uuid)
                                    (lib.aggregation/aggregations top-query -1)))]
    ;; Apply the filters derived from the aggregation.
    (reduce #(lib.filter/filter %1 -1 %2)
            filtered
            ;; If we found an aggregation, check if it implies further filtering.
            ;; Simple aggregations like :sum don't add more filters; metrics or fancy aggregations like :sum-where do.
            (when aggregation
              (case (first aggregation)
                ;; Fancy aggregations that filter the input - the filter is the last part of the aggregation.
                (:sum-where :count-where :share)
                [(last aggregation)]

                ;; Metrics are standard filter + aggregation units; if the column is a metric get its filters.
                :metric
                (-> (lib.metadata/metric query (last aggregation))
                    :definition
                    lib.convert/js-legacy-inner-query->pMBQL
                    (assoc :database (:database query))
                    (lib.filter/filters -1))

                ;; Default: no filters to add.
                nil)))))
