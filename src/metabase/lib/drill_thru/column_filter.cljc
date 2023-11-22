(ns metabase.lib.drill-thru.column-filter
  (:require
   [medley.core :as m]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.stage :as lib.stage]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(mu/defn column-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-filter]
  "Filtering at the column level, based on its type. Displays a submenu of eg. \"Today\", \"This Week\", etc. for date
  columns.

  Note that if the clicked column is an aggregation, filtering by it will require a new stage. Therefore this drill
  returns a possibly-updated `:query` and `:stage-number` along with a `:column` referencing that later stage."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  ;; Note: original code uses an addition `clicked.column.field_ref != null` condition.
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column)))
    (let [initial-op (when-not (lib.types.isa/temporal? column) ; Date fields have special handling in the FE.
                       (-> (lib.filter.operator/filter-operators column)
                           first
                           (assoc :lib/type :operator/filter)))]

      (merge
        {:lib/type   :metabase.lib.drill-thru/drill-thru
         :type       :drill-thru/column-filter
         :initial-op initial-op}
        ;; When the column we would be filtering on is an aggregation, it can't be filtered without adding a stage.
        (let [next-stage    (->> (lib.util/canonical-stage-index query stage-number)
                                 (lib.util/next-stage-number query))
              base          (cond
                              ;; Not an aggregation: just the input query and stage.
                              (not= (:lib/source column) :source/aggregations)
                              {:query        query
                               :stage-number stage-number}

                              ;; Aggregation column: if there's a later stage, use it.
                              next-stage {:query        query
                                          :stage-number next-stage}
                              ;; Aggregation column with no later stage; append a stage.
                              :else      {:query        (lib.stage/append-stage query)
                                          :stage-number -1})
              columns       (lib.filter/filterable-columns (:query base) (:stage-number base))
              filter-column (or (lib.equality/find-matching-column
                                  (:query base) (:stage-number base) (lib.ref/ref column) columns)
                                (and (:lib/source-uuid column)
                                     (m/find-first #(= (:lib/source-uuid %) (:lib/source-uuid column))
                                                   columns)))]
          (assoc base :column filter-column))))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/column-filter
  [_query _stage-number {:keys [initial-op]}]
  {:type       :drill-thru/column-filter
   :initial-op initial-op})

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/column-filter :- ::lib.schema/query
  [query                            :- ::lib.schema/query
   stage-number                     :- :int
   {:keys [column] :as _drill-thru} :- ::lib.schema.drill-thru/drill-thru.column-filter
   filter-op                        :- [:or :keyword :string] ; filter tag
   value                            :- :any]
  (lib.filter/filter query stage-number (lib.filter/filter-clause filter-op column value)))
