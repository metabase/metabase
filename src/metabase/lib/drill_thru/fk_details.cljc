(ns metabase.lib.drill-thru.fk-details
  "[[metabase.lib.drill-thru.object-details/object-detail-drill]] has the logic for determining whether to return this
  drill as an option or not."
  (:require
   [metabase.lib.drill-thru.common :as lib.drill-thru.common]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.options :as lib.options]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.lib.util :as lib.util]))

(defmethod lib.drill-thru.common/drill-thru-info-method :drill-thru/fk-details
  [_query _stage-number drill-thru]
  (select-keys drill-thru [:many-pks? :object-id :type]))

(defn- field-id [x]
  (cond
    (int? x)                   x
    (string? x)                x
    (and (vector? x)
         (= :field (first x))) (field-id (nth x 2))
    (map? x)                   (:id x)))

(defmethod lib.drill-thru.common/drill-thru-method :drill-thru/fk-details
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
