(ns metabase.revisions.impl.segment
  (:require
   [medley.core :as m]
   [metabase.revisions.models.revision :as revision]))

(defmethod revision/serialize-instance :model/Segment
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map :model/Segment
  [model segment1 segment2]
  (if-not segment1
    ;; this is the first version of the segment
    (m/map-vals (fn [v] {:after v}) (select-keys segment2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys segment1 [:name :description :definition])
                     (select-keys segment2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get segment1 :definition)
                                                                          :after  (get segment2 :definition)})))))
