(ns metabase-enterprise.transforms.models.transform-job-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/hash-fields :model/TransformJobTransformTag
  [_junction]
  [:job_id :tag_id :position])

(defmethod serdes/generate-path "TransformJobTransformTag"
  [_ _junction]
  ;; Junction tables are inlined into their parent TransformJob, so no independent path
  nil)

(defmethod serdes/make-spec "TransformJobTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :skip []
   :transform {:job_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})

(defmethod serdes/dependencies "TransformJobTransformTag"
  [{:keys [tag_id]}]
  ;; Depends on the TransformTag being loaded first
  (when tag_id
    #{[{:model "TransformTag" :id tag_id}]}))

(defmethod serdes/descendants "TransformJobTransformTag"
  [_model-name _id]
  ;; Junction tables don't contain other entities
  {})
