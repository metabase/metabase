(ns metabase.lib.drill-thru.column-filter
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.filter.operator :as lib.filter.operator]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn column-filter-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.column-filter]
  "Filtering at the column level, based on its type. Displays a submenu of eg. \"Today\", \"This Week\", etc. for date
  columns."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             ;; Must be a real field in the DB. Note: original code uses `clicked.column.field_ref != null` for this.
             (some? (:id column)))
    (let [initial-op (when-not (lib.types.isa/temporal? column) ; Date fields have special handling in the FE.
                       (-> (lib.filter.operator/filter-operators column)
                           first
                           (assoc :lib/type :operator/filter)))]
      {:lib/type   :metabase.lib.drill-thru/drill-thru
       :type       :drill-thru/column-filter
       :column     column
       :initial-op initial-op})))

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
