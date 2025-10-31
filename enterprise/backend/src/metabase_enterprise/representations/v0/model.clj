(ns metabase-enterprise.representations.v0.model
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.toucan.core :as rep-t2]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(def ^:private user-editable-settings
  [:column_title :text_align :text_wrapping :view_as :link_text :link_url
   :show_mini_bar :number_style :currency :currency_style
   :date_style :date_separator :date_abbreviate :time_enabled :time_style])

;;; ------------------------------------ Main Model Schema ------------------------------------

(defn- columns->result-metadata
  "Merge required inferred-metadata into the yml column metadata for user-defined fields."
  [user-metadata inferred-metadata]
  (mapv (fn [user-column inferred]
          (assoc user-column :base_type (:base_type inferred)))
        user-metadata
        inferred-metadata))

(def toucan-model
  "The toucan model keyword associated with model representations"
  :model/Card)

(defn yaml->toucan
  "Convert a v0 model representation to Toucan-compatible data."
  [{model-name :display_name
    :keys [_type name description database collection columns] :as representation}
   ref-index]
  (let [database-id (lookup/lookup-database-id ref-index database)
        ;; TODO: once we've cleaned up mbql stuff, this explicit lookup should be superfluous.
        ;; Just pull it off of the dataset-query
        dataset-query (-> (assoc representation :database database-id)
                          (v0-mbql/import-dataset-query ref-index))
        ;; An alternative:
        ;; 1. Get the database-id, construct a metadata-provider.
        ;; 2. Call `card.metadata/normalize-dataset-query` on the query with that metadata-provider
        ;; 3. Call `lib/query` on the normalized query with the metadata-provider
        ;; 4. Pass the result of that into `lib/returned-columns`
        ;; No idea which is better.
        inferred-metadata (card.metadata/infer-metadata dataset-query)]
    (-> {:name (or model-name name)
         :description description
         :dataset_query dataset-query
         :database_id database-id
         :query_type (if (= (name (:type dataset-query)) "native") :native :query)
         :type :model
         :result_metadata (when columns
                            (columns->result-metadata columns inferred-metadata))
         :collection_id (v0-common/find-collection-id collection)}
        u/remove-nils)))

(defn persist!
  "Persist a v0 model representation by creating or updating it in the database."
  [representation ref-index]
  (let [model-data (->> (yaml->toucan representation ref-index)
                        (rep-t2/with-toucan-defaults :model/Card))
        entity-id (:entity_id model-data)
        existing (when entity-id
                   (t2/select-one :model/Card :entity_id entity-id))]
    (if existing
      (do
        (log/info "Updating existing model" (:name model-data) "with name" (:name representation))
        (t2/update! :model/Card (:id existing) (dissoc model-data :entity_id))
        (t2/select-one :model/Card :id (:id existing)))
      (do
        (log/info "Creating new model" (:name model-data))
        (let [model-data-with-creator (-> model-data
                                          (assoc :creator_id (or api/*current-user-id*
                                                                 config/internal-mb-user-id))
                                          (assoc :entity_id entity-id))]
          (first (t2/insert-returning-instances! :model/Card model-data-with-creator)))))))

;;; -- Export --

(defn- extract-user-editable-settings
  "Extract user-editable settings from a column's settings map.
   Returns only the fields that users should be able to edit in YAML."
  [settings]
  (when settings
    (not-empty
     (select-keys settings user-editable-settings))))

(defn- extract-user-editable-column-metadata
  "Extract user-editable metadata from a result_metadata column entry.
   Returns a map with :name and user-editable fields only."
  [result-column-metadata]
  (let [base {:name (:name result-column-metadata)}
        editable (not-empty
                  (select-keys result-column-metadata [:display_name :description :semantic_type
                                                       :visibility_type :fk_target_field_id]))
        settings (extract-user-editable-settings (:settings result-column-metadata))]
    (cond-> base
      editable (merge editable)
      settings (assoc :settings settings))))

(defn export-model
  "Export a Model Card Toucan entity to a v0 model representation."
  [card]
  (let [card-ref (v0-common/unref (v0-common/->ref (:id card) :model))
        columns (when-let [result-metadata (:result_metadata card)]
                  (seq (mapv extract-user-editable-column-metadata result-metadata)))]
    (-> (ordered-map
         {:name card-ref
          :type (:type card)
          :version :v0
          :display_name (:name card)
          :description (:description card)})
        (merge (v0-mbql/export-dataset-query (:dataset_query card)))
        (assoc :columns columns)
        u/remove-nils)))
