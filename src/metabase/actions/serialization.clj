(ns metabase.actions.serialization
  "The SerDes of Actions."
  (:require
   [metabase.actions.db :as actions.db]
   [metabase.collections.models.collection :as collection]
   [metabase.serialization.core :as serialization]))

(set! *warn-on-reflection* true)

(defn storage-paths
  "The storage path of each of the Action `entities`, in the data actions folder when it has no model."
  [entities ctx]
  (mapv (fn [{:keys [model_id] :as action}]
          (serialization/storage-default-collection-path
           action ctx (if (nil? model_id)
                        (serialization/collection-namespace-folder collection/data-actions-ns)
                        "main")))
        entities))

(defn import-dependencies
  "The `[model ref]` of the Collection, model and query references of each of the Action `entities`."
  [entities]
  (mapv (fn [action]
          (set (concat (when-let [collection-id (:collection_id action)]
                         [[:model/Collection collection-id]])
                       (when-let [model-id (:model_id action)]
                         [[:model/Card model-id]])
                       (when (= (keyword (:type action)) :query)
                         (serialization/import-mbql-dependencies (:dataset_query (first (:query action))))))))
        entities))

(defn export-dependencies
  "The `[model id]` of the Collection, model, Database and query references of each of the `actions`."
  [actions]
  (let [queries (when-let [ids (seq (keep #(when (= (keyword (:type %)) :query) (:id %)) actions))]
                  (into {} (map (juxt :action_id identity)) (actions.db/query-actions (vec ids))))]
    (mapv (fn [{:keys [id collection_id model_id]}]
            (set (concat (when collection_id [[:model/Collection collection_id]])
                         (when model_id [[:model/Card model_id]])
                         (when-let [{:keys [database_id dataset_query]} (get queries id)]
                           (concat (when database_id [[:model/Database database_id]])
                                   (serialization/export-mbql-dependencies dataset_query))))))
          actions)))

(defn loaded-entities
  "The Action `entities` an import loads, all but the HTTP actions it no longer loads."
  [entities]
  (filterv #(not= "http" (some-> % :type name)) entities))
