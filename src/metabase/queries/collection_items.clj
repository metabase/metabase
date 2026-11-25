(ns metabase.queries.collection-items
  "How the collection items listing shows the Cards."
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.queries.schema :as queries.schema]
   [metabase.upload.based-on-upload :as based-on-upload]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn fully-parameterized?
  "Given a Card, returns `true` if its query is fully parameterized."
  [{query :dataset_query, :as _card} :- ::queries.schema/card]
  (if (empty? query)
    true
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
  "Assoc `:based_on_upload` onto each of the model `rows` that is based on an upload."
  [rows]
  (let [id->table-id (based-on-upload/models-based-on-upload
                      (map #(select-keys % based-on-upload/based-on-upload-input-keys) rows))]
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
