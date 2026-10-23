(ns metabase-enterprise.data-apps.test-util
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase-enterprise.data-studio.db :as data-studio.db]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.actions.core :as actions]
   [metabase.collections.core :as collections]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.serialization :as serdes]
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
  `queries`, which names the Library metrics it uses by their own entity IDs, and copies of the actions with
  `action-ids`, which belong to no model. Copies get [[copy-entity-id]]s."
  [collection-name collection-entity-id queries action-ids]
  (let [resolved  (for [{:keys [query] :as spec} queries
                        :let [table-id (get-in query [:stages 0 :source :id])
                              mp       (lib-be/application-database-metadata-provider
                                        (t2/select-one-fn :db_id :model/Table :id table-id))]]
                    {:spec spec :query (lib/test-query mp query)})
        actions   (map #(t2/select-one :model/Action :id %) action-ids)
        copy-id   (fn [action] (copy-entity-id "action" collection-entity-id (:entity_id action)))
        extract   (fn [model-name instance]
                    (cond-> (serdes/extract-one model-name {} instance)
                      (not= "Collection" model-name) (assoc :collection_id collection-entity-id)))
        entities  (serdes/with-cache
                    (doall
                     (concat
                      [(extract "Collection" (collection collection-entity-id collection-name))]
                      (for [{:keys [spec query]} resolved]
                        (extract "Card" (question spec query)))
                      (for [action actions]
                        (extract "Action" (action-copy action (copy-id action)))))))]
    (into (sorted-map) (map (juxt (partial file-path collection-name) serialization.dump/yaml-content)) entities)))

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

(defn do-with-sources!
  "Call `f` with what a data app uses from outside its collection, a venues metric in the Library and a query action
  that belongs to no model, and with what it can't, a venues model and an action on it, as
  `{:metric-id :action-id :model-id :model-action-id}`."
  [f]
  (do-with-library!
   (fn [{:keys [metrics-id]}]
     (let [mp    (mt/metadata-provider)
           query (lib/query mp (lib.metadata/table mp (mt/id :venues)))]
       (mt/with-temp [:model/Card {metric-id :id} {:name          "Venue count"
                                                   :type          :metric
                                                   :collection_id metrics-id
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
                                                :model_id model-id})}))))))

(defn venues-query
  "A query of the VENUES table, which a card in a data app's collection may read once it is published."
  []
  (let [mp (mt/metadata-provider)]
    (lib/query mp (lib.metadata/table mp (mt/id :venues)))))

(defn do-with-published-tables!
  "Call `f` with the Tables with `table-ids` published to the Library's Data collection, as a card in a data app's
  collection needs the tables it reads, putting back afterwards the published state of only the ones this call
  published, which drops a user settings row left empty, and creating the Library for the call when the instance has
  none."
  [table-ids f]
  (do-with-library!
   (fn [{:keys [data-id]}]
     (let [to-publish (set/difference (set table-ids) (data-studio.db/published-table-ids (set table-ids)))
           previous   (when (seq to-publish)
                        (into {}
                              (map (juxt :table_id #(select-keys % [:collection_id :is_published])))
                              (t2/select [:model/TableUserSettings :table_id :collection_id :is_published]
                                         :table_id [:in to-publish])))]
       (when (seq to-publish)
         (data-studio.db/publish-tables! to-publish data-id))
       (try
         (f)
         (finally
           (doseq [table-id to-publish]
             (t2/update! :model/TableUserSettings :table_id table-id
                         (get previous table-id {:collection_id nil, :is_published nil})))))))))

(defmacro with-published-tables!
  "Run `body` with the Tables with `table-ids` published to the Library."
  [table-ids & body]
  `(do-with-published-tables! ~table-ids (fn [] ~@body)))
