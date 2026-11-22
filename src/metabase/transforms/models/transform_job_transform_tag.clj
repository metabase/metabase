(ns metabase.transforms.models.transform-job-transform-tag
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformJobTransformTag [_model] :transform_job_transform_tag)

(doto :model/TransformJobTransformTag
  (derive :metabase/model)
  (derive :hook/entity-id))

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(mu/defn create-transform-job-transform-tags! :- :nil
  "Insert the TransformJobTransformTag `rows`."
  [rows :- [:sequential ::transforms.schema/transform-job-transform-tag.create]]
  (transforms.db/insert-job-tag-links! rows)
  nil)

(mu/defn update-transform-job-transform-tags! :- :nil
  "Give the TransformJobTransformTags linking the TransformJob with `job-id` to the tags in `positions`, a map from tag
  id to position, their positions."
  [job-id    :- ms/PositiveInt
   positions :- [:map-of ::lib.schema.id/transform-tag :int]]
  (when (seq positions)
    (transforms.db/update-job-tag-link-positions! job-id positions))
  nil)

(mu/defn delete-transform-job-transform-tags! :- :nil
  "Delete the TransformJobTransformTags linking the TransformJob with `job-id` to the tags with `tag-ids`."
  [job-id  :- ms/PositiveInt
   tag-ids :- [:set ::lib.schema.id/transform-tag]]
  (transforms.db/delete-job-tag-links! job-id tag-ids)
  nil)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TransformJobTransformTag [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformJobTransformTag [_]
  {:schema    ::transforms.schema/external-transform-job-transform-tag
   :copy      [:entity_id :position]
   :parent    {:model :model/TransformJob :key :job_id :order (juxt :position :entity_id)}
   :transform {:job_id serialization/import-only-transform
               :tag_id (serialization/fk-transform :model/TransformTag)}})
