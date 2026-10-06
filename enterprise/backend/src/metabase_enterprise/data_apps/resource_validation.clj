(ns metabase-enterprise.data-apps.resource-validation
  "What a data app's resource files may hold. Serialization loads them like any other entity files (see
  `metabase-enterprise.serialization.v2.ingest/shared-top-level-paths`), and a load trusts what it reads: it updates
  whatever row carries an entity ID and resolves references to any local entity. These checks run on the ingested
  files first, so an app's `resources/` can only define its own collection and, in it, questions, metrics, and query
  actions that belong to no model, referencing nothing else of Metabase's but what already exists."
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

(def ^:private card-types #{"question" "metric"})

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
  "Serdes loads an action's implicit and query rows whatever its type, so a query action's file must carry exactly
  its query row."
  [{:keys [path entity]}]
  (let [counts (update-vals (select-keys entity [:implicit :query]) count)]
    (when (not= {:query 1} (into {} (remove (comp zero? val)) counts))
      [(problem path (tru "{0} must carry exactly one query, and no implicit action." path))])))

(defn- parameter-source-problems
  "An action's parameters can take their values from a card, which its dependencies don't include."
  [{:keys [path entity]}]
  (when (some (comp :card_id :values_source_config) (:parameters entity))
    [(problem path (tru "{0} must not take parameter values from a card." path))]))

(defn- model-problems [collection-entity-id {:keys [path model entity] :as file}]
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
       [(problem path (tru "{0} must be a question or metric." path))])
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
     ;; a data app runs only query actions that belong to no model, the ones the typed schema lists
     (when (not= "query" (type-name entity))
       [(problem path (tru "{0} must be a query action." path))])
     (when (some? (:model_id entity))
       [(problem path (tru "{0} must belong to no model." path))])
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

(defn- numeric-reference-problems
  "A serialized query names cards, tables, fields and snippets by entity ID or by path. A numeric ID names a row on one
  instance only, and the dependency checks, which read entity IDs, don't see it."
  [{:keys [path entity]}]
  (let [numeric? (volatile! false)]
    (walk/postwalk (fn [x]
                     (when (or (and (map? x)
                                    (some #(integer? (get x %)) [:source-card :source-table :card-id :snippet-id :table-id]))
                               (and (vector? x)
                                    (or (string? (first x)) (keyword? (first x)))
                                    (contains? #{"field" "metric" "segment" "measure"} (name (first x)))
                                    (some integer? (rest x))))
                       (vreset! numeric? true))
                     x)
                   (select-keys entity [:dataset_query :query]))
    (when @numeric?
      [(problem path (tru "{0} must not reference a card, table, field or snippet by numeric ID." path))])))

(defn- duplicate-problems [resources]
  (for [[[model entity-id] files] (group-by (juxt :model (comp :entity_id :entity)) resources)
        :when (< 1 (count files))]
    (problem (:path (first files))
             (tru "{0} {1} is defined by more than one file: {2}." model entity-id (str/join ", " (map :path files))))))

(defn- external-dependency-problems
  "`defined` holds the `[model entity-id]` of each dependency that the same pull loads from outside `data_apps/`."
  [defined resources]
  (for [{:keys [path] :as file} resources
        dependency (first (dependencies file))
        :let [{:keys [model id]} (leaf dependency)]
        :when (and (contains? external-dependency-models model)
                   (not (contains? defined [model id]))
                   (nil? (serdes/load-find-local dependency)))]
    (problem path (tru "{0} references {1} {2}, which does not exist on this instance." path model id))))

(defn- portable-refs
  "The portable table references (`[db schema table]`) and field references (`[db schema table field ...]`) that
  `entity` makes, in each place where serialization reads one: a query's source table, a field clause in either form,
  the source field of a field clause, a table template tag, and a column of the result metadata."
  [entity]
  (let [refs   (volatile! #{})
        names? (fn [x] (and (vector? x) (string? (first x)) (every? #(or (nil? %) (string? %)) x)))
        table? (fn [x] (and (names? x) (= 3 (count x))))
        field? (fn [x] (and (names? x) (< 3 (count x))))
        add!   (fn [kind x] (vswap! refs conj [kind x]))]
    (walk/postwalk (fn [x]
                     (cond
                       (map? x)
                       (do
                         (doseq [k [:source-table :table-id :table_id]
                                 :when (table? (get x k))]
                           (add! :table (get x k)))
                         (when (field? (:source-field x))
                           (add! :field (:source-field x)))
                         ;; a column of the result metadata names its field as `:id`
                         (when (and (contains? x :base_type) (field? (:id x)))
                           (add! :field (:id x))))

                       (and (vector? x) (#{"field" :field} (first x)))
                       (doseq [part (rest x)
                               :when (field? part)]
                         (add! :field part)))
                     x)
                   (select-keys entity [:dataset_query :query :parameter_mappings :result_metadata]))
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
  [defined dir manifest resources]
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

      (and (empty? resources) (nil? collection-entity-id))
      (map #(problem (:path %) (tru "{0} is not a data app resource." (:path %))) unknown)

      (nil? manifest)
      [(problem (:path (first resources)) (tru "data_apps/{0}/resources needs a data_app.yaml beside it." dir))]

      (nil? collection-entity-id)
      [(problem (:path manifest) (tru "{0} must name the app''s resource collection as `collection`." (:path manifest)))]

      :else
      (let [cards            (filter (comp #{"Card"} :model) resources)
            card-entity-ids  (into #{} (map (comp :entity_id :entity)) cards)
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
           (mapcat (partial model-problems collection-entity-id) resources)
           (mapcat numeric-reference-problems resources)
           (mapcat (partial dependency-problems collection-entity-id card-entity-ids) resources)
           (ownership-problems (-> manifest :entity :entity_id) collection-entity-id resources)
           (external-dependency-problems defined resources)
           (mapcat missing-table-and-field-problems resources)))))))

(defn- shared-collection-problems
  "Two apps can't name one collection: only one of them would own it."
  [files]
  (for [[collection-entity-id manifests] (group-by (comp :collection :entity)
                                                   (filter #(re-matches #"data_apps/[^/]+/data_app\.yaml" (:path %)) files))
        :when (and collection-entity-id (< 1 (count manifests)))
        {:keys [path]} manifests]
    (problem path (tru "{0} names collection {1}, which another data app also names." path collection-entity-id))))

(defn- cross-app-duplicate-problems
  "Two apps can't define one card or action: the second file loaded would take it from the first app."
  [files]
  (for [[[model entity-id] dups] (group-by (fn [{:keys [entity]}] ((juxt :model :id) (last (:serdes/meta entity))))
                                           (filter #(re-find #"^data_apps/[^/]+/resources/" (:path %)) files))
        :when (and entity-id (< 1 (count (distinct (map #(second (str/split (:path %) #"/")) dups)))))]
    (problem (:path (first dups))
             (tru "{0} {1} is defined by more than one data app: {2}." model entity-id (str/join ", " (sort (map :path dups)))))))

(defn problems
  "The problems with the data app entity files `files` (`{:path :entity}`, every entity file under `data_apps/`:
  manifests and resources), each as `{:file :message}`. An app whose resource files have a problem can't be loaded
  as the author meant it, so an import that sees one fails naming the file. `defined` holds the `[model entity-id]`
  of each snippet, segment and measure that the same import loads from outside `data_apps/`."
  [files & [defined]]
  (let [defined (or defined #{})
        by-dir  (group-by (fn [{:keys [path]}] (second (str/split path #"/"))) files)]
    (concat
     (shared-collection-problems files)
     (cross-app-duplicate-problems files)
     (mapcat (fn [[dir dir-files]]
               (let [prefix    (str "data_apps/" dir "/")
                     manifest  (some #(when (= (:path %) (str prefix "data_app.yaml")) %) dir-files)
                     resources (for [{:keys [path] :as file} dir-files
                                     :when (str/starts-with? path (str prefix "resources/"))]
                                 (assoc file :relative-path (subs path (count (str prefix "resources/")))))]
                 (app-problems defined dir manifest resources)))
             by-dir))))
