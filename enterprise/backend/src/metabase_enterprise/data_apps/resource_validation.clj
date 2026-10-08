(ns metabase-enterprise.data-apps.resource-validation
  "What a data app's resources may hold. An app's resources are its collection, the one its `data_app.yaml` names as
  `collection`, and the cards and actions in it, all ordinary entity files under `collections/`. A load trusts what it
  reads: it updates whatever row carries an entity ID and resolves references to any local entity. These checks run
  on the ingested files first, so an app's resources can only be its own collection, in the `data-apps` namespace,
  and, in it, questions, metrics, and query actions that belong to no model, referencing nothing else of Metabase's
  but what already exists."
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

(defn- model-problems [{:keys [path model entity] :as file}]
  (case model
    "Collection"
    (concat
     (when (not= "data-apps" (some-> (:namespace entity) name))
       [(problem path (tru "{0} must be in the data-apps collection namespace." path))])
     (when (or (some entity [:parent_id :personal_owner_id :authority_level :type :archive_operation_id])
               (:is_remote_synced entity)
               (:is_sample entity)
               (:archived entity))
       [(problem path (tru "{0} must be a root collection that is not remote-synced or archived." path))]))

    "Card"
    (concat
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
  (let [numeric?  (volatile! false)
        ;; a card as a source table, in the older form
        card-ref? (fn [x] (and (string? x) (re-matches #"card__\d+" x)))]
    (walk/postwalk (fn [x]
                     (when (or (and (map? x)
                                    (or (some #(integer? (get x %))
                                              [:source-card :source-table :card-id :snippet-id :table-id :source-field :database])
                                        (card-ref? (:source-table x))))
                               (and (vector? x)
                                    (or (string? (first x)) (keyword? (first x)))
                                    (contains? #{"field" "metric" "segment" "measure"} (name (first x)))
                                    (some integer? (rest x))))
                       (vreset! numeric? true))
                     x)
                   (select-keys entity [:dataset_query :query]))
    (when @numeric?
      [(problem path (tru "{0} must not reference a card, table, field, snippet or database by numeric ID." path))])))

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
                           (as-> database-id (models.db/table-id-by-name table-name schema database-id))
                           ;; an inactive table is one that sync no longer finds, or a placeholder
                           (as-> id (when (data-apps.db/active-table? id) id))))]
    (for [[kind [db-name schema table-name & field-names :as ref]] (sort-by second (portable-refs (:entity file)))
          :when (or (nil? (table-id [db-name schema table-name]))
                    (and (= kind :field)
                         (nil? (models.db/field-pk-in-path (table-id [db-name schema table-name]) (reverse field-names)))))]
      (problem path (tru "{0} references {1} {2}, which does not exist on this instance."
                         path (if (= kind :table) "table" "field") (pr-str ref))))))

(defn- inactive-field-warnings
  "A field that exists but is inactive is one that sync no longer finds, and the app's query would run against a
  column that is gone. One column isn't the app, so the file loads and the pull logs the field, rather than refusing
  the repository until the file changes, as it does for a table."
  [{:keys [path] :as file}]
  (for [[kind [db-name schema table-name & field-names :as ref]] (sort-by second (portable-refs (:entity file)))
        :when (= kind :field)
        :let  [field-id (some-> (models.db/database-id-by-name db-name)
                                (as-> database-id (models.db/table-id-by-name table-name schema database-id))
                                (models.db/field-pk-in-path (reverse field-names)))]
        :when (and field-id (not (data-apps.db/active-field? field-id)))]
    (problem path (tru "{0} references field {1}, which is inactive on this instance." path (pr-str ref)))))

(defn- ownership-problems
  "Serdes would update any row carrying an entity ID a file names, so a file may only name what this app owns:
  the collection its manifest names, if it exists, must be the collection the app has, or one of the namespace that
  no app owns, and existing cards and actions must be in it."
  [app-entity-id manifest-path collection-entity-id resources]
  (let [app               (data-apps.db/data-app-by-entity-id app-entity-id)
        app-collection-id (:resource_collection_id app)
        collections       (data-apps.db/collections-by-entity-ids [collection-entity-id])
        ;; a collection on the instance that no app owns, or this app owns, may be the app's; another app's may not
        owned?            (fn [collection-id]
                            (or (= app-collection-id collection-id)
                                (not (data-apps.db/resource-collection-owned? collection-id))))
        ;; a collection of the namespace that no app owns is the app's to claim with what it holds: what an earlier
        ;; pull loaded into it before the app itself failed to load
        claimable-id      (when (nil? app-collection-id)
                            (some (fn [{:keys [id] collection-namespace :namespace}]
                                    (when (and (= :data-apps (keyword collection-namespace))
                                               (not (data-apps.db/resource-collection-owned? id)))
                                      id))
                                  collections))
        in-collection?    (fn [collection-id]
                            (or (and (some? app-collection-id) (= app-collection-id collection-id))
                                (and (some? claimable-id) (= claimable-id collection-id))))
        entity-ids-of     (fn [model]
                            (into [] (comp (filter (comp #{model} :model)) (map (comp :entity_id :entity))) resources))
        file-of           (fn [model entity-id]
                            (some #(when (and (= model (:model %)) (= entity-id (:entity_id (:entity %)))) (:path %))
                                  resources))]
    (concat
     ;; the app's hooks refuse a change of collection, but only after the load has moved what it reached first
     (when (and (some? app-collection-id) (not-any? #(= app-collection-id (:id %)) collections))
       [(problem manifest-path
                 (tru "{0} names collection {1}, but the app already has a collection, and a data app''s collection cannot be changed."
                      manifest-path collection-entity-id))])
     (for [{:keys [id entity_id] collection-namespace :namespace} collections
           :let  [message (cond
                            (not= :data-apps (keyword collection-namespace))
                            (tru "Collection {0} already exists outside the data-apps namespace, so it can''t become a data app''s collection. Give the app a collection of its own: a new entity ID in data_app.yaml and in the collection''s file."
                                 entity_id)

                            (not (owned? id))
                            (tru "Collection {0} already exists and is another data app''s collection. Give the app a collection of its own: a new entity ID in data_app.yaml and in the collection''s file."
                                 entity_id))]
           :when message]
       (problem (or (file-of "Collection" entity_id) manifest-path) message))
     (for [[model rows] [["Card"   (data-apps.db/cards-by-entity-ids (entity-ids-of "Card"))]
                         ["Action" (data-apps.db/actions-by-entity-ids (entity-ids-of "Action"))]]
           {:keys [entity_id collection_id]} rows
           :when (not (in-collection? collection_id))]
       (problem (file-of model entity_id)
                (tru "{0} {1} already exists outside this data app''s collection, so the app can''t load it. Move it back if it belongs to this app."
                     model entity_id))))))

(defn- model-of [entity]
  (:model (last (:serdes/meta entity))))

(defn- app-resources
  "Among `files`, the collection with `collection-entity-id` and the cards and actions in it, each with its `:model`."
  [collection-entity-id files]
  (for [{:keys [entity] :as file} files
        :let  [model (model-of entity)]
        :when (or (and (= "Collection" model) (= collection-entity-id (:entity_id entity)))
                  (and (contains? #{"Card" "Action"} model)
                       (= collection-entity-id (:collection_id entity))))]
    (assoc file :model model)))

(defn- app-problems
  "The problems of one app: its manifest file, and among `files` its collection and the cards and actions in it."
  [defined manifest files]
  (let [manifest-problems    (identity-problems (assoc manifest :model "DataApp"))
        collection-entity-id (-> manifest :entity :collection)
        app-entity-id        (-> manifest :entity :entity_id)
        resources            (app-resources collection-entity-id files)
        collection-files     (filter (comp #{"Collection"} :model) resources)]
    (cond
      (seq manifest-problems)
      manifest-problems

      (nil? collection-entity-id)
      [(problem (:path manifest) (tru "{0} must name the app''s resource collection as `collection`." (:path manifest)))]

      (empty? collection-files)
      [(problem (:path manifest)
                (tru "The collection {0} that {1} names is not in the repository. Write it under collections/data_apps/ and commit it."
                     collection-entity-id (:path manifest)))]

      :else
      (let [cards           (filter (comp #{"Card"} :model) resources)
            card-entity-ids (into #{} (map (comp :entity_id :entity)) cards)
            structural      (concat (duplicate-problems resources)
                                    (mapcat identity-problems resources))]
        (if (seq structural)
          structural
          (concat
           (mapcat model-problems resources)
           (mapcat numeric-reference-problems resources)
           (mapcat (partial dependency-problems collection-entity-id card-entity-ids) resources)
           (ownership-problems app-entity-id (:path manifest) collection-entity-id resources)
           (external-dependency-problems defined resources)
           (mapcat missing-table-and-field-problems resources)))))))

(defn- shared-collection-problems
  "Two apps can't name one collection: only one of them would own it."
  [manifests]
  (for [[collection-entity-id named-by] (group-by (comp :collection :entity) manifests)
        :when (and collection-entity-id (< 1 (count named-by)))
        {:keys [path]} named-by]
    (problem path (tru "{0} names collection {1}, which another data app also names." path collection-entity-id))))

(defn- shared-resource-problems
  "Two apps can't define one card or action: a load would give it to whichever file loads last."
  [manifests files]
  (let [resources (for [{:keys [entity path]} manifests
                        resource (app-resources (:collection entity) files)]
                    (assoc resource :manifest path))]
    (for [[[model entity-id] defined-by] (group-by (juxt :model (comp :entity_id :entity)) resources)
          :when (< 1 (count (into #{} (map :manifest) defined-by)))
          {:keys [path]} defined-by]
      (problem path (tru "{0} {1} is defined by more than one data app: {2}." model entity-id (str/join ", " (map :path defined-by)))))))

(defn- shared-entity-id-problems
  "Two manifests can't carry one entity ID: a load keeps one app, and the other's collection is left with no owner."
  [manifests]
  (for [[entity-id carried-by] (group-by (comp :entity_id :entity) manifests)
        :when (and entity-id (< 1 (count carried-by)))
        {:keys [path]} carried-by]
    (problem path (tru "{0} has the entity ID {1}, which another data app also has." path entity-id))))

(defn- shared-slug-problems
  "Two manifests can't carry one slug: a load keeps the first app and refuses the second after it has started."
  [manifests]
  (for [[slug carried-by] (group-by (comp :slug :entity) manifests)
        :when (and slug (< 1 (count carried-by)))
        {:keys [path]} carried-by]
    (problem path (tru "{0} has the slug {1}, which another data app also has." path slug))))

(defn- child-collection-problems
  "A data app's collection holds no collections, and a load would refuse one only after it had started."
  [manifests files]
  (let [app-collections (into #{} (keep (comp :collection :entity)) manifests)]
    (for [{:keys [path entity]} files
          :when (and (= "Collection" (model-of entity)) (contains? app-collections (:parent_id entity)))]
      (problem path (tru "{0} is a collection inside a data app''s collection, which can''t hold one." path)))))

(defn- other-content-problems
  "A data app's collection holds cards and actions only, and a load would refuse anything else only after it had
  started. A collection's own file is not its content, whatever `collection_id` it carries."
  [manifests files]
  (let [app-collections (into #{} (keep (comp :collection :entity)) manifests)]
    (for [{:keys [path entity]} files
          :when (and (contains? app-collections (:collection_id entity))
                     (not (contains? #{"Card" "Action" "Collection"} (model-of entity))))]
      (problem path (tru "{0} is in a data app''s collection, which holds only questions, metrics and query actions." path)))))

(defn- defined-dependencies
  "The `[model entity-id]` of each snippet, segment and measure that `files` load: a resource that names one counts
  it as present, since the same pull brings it."
  [files]
  (into #{}
        (comp (map (comp (juxt :model :id) last :serdes/meta :entity))
              (filter (comp #{"NativeQuerySnippet" "Segment" "Measure"} first)))
        files))

(defn- manifests-among
  "The manifest files among `files`: the entities that say they are a DataApp, and the files at a manifest's path too,
  as one that doesn't say what it is would be skipped by the load, and the app deleted as no longer in the repository."
  [files]
  (filter #(or (= "DataApp" (model-of (:entity %)))
               (re-matches #"data_apps/[^/]+/data_app\.yaml" (:path %)))
          files))

(defn warnings
  "What a pull logs about the data apps among the entity files `files` (see [[problems]]), each as `{:file :message}`:
  what loads, but may not run as the author meant it."
  [files]
  (for [{:keys [entity]} (manifests-among files)
        resource         (app-resources (:collection entity) files)
        warning          (inactive-field-warnings resource)]
    warning))

(defn problems
  "The problems with the data apps among the entity files `files` (`{:path :entity}`, every entity file of the
  snapshot), each as `{:file :message}`. An app whose resources have a problem can't be loaded as the author meant
  it, so an import that sees one fails naming the file."
  [files]
  (let [manifests (manifests-among files)
        defined   (defined-dependencies files)]
    (concat
     (shared-entity-id-problems manifests)
     (shared-slug-problems manifests)
     (shared-collection-problems manifests)
     (shared-resource-problems manifests files)
     (child-collection-problems manifests files)
     (other-content-problems manifests files)
     (mapcat #(app-problems defined % files) manifests))))
