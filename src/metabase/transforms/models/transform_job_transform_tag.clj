(ns metabase.transforms.models.transform-job-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [tru]]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defn- check-tag-not-in-worktree
  "Jobs belong to the main app and are never worktree-scoped, so a tag checked out into a remote-sync worktree
  cannot be attached to one -- a worktree's transforms don't run until its branch is merged."
  [{:keys [tag_id]}]
  (when (and tag_id (t2/select-one-fn :worktree_id :model/TransformTag :id tag_id))
    (throw (ex-info (tru "A tag in a remote sync worktree cannot be added to a job.")
                    {:status-code 400 :tag-id tag_id}))))

(t2/define-before-insert :model/TransformJobTransformTag
  [job-tag]
  (check-tag-not-in-worktree job-tag)
  job-tag)

(t2/define-before-update :model/TransformJobTransformTag
  [job-tag]
  (when (contains? (t2/changes job-tag) :tag_id)
    (check-tag-not-in-worktree job-tag))
  job-tag)

(defmethod serdes/make-spec "TransformJobTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :transform {:job_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})
