(ns metabase.transforms.models.transform-transform-tag
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformTransformTag [_model] :transform_transform_tag)

(doto :model/TransformTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-transform-transform-tags! :- :nil
  "Insert the TransformTransformTag `rows`."
  [rows :- [:sequential ::transforms.schema/transform-transform-tag.create]]
  (transforms.db/insert-transform-tag-links! rows)
  nil)

(mu/defn update-transform-transform-tag! :- :nil
  "Apply `changes` to the TransformTransformTag linking the Transform with `transform-id` to the tag with `tag-id`."
  [transform-id :- ::lib.schema.id/transform
   tag-id       :- ::lib.schema.id/transform-tag
   changes      :- ::transforms.schema/transform-transform-tag.update]
  (transforms.db/update-transform-tag-link! transform-id tag-id changes)
  nil)

(mu/defn delete-transform-transform-tags! :- :nil
  "Delete the TransformTransformTags linking the Transform with `transform-id` to the tags with `tag-ids`."
  [transform-id :- ::lib.schema.id/transform
   tag-ids      :- [:set ::lib.schema.id/transform-tag]]
  (transforms.db/delete-transform-tag-links! transform-id tag-ids)
  nil)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TransformTransformTag [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformTransformTag [_]
  {:schema    ::transforms.schema/external-transform-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/Transform :key :transform_id :order (juxt :position :entity_id)}
   :transform {:transform_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})

(defmethod remote-sync/spec :model/TransformTransformTag
  [_model]
  {:synced-filter-clause transforms.db/synced-transform-transform-tags-clause})
