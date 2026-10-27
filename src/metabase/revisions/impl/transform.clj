(ns metabase.revisions.impl.transform
  (:require
   [metabase.models.interface :as mi]
   [metabase.revisions.db :as revisions.db]
   [metabase.revisions.models.revision :as revision]
   [metabase.transforms.core :as transforms]
   [toucan2.core :as t2]))

(def ^:private excluded-columns-for-transform-revision
  #{:id :entity_id :created_at :updated_at :creator :creator_id :can_read :can_write :can_execute :can_restore
    :can_delete})

(defmethod revision/serialize-instance :model/Transform [_model _id instance]
  (apply dissoc instance excluded-columns-for-transform-revision))

(defmethod revision/revert-to-revision! :model/Transform
  [model id user-id serialized-transform]
  ;; A revert never moves a transform to or from the Trash. Only `PUT /api/transform/:id` does that, with its folder
  ;; checks. A revision does not record that a folder trash archived the transform, so writing `archived` back from it
  ;; would take the transform out of a trashed folder and let it run.
  ;; TODO: cards, dashboards and documents have the same gap. Replace this with a generic rule for revert and the
  ;; Trash, GDGT-3429.
  (let [current  (revisions.db/raw-row model id)
        reverted (dissoc serialized-transform :archived :archived_directly)]
    (transforms/check-folder-in-trash! current (merge current reverted))
    ((get-method revision/revert-to-revision! :default) model id user-id reverted)))

(defmethod revision/revision-readable? :model/Transform
  [_model object]
  ;; A transform is readable only to callers entitled to the source database it reads from, so each historical
  ;; revision is authorized against the source *it* recorded, not the current one.
  (mi/can-read? (t2/instance :model/Transform object)))
