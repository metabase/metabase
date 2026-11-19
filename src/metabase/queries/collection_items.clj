(ns metabase.queries.collection-items
  "How the collection items listing shows the Cards."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fully-parameterized?
  [{query :dataset_query}]
  (or (empty? query)
      (lib/fully-parameterized-query? query)))

(defn- card-row
  "The Card instance of `row`, stamped with the nil `:document_id` that the listing query guarantees, so that
  `mi/can-write?` does not resolve it from the primary key with one query per row."
  [row]
  (-> (t2/instance :model/Card row)
      (assoc :document_id nil)
      (update :dataset_query (:out lib-be/transform-query))
      (update :archived api/bit->boolean)
      (update :archived_directly api/bit->boolean)))

(defn- card-row-after-hydrate
  [row]
  (-> (dissoc row :authority_level :icon :personal_owner_id :dataset_query :table_id :query_type :is_upload :namespace
              :document_id)
      (update :dashboard #(when % (select-keys % [:id :name :moderation_status])))
      (assoc :fully_parameterized (fully-parameterized? (select-keys row [:dataset_query])))))

(defn- assoc-based-on-upload
  "Assoc `:based_on_upload` onto each of the model `rows` that is based on an upload. The `upload` module requires this
  one, so its namespace is resolved when a model is first listed."
  [rows]
  (let [models-based-on-upload @(requiring-resolve 'metabase.upload.core/models-based-on-upload)
        input-keys             @(requiring-resolve 'metabase.upload.core/based-on-upload-input-keys)
        id->table-id           (models-based-on-upload (map #(select-keys % input-keys) rows))]
    (map #(m/assoc-some % :based_on_upload (id->table-id (:id %))) rows)))

(defn- hydrate-cards
  [rows hydrate-based-on-upload?]
  (as-> (map card-row rows) $
    (t2/hydrate $
                :can_write
                :can_restore
                :can_delete
                :dashboard_count
                :is_remote_synced
                :collection_namespace
                [:dashboard :moderation_status])
    (cond-> $
      hydrate-based-on-upload? assoc-based-on-upload)
    (map card-row-after-hydrate $)))

(defn hydrate
  "The `rows` of saved questions or metrics of the collection items listing as the API shows them."
  [_collection _opts rows]
  (hydrate-cards rows false))

(defn hydrate-models
  "The `rows` of models of the collection items listing as the API shows them, with the upload each is based on."
  [_collection _opts rows]
  (hydrate-cards rows true))
