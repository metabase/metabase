(ns metabase.lib.drill-thru.underlying-records
  "\"View these Orders\" transformation.

  Entry points:

  - Cell

  - Pivot cell

  - Legend item

  Requirements:

  - Not empty `dimensions`, i.e. at least 1 breakout in the query

  Query transformation:


  - Drop all query stages where there are no aggregation clauses until the last one.

  - Remove all aggregation, breakout, sort, limit, field clauses

  - Add filters for every breakout `dimensions` using this logic
    https://github.com/metabase/metabase/blob/0624d8d0933f577cc70c03948f4b57f73fe13ada/frontend/src/metabase-lib/queries/utils/actions.js#L99

  - If there is a selected column (cell only), extract filters associated with this aggregation column. It could be
    built-in operators (SumIf) or Metrics with filters. Add these filters to the query.

  Question transformation:

  - Set display \"table\""
  (:require
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.binning :as lib.binning]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.lib.temporal-bucket :as lib.temporal-bucket]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.underlying :as lib.underlying]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn underlying-records-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.underlying-records]
  "When clicking on a particular broken-out group, offer a look at the details of all the rows that went into this
  bucket. Eg. distribution of People by State, then click New York and see the table of all People filtered by
  `STATE = 'New York'`.

  There is another quite different case: clicking the legend of a chart with multiple bars or lines broken out by
  category. Then `column` is nil!"
  [query                                                      :- ::lib.schema/query
   stage-number                                               :- :int
   {:keys [column column-ref dimensions value], :as _context} :- ::lib.schema.drill-thru/context]
  ;; Clicking on breakouts is weird. Clicking on Count(People) by State: Minnesota yields a FE `clicked` with:
  ;; - column is COUNT
  ;; - row[0] has col: STATE, value: "Minnesota"
  ;; - row[1] has col: count (source: "aggregation")
  ;; - dimensions which is [{column: STATE, value: "MN"}]
  ;; - value: the aggregated value (the count, the sum, etc.)
  ;; So dimensions is exactly what we want.
  ;; It returns the table name and row count, since that's used for pluralization of the name.

  ;; Clicking on a chart legend for eg. COUNT(Orders) by Products.CATEGORY and Orders.CREATED_AT has a context like:
  ;; - column is nil
  ;; - value is nil
  ;; - dimensions holds only the legend's column, eg. Products.CATEGORY.
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             (not-empty dimensions)
             ;; Either we need both column and value (cell/map/data point click) or neither (chart legend click).
             (or (and column (some? value))
                 (and (nil? column) (nil? value)))
             ;; If the column exists, it must not be a structured column like JSON.
             (not (and column (lib.types.isa/structured? column))))
    {:lib/type   :metabase.lib.drill-thru/drill-thru
     :type       :drill-thru/underlying-records
     ;; TODO: This is a bit confused for non-COUNT aggregations. Perhaps it should just always be 10 or something?
     ;; Note that some languages have different plurals for exactly 2, or for 1, 2-5, and 6+.
     :row-count  (if (and (number? value)
                          (not (neg? value)))
                   value
                   2)
     :table-name (when-let [table-or-card (or (some->> query lib.util/source-table-id (lib.metadata/table query))
                                              (some->> query lib.util/source-card-id  (lib.metadata/card  query)))]
                   (lib.metadata.calculation/display-name query stage-number table-or-card))
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
   column       :- ::lib.schema.metadata/column
   value        :- :any]
  (let [filter-clauses (or (when (lib.binning/binning column)
                             (let [unbinned-column (lib.binning/with-binning column nil)]
                               (if (some? value)
                                 (when-let [{:keys [min-value max-value]} (lib.binning/resolve-bin-width query column value)]
                                   [(lib.filter/>= unbinned-column min-value)
                                    (lib.filter/< unbinned-column max-value)])
                                 [(lib.filter/is-null unbinned-column)])))
                           ;; if the column was temporally bucketed in the top level, make sure the `=` filter we
                           ;; generate still has that bucket. Otherwise the filter will be something like
                           ;;
                           ;;    col = March 2023
                           ;;
                           ;; instead of
                           ;;
                           ;;    month(col) = March 2023
                           (let [column (if-let [temporal-unit (::lib.underlying/temporal-unit column)]
                                          (lib.temporal-bucket/with-temporal-bucket column temporal-unit)
                                          column)]
                             [(lib.filter/= column value)]))]
    (reduce
     (fn [query filter-clause]
       (lib.filter/filter query stage-number filter-clause))
     query
     filter-clauses)))

(defn drill-underlying-records
  "Drops aggregations, breakouts, orders, limits and field, then applies a filter for each of the dimensions (including
  for metrics, and aggregations that imply a filter like `:sum-where`).

  Extracted to a helper since it's reused by automatic-insights drill."
  [query {:keys [column-ref dimensions] :as _context}]
  (let [;; Drop all aggregations, breakouts, sort orders, etc. to get the underlying records.
        ;; Note that all operations are performed on the final stage of input query.
        base-query  (lib.util/update-query-stage query -1 dissoc :aggregation :breakout :order-by :limit :fields)
        ;; Turn any non-aggregation dimensions into filters.
        ;; eg. if we drilled into a temporal bucket, add a filter for the [:= breakout-column that-month].
        filtered    (reduce (fn [q {:keys [column value]}]
                              (drill-filter q -1 column value))
                            base-query
                            (for [dimension dimensions
                                  :when (-> dimension :column :lib/source (not= :source/aggregations))]
                              dimension))
        ;; The column-ref should be an aggregation ref - look up the full aggregation.
        aggregation (when-let [agg-uuid (last column-ref)]
                      (m/find-first #(= (lib.options/uuid %) agg-uuid)
                                    (lib.aggregation/aggregations query -1)))]
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

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/underlying-records
  [query _stage-number context & _]
  ;; Note that the input _stage-number is deliberately ignored. The top-level query may have fewer stages than the
  ;; input query; all operations are performed on the final stage of the top-level query.
  (drill-underlying-records (lib.underlying/top-level-query query)
                            (update context :dimensions
                                    (fn [dims]
                                      (for [dim dims]
                                        (update dim :column #(lib.underlying/top-level-column query %)))))))
