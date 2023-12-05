(ns metabase.lib.drill-thru.object-details
  (:require
   [medley.core :as m]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.util.malli :as mu]))

(defn- object-detail-drill-for [query stage-number {:keys [column row value] :as context} many-pks?]
  (let [base {:lib/type  :metabase.lib.drill-thru/drill-thru
              :type      :drill-thru/pk
              :column    column
              :object-id value
              :many-pks? many-pks?}
        mbql-stage? (lib.drill-thru.common/mbql-stage? query stage-number)]
    (cond
      (and (lib.types.isa/primary-key? column)
           many-pks?
           mbql-stage?
           (not= value :null))
      (assoc base :type :drill-thru/pk)

      ;; TODO: Figure out clicked.extraData and the dashboard flow.
      (and (lib.types.isa/primary-key? column)
           (not= value :null))
      (assoc base :type :drill-thru/zoom)

      (and (lib.types.isa/foreign-key? column)
           (not= value :null))
      (assoc base :type :drill-thru/fk-details)

      (and (not many-pks?)
           (not-empty row)
           (empty? (lib.aggregation/aggregations query stage-number)))
      (let [[pk-column] (lib.metadata.calculation/primary-keys query) ; Already know there's only one.
            pk-value    (->> row
                             (m/find-first #(-> % :column :name (= (:name pk-column))))
                             :value)]
        (when (and pk-value
                   ;; Only recurse if this is a different column - otherwise it's an infinite loop.
                   (not= (:name column) (:name pk-column)))
          (object-detail-drill-for query
                                   stage-number
                                   (assoc context :column pk-column :value pk-value)
                                   many-pks?))))))

(mu/defn object-detail-drill :- [:maybe [:or
                                         ::lib.schema.drill-thru/drill-thru.pk
                                         ::lib.schema.drill-thru/drill-thru.zoom
                                         ::lib.schema.drill-thru/drill-thru.fk-details]]
  "When clicking a foreign key or primary key value, drill through to the details for that specific object.

  Contrast [[metabase.lib.drill-thru.fk-filter/fk-filter-drill]], which filters this query to only those rows with a
  specific value for a FK column."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [column value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and column
             (some? value))
    (object-detail-drill-for query stage-number context
                             (> (count (lib.metadata.calculation/primary-keys query)) 1))))
