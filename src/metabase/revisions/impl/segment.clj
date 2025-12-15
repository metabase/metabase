(ns metabase.revisions.impl.segment
  (:require
   [medley.core :as m]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.revisions.models.revision :as revision]))

(def ^:private excluded-columns-for-segment-revision
  #{:created_at :updated_at :dependency_analysis_version})

(defmethod revision/serialize-instance :model/Segment
  [_model _id instance]
  (apply dissoc instance excluded-columns-for-segment-revision))

(defn- normalize-segment
  [segment]
  (-> segment
      (select-keys [:name :description :definition])
      (update :definition lib.schema.util/remove-lib-uuids)))

(defmethod revision/diff-map :model/Segment
  [model segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (m/map-vals (fn [v] {:after v}) (select-keys segment2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (normalize-segment segment1)
                     (normalize-segment segment2))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get segment1 :definition)
                                                                          :after  (get segment2 :definition)})))))
