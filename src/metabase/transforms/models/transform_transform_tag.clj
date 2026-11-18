(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

(defmethod app-db-copy/spec :model/TransformTransformTag [_model]
  {:skip? false})

;;; ------------------------------------------------ Serialization -------------------------------------------------

(defmethod serialization/spec :model/TransformTransformTag [_]
  {:schema    ::transforms.schema/external-transform-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/Transform :key :transform_id :order (juxt :position :entity_id)}
   :transform {:transform_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})

;;; ------------------------------------------------- Remote sync --------------------------------------------------

(defmethod remote-sync/spec :model/TransformTransformTag
  [_model]
  {:synced-filter-clause transforms.db/synced-transform-transform-tags-clause})
