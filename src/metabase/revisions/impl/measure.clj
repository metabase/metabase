(ns metabase.revisions.impl.measure
  (:require
   [medley.core :as m]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-measure-revision
  #{:created_at :updated_at :dependency_analysis_version})

(defmethod revision/serialize-instance :model/Measure
  [_model _id instance]
  (apply dissoc instance excluded-columns-for-measure-revision))

(defn- normalize-measure
  [measure]
  (-> measure
      (select-keys [:name :description :definition])
      (update :definition lib.schema.util/remove-lib-uuids)))

(defmethod revision/diff-map :model/Measure
  [model measure1 measure2]
  (if-not measure1
    ;; this is the first version of the measure
    (m/map-vals (fn [v] {:after v}) (select-keys measure2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (normalize-measure measure1)
                     (normalize-measure measure2))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get measure1 :definition)
                                                                          :after  (get measure2 :definition)})))))
