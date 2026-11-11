(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.toucan.core :as t2]
   [metabase.transforms.schema :as transforms.schema]))

(set! *warn-on-reflection* true)

(t2/define-table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod serialization/spec :model/TransformTransformTag [_]
  {:schema    ::transforms.schema/external-transform-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/Transform :key :transform_id :order (juxt :position :entity_id)}
   :transform {:transform_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})

(defmethod remote-sync/spec :model/TransformTransformTag
  [_model]
  {:synced-filter-clause (fn [opts]
                           (t2/fragment [:in :transform_id (remote-sync/synced-ids-clause :model/Transform opts)]))})
