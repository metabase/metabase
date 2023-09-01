(ns metabase.lib.drill-thru.object-details
  (:require
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.drill-thru :as lib.schema.drill-thru]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]
   [metabase.util.malli :as mu]))

(defn- object-detail-drill-for [query stage-number {:keys [column row value] :as context} many-pks?]
  (let [base {:lib/type  :metabase.lib.drill-thru/drill-thru
              :type      :drill-thru/pk
              :column    column
              :object-id value
              :many-pks? many-pks?}]
    (cond
      (and (lib.types.isa/primary-key? column) many-pks?) (assoc base :type :drill-thru/pk)
      ;; TODO: Figure out clicked.extraData and the dashboard flow.
      (lib.types.isa/primary-key? column)                 (assoc base :type :drill-thru/zoom)
      (lib.types.isa/foreign-key? column)                 (assoc base :type :drill-thru/fk-details)
      (and (not many-pks?)
           (not-empty row)
           (empty? (lib.aggregation/aggregations query stage-number)))
      (let [[pk-column] (lib.metadata.calculation/primary-keys query) ; Already know there's only one.
            pk-value    (->> row
                             (filter #(= (:column-name %) (:name pk-column)))
                             first
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

  Contrast [[foreign-key-drill]], which filters this query to only those rows with a specific value for a FK column."
  [query                              :- ::lib.schema/query
   stage-number                       :- :int
   {:keys [column value] :as context} :- ::lib.schema.drill-thru/context]
  (when (and (lib.drill-thru.common/mbql-stage? query stage-number)
             column
             (some? value))
    (object-detail-drill-for query stage-number context
                             (> (count (lib.metadata.calculation/primary-keys query)) 1))))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/pk
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/zoom
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/fk-details
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/pk
  [query stage-number {:keys [column object-id]} & _]
  ;; This type is only used when there are multiple PKs and one was selected - [= pk x] filter.
  (lib.filter/filter query stage-number
                     (lib.options/ensure-uuid [:field {} (lib.ref/ref column) object-id])))

(defn- field-id [x]
  (cond
    (int? x)                   x
    (string? x)                x
    (and (vector? x)
         (= :field (first x))) (field-id (nth x 2))
    (map? x)                   (:id x)))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/fk
  [query stage-number {:keys [column object-id]} & _]
  (let [fk-column-id     (:fk-target-field-id column)
        fk-column        (lib.metadata/field query fk-column-id)
        fk-filter        (lib.options/ensure-uuid [:= {} (lib.ref/ref fk-column) object-id])
        ;; Only filters which specify other PKs of the table are allowed to remain.
        other-pk?        (fn [[op _opts lhs :as _old-filter]]
                           (and lhs
                                (not= (field-id lhs) fk-column-id)
                                (= op :=)
                                (when-let [filter-field (lib.metadata.calculation/metadata query stage-number lhs)]
                                  (and (lib.types.isa/primary-key? filter-field)
                                       (= (:table-id fk-column) (:table-id filter-field))))))
        other-pk-filters (filter other-pk? (lib.filter/filters query stage-number))]
    (reduce #(lib.filter/filter %1 stage-number %2)
            (lib.util/update-query-stage query stage-number dissoc :filters)
            (concat [fk-filter] other-pk-filters))))
