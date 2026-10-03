(ns metabase-enterprise.data-apps.resource-validation
  "What a data app's resource files may hold. Serialization loads them like any other entity files (see
  `metabase-enterprise.serialization.v2.ingest/shared-top-level-paths`), and a load trusts what it reads: it updates
  whatever row carries an entity ID and resolves references to any local entity. These checks run on the ingested
  files first, so an app's `resources/` can only define its own collection and cards and actions in it, the actions
  on its model copies when they have a model, referencing nothing else of Metabase's but what already exists."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.models.db :as models.db]
   [metabase.models.serialization :as serdes]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private external-dependency-models
  "Models a resource may reference outside the app. They must already exist: a load never creates them."
  #{"Database" "Table" "Field" "NativeQuerySnippet" "Segment" "Measure"})

(def ^:private card-types #{"question" "model" "metric"})

(def ^:private action-types #{"implicit" "query"})

(def ^:private resource-models
  "The model a resource file holds, by its path relative to `resources/`."
  {"collection.yaml" "Collection", "cards" "Card", "actions" "Action"})

(defn- leaf [path]
  (last path))

(defn- problem [file message]
  {:file file :message message})

(defn- identity-problems [{:keys [path model entity]}]
  (let [meta-path (:serdes/meta entity)
        {meta-model :model meta-id :id} (leaf meta-path)]
    (when-not (and (= 1 (count meta-path))
                   (= model meta-model)
                   (serdes/entity-id? (:entity_id entity))
                   (= meta-id (:entity_id entity)))
      [(problem path (tru "{0} must hold a single {1} whose serdes/meta ID is its entity_id." path model))])))

(defn- creator-problems
  "A load creates the user a `creator_id` names when it has to, but can't save a card or action without one."
  [{:keys [path entity]}]
  (when (nil? (:creator_id entity))
    [(problem path (tru "{0} must name its creator in creator_id." path))]))

(defn- public-problems [{:keys [path entity]}]
  (when (or (some entity [:public_uuid :made_public_by_id :embedding_params :embedding_type])
            (:enable_embedding entity))
    [(problem path (tru "{0} must not be public or embedded." path))]))

(defn- type-name [entity]
  (let [t (:type entity)]
    (when (or (string? t) (keyword? t))
      (name t))))

(defn- action-children-problems
  "Serdes loads an action's implicit and query rows whatever its type, so a file must carry exactly the one its type
  uses."
  [{:keys [path entity]}]
  (let [counts   (update-vals (select-keys entity [:implicit :query]) count)
        expected (case (type-name entity)
                   "implicit" {:implicit 1}
                   "query"    {:query 1}
                   nil)]
    (when (and expected (not= expected (into {} (remove (comp zero? val)) counts)))
      [(problem path (tru "{0} must carry exactly the row its action type uses." path))])))

(defn- parameter-source-problems
  "An action's parameters can take their values from a card, which its dependencies don't include."
  [{:keys [path entity]}]
  (when (some (comp :card_id :values_source_config) (:parameters entity))
    [(problem path (tru "{0} must not take parameter values from a card." path))]))

(defn- model-problems [collection-entity-id model-entity-ids {:keys [path model entity] :as file}]
  (case model
    "Collection"
    (concat
     (when (not= collection-entity-id (:entity_id entity))
       [(problem path (tru "{0} must hold the collection {1} named in data_app.yaml." path collection-entity-id))])
     (when (or (some entity [:parent_id :personal_owner_id :namespace :authority_level :type :archive_operation_id])
               (:is_remote_synced entity)
               (:is_sample entity)
               (:archived entity))
       [(problem path (tru "{0} must be a plain root collection that is not remote-synced or archived." path))]))

    "Card"
    (concat
     (when (not= collection-entity-id (:collection_id entity))
       [(problem path (tru "{0} must be in the collection {1}." path collection-entity-id))])
     (when-not (card-types (type-name entity))
       [(problem path (tru "{0} must be a question, model, or metric." path))])
     (when-not (and (map? (:dataset_query entity)) (some? (:database (:dataset_query entity))))
       [(problem path (tru "{0} must hold a query." path))])
     (when (:archived entity)
       [(problem path (tru "{0} must not be archived." path))])
     (when (some entity [:dashboard_id :document_id])
       [(problem path (tru "{0} must not belong to a dashboard or document." path))])
     (creator-problems file)
     (public-problems file))

    "Action"
    (concat
     (when (not= collection-entity-id (:collection_id entity))
       [(problem path (tru "{0} must be in the collection {1}." path collection-entity-id))])
     (when-not (action-types (type-name entity))
       [(problem path (tru "{0} must be an implicit or query action." path))])
     (when (and (= "implicit" (type-name entity)) (nil? (:model_id entity)))
       [(problem path (tru "{0} is an implicit action, so it must belong to a model." path))])
     (when (and (some? (:model_id entity)) (not (contains? model-entity-ids (:model_id entity))))
       [(problem path (tru "{0} must belong to a model in the app''s resources." path))])
     (when (:archived entity)
       [(problem path (tru "{0} must not be archived." path))])
     (action-children-problems file)
     (parameter-source-problems file)
     (creator-problems file)
     (public-problems file))))

(defn- dependencies
  "The serdes dependencies of the entity in `file`, or nil with a problem when they can't be read."
  [{:keys [path entity]}]
  (try
    [(serdes/deserialization-dependencies entity) nil]
    (catch Exception e
      [nil (problem path (tru "{0} is malformed: {1}" path (ex-message e)))])))

(defn- dependency-problems
  [collection-entity-id card-entity-ids {:keys [path] :as file}]
  (let [[deps malformed] (dependencies file)]
    (if malformed
      [malformed]
      (for [dependency deps
            :let [{:keys [model id]} (leaf dependency)]
            :when (case model
                    "Collection" (not= id collection-entity-id)
                    "Card"       (not (contains? card-entity-ids id))
                    (not (contains? external-dependency-models model)))]
        (problem path (tru "{0} references {1} {2}, which is not one of the app''s resources." path model id))))))

(defn- duplicate-problems [resources]
  (for [[[model entity-id] files] (group-by (juxt :model (comp :entity_id :entity)) resources)
        :when (< 1 (count files))]
    (problem (:path (first files))
             (tru "{0} {1} is defined by more than one file: {2}." model entity-id (str/join ", " (map :path files))))))

(defn- external-dependency-problems [resources]
  (for [{:keys [path] :as file} resources
        dependency (first (dependencies file))
        :let [{:keys [model id]} (leaf dependency)]
        :when (and (contains? external-dependency-models model)
                   (nil? (serdes/load-find-local dependency)))]
    (problem path (tru "{0} references {1} {2}, which does not exist on this instance." path model id))))

(defn- portable-refs
  "The portable table references (`[db schema table]`) and field references (`[db schema table field ...]`) the
  serialized queries in `entity` make."
  [entity]
  (let [refs (volatile! #{})]
    (walk/postwalk (fn [x]
                     (when (and (map? x) (vector? (:source-table x)))
                       (vswap! refs conj [:table (:source-table x)]))
                     (when (and (vector? x)
                                (#{"field" :field} (first x))
                                (vector? (last x))
                                (every? string? (last x)))
                       (vswap! refs conj [:field (last x)]))
                     x)
                   (select-keys entity [:dataset_query :query :parameter_mappings]))
    @refs))

(defn- missing-table-and-field-problems
  "Serialization creates an inactive placeholder for a table or field a query names that this instance doesn't
  have. A data app's query would then run against nothing, so the file is refused instead."
  [{:keys [path] :as file}]
  (let [table-id (fn [[db-name schema table-name]]
                   (some-> (models.db/database-id-by-name db-name)
                           (as-> database-id (models.db/table-id-by-name table-name schema database-id))))]
    (for [[kind [db-name schema table-name & field-names :as ref]] (sort-by second (portable-refs (:entity file)))
          :when (or (nil? (table-id [db-name schema table-name]))
                    (and (= kind :field)
                         (nil? (models.db/field-pk-in-path (table-id [db-name schema table-name]) (reverse field-names)))))]
      (problem path (tru "{0} references {1} {2}, which does not exist on this instance."
                         path (if (= kind :table) "table" "field") (pr-str ref))))))

(defn- ownership-problems
  "Serdes would update any row carrying an entity ID a file names, so a file may only name what this app owns:
  the collection its manifest names, if it exists, must be this app's, and existing cards and actions must be in
  it."
  [app-entity-id collection-entity-id resources]
  (let [app               (data-apps.db/data-app-by-entity-id app-entity-id)
        app-collection-id (:resource_collection_id app)
        owned?            (fn [collection-id] (and (some? app-collection-id) (= app-collection-id collection-id)))
        entity-ids-of     (fn [model]
                            (into [] (comp (filter (comp #{model} :model)) (map (comp :entity_id :entity))) resources))
        file-of           (fn [model entity-id]
                            (some #(when (and (= model (:model %)) (= entity-id (:entity_id (:entity %)))) (:path %))
                                  resources))]
    (concat
     (for [{:keys [id entity_id]} (data-apps.db/collections-by-entity-ids [collection-entity-id])
           :when (not (owned? id))]
       (problem (or (file-of "Collection" entity_id) (str "data_apps/" app-entity-id))
                (tru "Collection {0} already exists and isn''t this data app''s collection. Give the app a new collection: a new entity ID in data_app.yaml and resources/collection.yaml."
                     entity_id)))
     (for [[model rows] [["Card"   (data-apps.db/cards-by-entity-ids (entity-ids-of "Card"))]
                         ["Action" (data-apps.db/actions-by-entity-ids (entity-ids-of "Action"))]]
           {:keys [entity_id collection_id]} rows
           :when (not (owned? collection_id))]
       (problem (file-of model entity_id)
                (tru "{0} {1} already exists outside this data app''s collection, so the app can''t load it. Move it back if it belongs to this app."
                     model entity_id))))))

(defn- resource-model
  "The model the resource at `relative-path` (to `resources/`) holds, or nil when the path isn't one of the layout's."
  [relative-path]
  (let [[first-segment second-segment & more] (str/split relative-path #"/")]
    (cond
      (and (= first-segment "collection.yaml") (nil? second-segment)) "Collection"
      (and (contains? #{"cards" "actions"} first-segment) second-segment (nil? more)) (resource-models first-segment)
      :else nil)))

(defn- app-problems
  "The problems of one app directory: its manifest `{:path :entity}` (or nil) and the `{:path :entity}` of the
  resource files under it, with their paths relative to `resources/`."
  [dir manifest resources]
  (let [resources (for [{:keys [relative-path] :as file} resources]
                    (assoc file :model (resource-model relative-path)))
        unknown   (filter (comp nil? :model) resources)
        resources (remove (comp nil? :model) resources)
        collection-entity-id (-> manifest :entity :collection)
        ;; ingestion passes over a file that doesn't identify its entity, which for a manifest means no app
        manifest-problems (when manifest (identity-problems (assoc manifest :model "DataApp")))]
    (cond
      (seq manifest-problems)
      manifest-problems

      (empty? resources)
      (map #(problem (:path %) (tru "{0} is not a data app resource." (:path %))) unknown)

      (nil? manifest)
      [(problem (:path (first resources)) (tru "data_apps/{0}/resources needs a data_app.yaml beside it." dir))]

      (nil? collection-entity-id)
      [(problem (:path manifest) (tru "{0} must name the app''s resource collection as `collection`." (:path manifest)))]

      :else
      (let [cards            (filter (comp #{"Card"} :model) resources)
            card-entity-ids  (into #{} (map (comp :entity_id :entity)) cards)
            model-entity-ids (into #{}
                                   (comp (map :entity) (filter (comp #{"model"} type-name)) (map :entity_id))
                                   cards)
            structural       (concat
                              (map #(problem (:path %) (tru "{0} is not a data app resource." (:path %))) unknown)
                              (when (empty? (filter (comp #{"Collection"} :model) resources))
                                [(problem (:path manifest)
                                          (tru "The app''s resource collection is missing. Write it to resources/collection.yaml and commit it."))])
                              (duplicate-problems resources)
                              (mapcat identity-problems resources))]
        (if (seq structural)
          structural
          (concat
           (mapcat (partial model-problems collection-entity-id model-entity-ids) resources)
           (mapcat (partial dependency-problems collection-entity-id card-entity-ids) resources)
           (ownership-problems (-> manifest :entity :entity_id) collection-entity-id resources)
           (external-dependency-problems resources)
           (mapcat missing-table-and-field-problems resources)))))))

(defn problems
  "The problems with the data app entity files `files` (`{:path :entity}`, every entity file under `data_apps/`:
  manifests and resources), each as `{:file :message}`. An app whose resource files have a problem can't be loaded
  as the author meant it, so an import that sees one fails naming the file."
  [files]
  (let [by-dir (group-by (fn [{:keys [path]}] (second (str/split path #"/"))) files)]
    (mapcat (fn [[dir dir-files]]
              (let [prefix    (str "data_apps/" dir "/")
                    manifest  (some #(when (= (:path %) (str prefix "data_app.yaml")) %) dir-files)
                    resources (for [{:keys [path] :as file} dir-files
                                    :when (str/starts-with? path (str prefix "resources/"))]
                                (assoc file :relative-path (subs path (count (str prefix "resources/")))))]
                (app-problems dir manifest resources)))
            by-dir)))
