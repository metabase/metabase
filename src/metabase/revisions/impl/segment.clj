(ns metabase.revisions.impl.segment
  (:require
   [medley.core :as m]
   [metabase.lib.options :as lib.options]
   [metabase.lib.util :as lib.util]
   [metabase.lib.walk :as lib.walk]
   [metabase.revisions.models.revision :as revision]
   [metabase.util.malli :as mu]))

(defmethod revision/serialize-instance :model/Segment
  [_model _id instance]
  (dissoc instance :created_at :updated_at))

(defn- remove-uuids-from-query
  "Recursively removes :lib/uuid properties from a query structure"
  [query]
  (mu/disable-enforcement
    (lib.walk/walk-clauses query
                           (fn [_query _path-type _path clause]
                             (cond-> clause
                               (lib.util/clause? clause)
                               (lib.options/update-options dissoc :lib/uuid))))))

(defn- normalize-segment
  [segment]
  (-> segment
      (select-keys [:name :description :definition])
      (update :definition remove-uuids-from-query)))

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
