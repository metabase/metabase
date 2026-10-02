(ns metabase-enterprise.data-apps.test-util
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase-enterprise.serialization.core :as serialization]
   [metabase-enterprise.serialization.dump :as serialization.dump]
   [metabase.actions.core :as actions]
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

(def fake-sha
  "A commit SHA for snapshots that don't care which commit they are."
  "0123456789abcdef0123456789abcdef01234567")

(defn snapshot
  "Build a snapshot (as the remote-sync import passes one) from a path->content map. `read-file` returns file text or
  nil; `list-dir` reuses the derivation the real non-git snapshots use, so the fake can't drift from it."
  [path->content & {:keys [sha] :or {sha fake-sha}}]
  {:sha       sha
   :list-dir  (fn [dir] (source/paths->children (keys path->content) dir))
   :read-file (fn [p] (get path->content p))})

(defn collection-entity-id
  "A stable resource collection entity ID for the app in `data_apps/<slug>`."
  [slug]
  (subs (str slug "-" (apply str (repeat 21 "c"))) 0 21))

(defn app-entity-id
  "A stable entity ID for the app in `data_apps/<slug>`."
  [slug]
  (subs (str slug "-" (apply str (repeat 21 "a"))) 0 21))

(defn collection-file
  "The text of a `resources/collection.yaml` for the collection with `entity-id`."
  [entity-id collection-name]
  (yaml/generate-string {:name        collection-name
                         :entity_id   entity-id
                         :serdes/meta [{:model "Collection" :id entity-id :label "data_app"}]}))

(defn app-files
  "Repo files for one data app under `data_apps/<dir>/`, as serialization writes them: its `data_app.yaml` (slug and
  entity ID from `dir` unless given), a bundle at `path` with `bundle` content, and its resource files. `resources`
  maps paths relative to `resources/` to file text and defaults to just the collection; `:resources nil` with
  `:collection nil` makes an app without resources."
  [dir {:keys [name path bundle description version allowed_hosts slug entity_id collection resources]
        :or   {slug dir}
        :as   options}]
  (let [entity-id  (or entity_id (app-entity-id dir))
        collection (if (contains? options :collection) collection (collection-entity-id dir))
        resources  (if (contains? options :resources)
                     resources
                     (when collection {"collection.yaml" (collection-file collection (str "Data App: " name))}))]
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
     (update-keys resources #(format "data_apps/%s/resources/%s" dir %)))))

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
          :implicit (t2/select :model/ImplicitAction :action_id (:id action))
          :http     (t2/select :model/HTTPAction :action_id (:id action))}
         {:entity_id entity-id :model_id nil}))

(defn- collection [entity-id]
  {:entity_id entity-id :name "Data App" :slug nil :description nil :location "/" :namespace nil :type nil
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

(defn- file-path [entity]
  (let [{:keys [model id label]} (last (:serdes/meta entity))]
    (if (= model "Collection")
      "collection.yaml"
      (str ({"Card" "cards" "Action" "actions"} model) "/" (serialization/slugify-name label) "_" id ".yaml"))))

(defn build-resources
  "The resource files an author commits for the app whose collection has `collection-entity-id`, keyed by their path
  relative to `resources/`: a saved question per `{:entity_id :name :query}` in `queries`, and copies of the metrics
  those use and of the actions with `action-ids` on copies of their models. Copies get [[copy-entity-id]]s."
  [collection-entity-id queries action-ids]
  (let [resolved  (for [{:keys [query] :as spec} queries
                        :let [table-id (get-in query [:stages 0 :source :id])
                              mp       (lib-be/application-database-metadata-provider
                                        (t2/select-one-fn :db_id :model/Table :id table-id))]]
                    {:spec spec :query (lib/test-query mp query)})
        metrics   (t2/select :model/Card :id [:in (into #{-1} (mapcat (comp lib/all-source-card-ids :query)) resolved)])
        actions   (map #(t2/select-one :model/Action :id %) action-ids)
        models    (t2/select :model/Card :id [:in (into #{-1} (map :model_id) actions)])
        copy-id   (fn [kind source] (copy-entity-id kind collection-entity-id (:entity_id source)))
        copy-ids  (merge (into {} (map (juxt :id (partial copy-id "metric"))) metrics)
                         (into {} (map (juxt :id (partial copy-id "model"))) models))
        extract   (fn [model-name instance & [model-entity-id]]
                    (cond-> (serdes/extract-one model-name {} instance)
                      (= model-name "Card")   (assoc :collection_id collection-entity-id)
                      (= model-name "Action") (assoc :model_id model-entity-id)))
        entities  (serdes/with-cache
                    (binding [resolve/*export-resolver* (copy-overriding-resolver resolve/*export-resolver* copy-ids)]
                      (doall
                       (concat
                        [(extract "Collection" (collection collection-entity-id))]
                        (for [{:keys [spec query]} resolved]
                          (extract "Card" (question spec query)))
                        (for [card (concat metrics models)]
                          (extract "Card" (merge card instance-fields {:entity_id  (copy-ids (:id card))
                                                                       :creator_id (mt/user->id :crowberto)})))
                        (for [action actions]
                          (extract "Action" (action-copy action (copy-id "action" action))
                                   (copy-ids (:model_id action))))))))]
    (into (sorted-map) (map (juxt file-path serialization.dump/yaml-content)) entities)))

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
