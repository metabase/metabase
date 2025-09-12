(ns metabase-enterprise.transforms.models.transform-transform-tag
  (:require
   [metabase.models.serialization :as serdes]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serdes/hash-fields :model/TransformTransformTag
  [_junction]
  [:transform_id :tag_id :position])

(defmethod serdes/generate-path "TransformTransformTag"
  [_ _junction]
  ;; Junction tables are inlined into their parent Transform, so no independent path
  nil)

(defmethod serdes/make-spec "TransformTransformTag"
  [_model-name _opts]
  {:copy [:entity_id :position]
   :skip []
   :transform {:transform_id (serdes/parent-ref)
               :tag_id (serdes/fk :model/TransformTag)}})

(defmethod serdes/dependencies "TransformTransformTag"
  [{:keys [tag_id]}]
  ;; Depends on the TransformTag being loaded first
  (when tag_id
    #{[{:model "TransformTag" :id tag_id}]}))

(defmethod serdes/descendants "TransformTransformTag"
  [_model-name _id]
  ;; Junction tables don't contain other entities
  {})
