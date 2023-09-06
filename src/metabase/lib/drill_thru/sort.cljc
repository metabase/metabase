(ns metabase.lib.drill-thru.sort
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.equality :as lib.equality]
   [metabase.lib.order-by :as lib.order-by]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(mu/defn sort-drill :- [:maybe ::lib.schema.drill-thru/drill-thru.sort]
  "Sorting on a clicked column."
  [query                  :- ::lib.schema/query
   stage-number           :- :int
   {:keys [column value]} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (nil? value)
             (not (lib.types.isa/structured? column))
             (or (:lib/source column)
                 (:id column)))
    (let [orderable  (->> (lib.order-by/orderable-columns query stage-number)
                          (map :id)
                          set)
          this-order (first (for [[dir _opts field] (lib.order-by/order-bys query stage-number)
                                  :when (lib.equality/find-closest-matching-ref
                                         query stage-number (lib.ref/ref column) [field])]
                              dir))]
      (when (orderable (:id column))
        {:lib/type        :metabase.lib.drill-thru/drill-thru
         :type            :drill-thru/sort
         :column          column
         :sort-directions (case this-order
                            :asc  [:desc]
                            :desc [:asc]
                            [:asc :desc])}))))

(mu/defmethod lib.drill-thru.common/drill-thru-method :drill-thru/sort
  ([query stage-number drill]
   (lib.drill-thru.common/drill-thru-method query stage-number drill :asc))

  ([query                        :- ::lib.schema/query
    stage-number                 :- :int
    {:keys [column], :as _drill} :- ::lib.schema.drill-thru/drill-thru.sort
    direction                    :- [:enum :asc :desc]]
   (lib.order-by/order-by query stage-number column direction)))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/sort
  [_query _stage-number {directions :sort-directions}]
  {:type       :drill-thru/sort
   :directions directions})
