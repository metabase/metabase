(ns metabase-enterprise.representations.v0.model
  (:require
   [flatland.ordered.map :refer [ordered-map]]
   [metabase-enterprise.representations.lookup :as lookup]
   [metabase-enterprise.representations.v0.card]
   [metabase-enterprise.representations.v0.common :as v0-common]
   [metabase-enterprise.representations.v0.mbql :as v0-mbql]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.util :as u]))

(def ^:private user-editable-settings
  [:column_title :text_align :text_wrapping :view_as :link_text :link_url
   :show_mini_bar :number_style :currency :currency_style
   :date_style :date_separator :date_abbreviate :time_enabled :time_style])

;;; ------------------------------------ Main Model Schema ------------------------------------

(defn- columns->result-metadata
  "Merge required inferred-metadata into the yml column metadata for user-defined fields."
  [user-metadata inferred-metadata]
  (let [name->base-type (into {} (for [md inferred-metadata]
                                   [(:lib/original-name md)
                                    (:base-type md)]))]
    (mapv (fn [user-column]
            (assoc user-column :base_type (get name->base-type (:name user-column))))
          user-metadata)))

(def toucan-model
  "The toucan model keyword associated with model representations"
  :model/Card)

(defn yaml->toucan
  "Convert a v0 model representation to Toucan-compatible data."
  [{model-name :display_name
    :keys [_type name description database columns] :as representation}
   ref-index]
  (let [database-id (lookup/lookup-database-id ref-index database)
        dataset-query (-> (assoc representation :database database-id)
                          (v0-mbql/import-dataset-query ref-index))
        metadata-provider (lib-be/application-database-metadata-provider database-id)
        normalized-query (lib-be/normalize-query dataset-query)
        mlv2-query (lib/query metadata-provider normalized-query)
        inferred-metadata (lib/returned-columns mlv2-query)
        collection-id (when (:collection representation)
                        (v0-common/lookup-id ref-index (:collection representation)))]
    (-> {:name (or model-name name)
         :description description
         :dataset_query dataset-query
         :database_id database-id
         :query_type (if (lib/native-only-query? dataset-query) :native :query)
         :type :model
         :collection_id collection-id
         :result_metadata (when columns
                            (columns->result-metadata columns inferred-metadata))}
        u/remove-nils)))

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
                  (select-keys result-column-metadata [:display_name
                                                       :description
                                                       :semantic_type
                                                       :visibility_type
                                                       :fk_target_field_id]))
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
        (assoc :columns columns) ;; put columns last
        u/remove-nils)))
