(ns metabase.revisions.impl.legacy-metric
  (:require
   [medley.core :as m]
   [metabase.revisions.models.revision :as revision]))

(defmethod revision/serialize-instance :model/LegacyMetric
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defmethod revision/diff-map :model/LegacyMetric
  [model metric1 metric2]
  (if-not metric1
    ;; model is the first version of the metric
    (m/map-vals (fn [v] {:after v}) (select-keys metric2 [:name :description :definition]))
    ;; do our diff logic
    (let [base-diff ((get-method revision/diff-map :default)
                     model
                     (select-keys metric1 [:name :description :definition])
                     (select-keys metric2 [:name :description :definition]))]
      (cond-> (merge-with merge
                          (m/map-vals (fn [v] {:after v}) (:after base-diff))
                          (m/map-vals (fn [v] {:before v}) (:before base-diff)))
        (or (get-in base-diff [:after :definition])
            (get-in base-diff [:before :definition])) (assoc :definition {:before (get metric1 :definition)
                                                                          :after  (get metric2 :definition)})))))
