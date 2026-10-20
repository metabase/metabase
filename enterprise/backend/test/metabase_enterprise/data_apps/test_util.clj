(ns metabase-enterprise.data-apps.test-util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.actions.core :as actions]
   [metabase.collections.core :as collections]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
   [metabase.models.serialization.resolve :as resolve]
   [metabase.test :as mt]
   [metabase.util.yaml :as yaml]
   [toucan2.core :as t2])
  (:import
   (java.nio.charset StandardCharsets)
   (java.security MessageDigest)))

(set! *warn-on-reflection* true)

(defn collection-entity-id
  "A stable resource collection entity ID for the app in `data_apps/<slug>`."
  [slug]
  (subs (str slug "-" (apply str (repeat 21 "c"))) 0 21))

(defn app-entity-id
  "A stable entity ID for the app in `data_apps/<slug>`."
  [slug]
  (subs (str slug "-" (apply str (repeat 21 "a"))) 0 21))

(defn collection-file
  "The text of the collection file for a data app's collection with `entity-id`, in the data-apps namespace."
  [entity-id collection-name]
  (yaml/generate-string {:name        collection-name
                         :namespace   "data-apps"
                         :entity_id   entity-id
                         :serdes/meta [{:model "Collection" :id entity-id :label (serialization/slugify-name collection-name)}]}))

(defn collection-dir
  "The directory under `collections/data_apps/` that holds what the collection named `collection-name` holds, and the
  stem of the collection's own file, as serialization writes them."
  [collection-name]
  (serialization/slugify-name collection-name))

(defn collection-path
  "The repo path of the file of the collection named `collection-name`, as serialization writes it."
  [collection-name]
  (format "collections/data_apps/%s.yaml" (collection-dir collection-name)))

(defn app-files
  "Repo files for one data app, as serialization writes them: its `data_app.yaml` under `data_apps/<dir>/` (slug and
  entity ID from `dir` unless given), a bundle at `path` with `bundle` content, and its `resources`, repo paths to
  file text (see [[build-resources]]), which default to the file of its collection under `collections/data_apps/`;
  `:resources nil` makes an app whose collection has no file."
  [dir {:keys [name path bundle description version allowed_hosts slug entity_id collection resources]
        :or   {slug dir}
        :as   options}]
  (let [entity-id       (or entity_id (app-entity-id dir))
        collection      (if (contains? options :collection) collection (collection-entity-id dir))
        collection-name (str "Data App: " slug)
        resources       (if (contains? options :resources)
                          resources
                          (when collection {(collection-path collection-name) (collection-file collection collection-name)}))]
    (merge
     {(format "data_apps/%s/data_app.yaml" dir)
      (yaml/generate-string
       (cond-> {:serdes/meta [{:model "DataApp" :id entity-id :label slug}]
                :entity_id   entity-id
                :slug        slug
                :name        name
                :path        path}
         collection          (assoc :collection collection)
         description         (assoc :description description)
         version             (assoc :version version)
         (seq allowed_hosts) (assoc :allowed_hosts allowed_hosts)))
      (format "data_apps/%s/%s" dir path) bundle}
     resources)))

(defn copy-entity-id
  "A stable entity ID for the copy of the `kind` entity `source-entity-id` in the app whose collection is
  `collection-entity-id`."
  [kind collection-entity-id source-entity-id]
  (let [^bytes digest (.digest (MessageDigest/getInstance "SHA-256")
                               (.getBytes (str/join "\u0000" [kind collection-entity-id source-entity-id])
                                          StandardCharsets/UTF_8))]
    (apply str (for [i (range 21)]
                 (.charAt "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-" (bit-and (aget digest i) 63))))))

(def ^:private instance-fields
  {:collection_id nil :collection_position nil :dashboard_id nil :document_id nil :archived false
   :archived_directly false :public_uuid nil :made_public_by_id nil :enable_embedding false
   :embedding_params nil :embedding_type nil :creator_id nil :created_at nil})

(defn- question [{:keys [entity_id name]} query]
  (merge instance-fields
         {:entity_id entity_id :name name :type :question :display :table :description nil
          :creator_id (mt/user->id :crowberto)
          :collection_preview true :card_schema nil :database_id (:database query)
          :dataset_query (lib/prepare-for-serialization query) :visualization_settings {}
          :parameters [] :parameter_mappings [] :result_metadata nil :dimensions nil :dimension_mappings nil}))

(defn- action-copy [action entity-id]
  (merge (select-keys action [:name :description :type :parameters :parameter_mappings :visualization_settings])
         (select-keys instance-fields [:archived :public_uuid :made_public_by_id :created_at])
         {:creator_id (mt/user->id :crowberto)}
         {:query    (t2/select :model/QueryAction :action_id (:id action))
          :implicit (t2/select :model/ImplicitAction :action_id (:id action))}
         {:entity_id entity-id :model_id nil}))

(defn- collection [entity-id collection-name]
  {:entity_id entity-id :name collection-name :slug nil :description nil :location "/" :namespace :data-apps :type nil
   :authority_level nil :archived false :archived_directly false :archive_operation_id nil
   :is_remote_synced false :is_sample false :personal_owner_id nil :created_at nil})

(defn- copy-overriding-resolver [base card-id->copy-entity-id]
  (reify resolve/SerdesExportResolver
    (export-fk [_ id model]
      (or (when (= "Card" (name model)) (card-id->copy-entity-id id))
          (resolve/export-fk base id model)))
    (export-fk-keyed [_ id model field] (resolve/export-fk-keyed base id model field))
    (export-user [_ id] (resolve/export-user base id))
    (export-table-fk [_ id] (resolve/export-table-fk base id))
    (export-field-fk [_ id] (resolve/export-field-fk base id))))

(defn- file-path
  "The repo path of an entity of the collection named `collection-name`: the collection's own file, or a file in the
  collection's directory named after the entity, with its entity ID so a test can find it."
  [collection-name entity]
  (let [{:keys [model id label]} (last (:serdes/meta entity))]
    (if (= model "Collection")
      (collection-path collection-name)
      (format "collections/data_apps/%s/%s_%s.yaml" (collection-dir collection-name) (serialization/slugify-name label) id))))

(defn build-resources
  "The files an author commits for the collection named `collection-name` with `collection-entity-id`, keyed by their
  repo path under `collections/data_apps/`: the collection, a saved question per `{:entity_id :name :query}` in
  `queries`, and copies of the metrics those use and of the actions with `action-ids`, which belong to no model.
  Copies get [[copy-entity-id]]s."
  [collection-name collection-entity-id queries action-ids]
  (let [resolved  (for [{:keys [query] :as spec} queries
                        :let [table-id (get-in query [:stages 0 :source :id])
                              mp       (lib-be/application-database-metadata-provider
                                        (t2/select-one-fn :db_id :model/Table :id table-id))]]
                    {:spec spec :query (lib/test-query mp query)})
        metrics   (t2/select :model/Card :id [:in (into #{-1} (mapcat (comp lib/all-source-card-ids :query)) resolved)])
        actions   (map #(t2/select-one :model/Action :id %) action-ids)
        copy-id   (fn [kind source] (copy-entity-id kind collection-entity-id (:entity_id source)))
        copy-ids  (into {} (map (juxt :id (partial copy-id "metric"))) metrics)
        extract   (fn [model-name instance]
                    (cond-> (serdes/extract-one model-name {} instance)
                      (not= "Collection" model-name) (assoc :collection_id collection-entity-id)))
        entities  (serdes/with-cache
                    (binding [resolve/*export-resolver* (copy-overriding-resolver resolve/*export-resolver* copy-ids)]
                      (doall
                       (concat
                        [(extract "Collection" (collection collection-entity-id collection-name))]
                        (for [{:keys [spec query]} resolved]
                          (extract "Card" (question spec query)))
                        (for [card metrics]
                          (extract "Card" (merge card instance-fields {:entity_id  (copy-ids (:id card))
                                                                       :creator_id (mt/user->id :crowberto)})))
                        (for [action actions]
                          (extract "Action" (action-copy action (copy-id "action" action))))))))]
    (into (sorted-map) (map (juxt (partial file-path collection-name) serialization.dump/yaml-content)) entities)))

(defn do-with-sources!
  "Call `f` with the sources a data app copies, a venues metric and a query action that belongs to no model, and with
  what it can't copy, a venues model and an action on it, as `{:metric-id :action-id :model-id :model-action-id}`."
  [f]
  (let [mp    (mt/metadata-provider)
        query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
    (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                :type          :metric
                                                :database_id   (mt/id)
                                                :dataset_query (lib/aggregate query (lib/count))}
                   :model/Card {model-id :id} {:name          "Venues model"
                                               :type          :model
                                               :database_id   (mt/id)
                                               :dataset_query query}]
      (f {:metric-id       metric-id
          :action-id       (actions/insert! {:name          "Rename venue"
                                             :type          :query
                                             :database_id   (mt/id)
                                             :dataset_query (lib/native-query mp "UPDATE venues SET name = {{name}}")
                                             :parameters    [{:id "name" :slug "name" :type :string/=}]})
          :model-id        model-id
          :model-action-id (actions/insert! {:name "Create venue" :type :implicit :kind :row/create
                                             :model_id model-id})}))))

(defn do-with-library!
  "Call `f` with the IDs of the root data library (`:data-id`) and metrics library (`:metrics-id`) collections, creating the
  library for the call when the instance has none."
  [f]
  (let [existing (collections/library-collection)
        library  (or existing (collections/create-library-collection!))
        children (t2/select :model/Collection :location (str "/" (:id library) "/"))
        id-of    (fn [collection-type] (:id (first (filter #(= collection-type (:type %)) children))))]
    (try
      (f {:data-id    (id-of collections/library-data-collection-type)
          :metrics-id (id-of collections/library-metrics-collection-type)})
      (finally
        (when-not existing
          (t2/delete! :model/Collection :id [:in (cons (:id library) (map :id children))]))))))
