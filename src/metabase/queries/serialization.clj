(ns metabase.queries.serialization
  "The SerDes of Cards."
  (:require
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.metrics.core :as metrics]
   [metabase.queries.models.card.metadata :as card.metadata]
   [metabase.queries.schema :as queries.schema]
   [metabase.serialization.core :as serialization]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private export-walkers
  "The dependency walkers for a Card row with database ids."
  {:mbql                   serialization/export-mbql-dependencies
   :parameters             serialization/export-parameters-dependencies
   :visualization-settings serialization/export-visualization-settings-dependencies})

(def ^:private import-walkers
  "The dependency walkers for Card entities, which hold references."
  {:mbql                   serialization/import-mbql-dependencies
   :parameters             serialization/import-parameters-dependencies
   :visualization-settings serialization/import-visualization-settings-dependencies})

(defn- result-metadata-dependencies
  "The dependencies of a Card's `:result_metadata`: what their field refs refer to, found with `mbql`."
  [metadata {:keys [mbql]}]
  (into #{} (comp (keep :field_ref) (mapcat mbql)) metadata))

(defn storage-paths
  "The storage path of each of the Card `entities`, in the directory of its Dashboard or Document when it has one."
  [entities ctx]
  (mapv (fn [card]
          (let [base (serialization/storage-default-collection-path card ctx)]
            (cond
              (:dashboard_id card)
              (let [dash-segment (get (:dashboards ctx) (:dashboard_id card))]
                (if dash-segment
                  (into (vec (butlast base)) [dash-segment (last base)])
                  base))

              (:document_id card)
              (let [doc-segment (get (:documents ctx) (:document_id card))]
                (if doc-segment
                  (into (vec (butlast base)) [doc-segment (last base)])
                  base))

              :else base)))
        entities))

(defn- model-card?
  "Whether `card` is a model."
  [card]
  (= (keyword (:type card)) :model))

(defn- model-override-keys
  "The keys of a model's result metadata columns that a user can override, which export keeps for models."
  []
  (into #{:name} (map u/->snake_case_en) (lib/model-preserved-keys false)))

(defn- walk-export-result-metadata
  "The exported `result_metadata` of `card`, its ids replaced by what `visit` resolves them to. Native cards, models
  included, keep the keys of their columns, which can't be derived from the query without running it; other models
  keep the keys a model preserves; other cards export none."
  [visit {:keys [result_metadata dataset_query] :as card}]
  (let [field #(serialization/visit-some :model/Field % visit)]
    (cond
      (empty? result_metadata)
      nil

      (lib/native? dataset_query)
      (mapv (fn [column]
              (-> (select-keys column [:name :base_type :effective_type :field_ref :database_type :display_name
                                       :semantic_type :description :visibility_type :settings :fk_target_field_id
                                       :id :table_id])
                  (m/update-existing :table_id #(serialization/visit-some :model/Table % visit))
                  (m/update-existing :id field)
                  (m/update-existing :field_ref #(serialization/walk-export visit %))
                  (m/update-existing :fk_target_field_id field)))
            result_metadata)

      (model-card? card)
      (mapv (fn [column]
              (-> (select-keys column (model-override-keys))
                  (m/update-existing :fk_target_field_id field)
                  (m/update-existing :id field)))
            result_metadata)

      :else
      nil)))

(defn- walk-import-result-metadata
  "The `result_metadata` of an exported card with its references replaced by what `visit` resolves them to, normalized
  like the stored column."
  [visit result-metadata]
  (cond->> (some->> result-metadata
                    (mapv (fn [column]
                            (-> column
                                (m/update-existing :table_id #(serialization/visit-some :model/Table % visit))
                                (m/update-existing :id #(serialization/visit-some :model/Field % visit))
                                (m/update-existing :field_ref #(serialization/walk-import-refs visit %))
                                (m/update-existing :fk_target_field_id
                                                   #(if (number? %) % (serialization/visit-some :model/Field % visit)))))))
    (and (some? result-metadata) (not (serialization/collecting? visit)))
    (lib/normalize ::queries.schema/card.result-metadata)))

(defn- export-database-ids
  "A transform fn exporting the Database of each card whose query doesn't name it, the only reference of an empty
  query; the rest leave it out."
  [store cards ids _opts]
  (mapv (fn [{:keys [dataset_query]} db-name]
          (when-not (and (seq dataset_query) (:database dataset_query))
            db-name))
        cards
        (serialization/column-refs store :model/Database ids)))

(def database-id-transform
  "The transform of the `database_id` of Cards, which exports only the Database of a card whose query doesn't name it."
  (assoc serialization/database-transform :export export-database-ids))

(defn- export-result-metadata
  "Exports the `result_metadata` of `cards` with references in place of ids."
  [store cards _values _opts]
  (serialization/export-in-bulk store cards walk-export-result-metadata))

(defn- import-result-metadata
  "Imports the exported `result_metadata` values `xs` with ids in place of references."
  [store _entities xs opts]
  (serialization/import-in-bulk store xs opts walk-import-result-metadata))

(def result-metadata-transform
  "The transform of the `result_metadata` of Cards."
  {:export export-result-metadata
   :import import-result-metadata})

(defn- export-dimensions
  "Exports the `dimensions` values `xs` of metrics with references in place of ids."
  [store _cards xs _opts]
  (serialization/export-in-bulk store xs metrics/walk-export-dimensions))

(defn- import-dimensions
  "Imports the exported `dimensions` values `xs` of metrics with ids in place of references."
  [store _entities xs opts]
  (serialization/import-in-bulk store xs opts metrics/walk-import-dimensions))

(def dimensions-transform
  "The transform of the `dimensions` of Cards."
  {:export export-dimensions
   :import import-dimensions})

(defn- export-dimension-mappings
  "Exports the `dimension_mappings` values `xs` of metrics with references in place of ids."
  [store _cards xs _opts]
  (serialization/export-in-bulk store xs metrics/walk-export-dimension-mappings))

(defn- import-dimension-mappings
  "Imports the exported `dimension_mappings` values `xs` of metrics with ids in place of references."
  [store _entities xs opts]
  (serialization/import-in-bulk store xs opts metrics/walk-import-dimension-mappings))

(def dimension-mappings-transform
  "The transform of the `dimension_mappings` of Cards."
  {:export export-dimension-mappings
   :import import-dimension-mappings})

(defn- dimension-mappings-dependencies
  "The dependencies of a Card's `:dimension_mappings`: what their targets refer to, found with `mbql`."
  [mappings {:keys [mbql]}]
  (into #{} (comp (keep :target) (mapcat mbql)) mappings))

(defn- card-dependencies
  "The dependencies of a Card, found with the `walkers` of [[export-walkers]] or [[import-walkers]]."
  [{:keys [collection_id dataset_query dimension_mappings parameter_mappings result_metadata source_card_id
           dashboard_id document_id] :as card}
   {:keys [mbql parameters visualization-settings] :as walkers}]
  (set
   (concat
    (mapcat mbql parameter_mappings)
    (dimension-mappings-dependencies dimension_mappings walkers)
    (parameters (:parameters card))
    (when source_card_id #{[:model/Card source_card_id]})
    (when collection_id #{[:model/Collection collection_id]})
    (when dashboard_id #{[:model/Dashboard dashboard_id]})
    (when document_id #{[:model/Document document_id]})
    (result-metadata-dependencies result_metadata walkers)
    (mbql dataset_query)
    (visualization-settings (:visualization_settings card)))))

(defn- export-card-dependencies
  "The `[model id]` dependencies of a Card row, its Database included."
  [{:keys [database_id] :as card}]
  (cond-> (card-dependencies card export-walkers)
    database_id (conj [:model/Database database_id])))

(defn- import-card-dependencies
  "The `[model ref]` dependencies of a Card entity."
  [card]
  (card-dependencies card import-walkers))

(defn import-dependencies
  "The `[model ref]` dependencies of each of the Card `entities`."
  [entities]
  (mapv import-card-dependencies entities))

(defn export-dependencies
  "The `[model id]` dependencies of each of the `cards`, rows."
  [cards]
  (mapv export-card-dependencies cards))

(defn- overrides-stored?
  "Whether each column of `metadata`, the exported overrides of a model, matches the column of `stored` metadata at
  its position in the keys a user can override."
  [metadata stored]
  (let [ks (model-override-keys)]
    (and (= (count metadata) (count stored))
         (every? true? (map (fn [column stored-column]
                              (let [column (select-keys column ks)]
                                (= column (select-keys stored-column (keys column)))))
                            metadata stored)))))

(defn- with-model-metadata
  "The load `item` of a Card that writes a model, without the exported overrides of its metadata when the local row
  stores them, with the exported metadata of a native query, whose columns can't be inferred without running it, or
  with the overrides applied to freshly inferred metadata, as an update of its query would store them."
  [{:keys [row local] :as item}]
  (let [{query :dataset_query metadata :result_metadata card-type :type} row]
    (cond
      (not (and query (seq metadata) (= :model (keyword card-type)) (not-any? :id metadata)))
      item

      (overrides-stored? metadata (:result_metadata local))
      (update item :row dissoc :result_metadata)

      (lib/native-only-query? query)
      item

      :else
      (let [overrides (mapv #(select-keys % (model-override-keys)) metadata)]
        (assoc-in item [:row :result_metadata]
                  (or (card.metadata/infer-metadata-with-model-overrides query (assoc row :result_metadata overrides))
                      metadata))))))

(defn- keep-local-metadata
  "The load `item` of a Card without a `:result_metadata` or `:database_id` to import keeping the local ones, which
  export leaves out of the cards whose query derives them."
  [item]
  (cond-> item
    (nil? (get-in item [:row :result_metadata])) (update :row dissoc :result_metadata)
    (nil? (get-in item [:row :database_id]))     (update :row dissoc :database_id)))

(defn before-load
  "The Card load `items` keeping the local metadata and Database the export leaves out, and the model metadata."
  [items]
  (mapv (comp with-model-metadata keep-local-metadata) items))
