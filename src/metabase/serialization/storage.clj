(ns metabase.serialization.storage
  "Where entities are stored, and how an entity file gets its path back.

  [[storage-paths]] gives the directories and file name of an entity, as label/key maps; storage turns them
  into file names. [[resource-paths]] names the files stored next to an entity's file."
  (:require
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase.serialization.protocol :as protocol]
   [metabase.serialization.protocol.app-db :as protocol.app-db]))

(set! *warn-on-reflection* true)

(defn storable
  "`entity` as its file stores it, without the `:serdes/meta` of the entities nested in it."
  [entity]
  (let [model (-> entity :serdes/meta last :model)]
    (-> (walk/postwalk #(cond-> % (map? %) (dissoc :serdes/meta)) entity)
        (assoc :serdes/meta [{:model model}]))))

(defmulti resource-paths
  "Paths of the `:serdes/resources` stored next to an entity's YAML file, relative to its directory."
  {:arglists '([entity])}
  (fn [entity] (some->> entity :serdes/meta last :model (keyword "model"))))

(defmethod resource-paths :default [_]
  nil)

(defn collection-namespace-folder
  "The folder under `collections/` that holds the collections of `collection-namespace`, `main` for the default one.
  A dashed namespace is spelled with an underscore, like the top-level `data_apps` directory of the apps themselves."
  [collection-namespace]
  (case (some-> collection-namespace keyword)
    :snippets     "snippets"
    :transforms   "transforms"
    :data-actions "data_actions"
    :data-apps    "data_apps"
    "main"))

(defn storage-default-collection-path
  "Implements the most common structure for [[storage-paths]].
  Returns a vector of maps with `:label` and `:key` for each path segment.
  Result: `[{:label \"collections\"} {:label ns-folder} <collection-hierarchy> {:label entity-name :key entity_id}]`.
  The folder is the one of the entity's collection's namespace when it has a collection, `ns-folder` otherwise."
  ([entity ctx]
   (storage-default-collection-path entity ctx "main"))
  ([entity {:keys [collections collection-namespace-folders]} ns-folder]
   (into [{:label "collections"} {:label (get collection-namespace-folders (:collection_id entity) ns-folder)}]
         cat [(get collections (:collection_id entity))
              [{:label (:name entity) :key (:entity_id entity)}]])))

(defmulti storage-paths
  "The storage path of each of `entities`, entities of `model`, with `ctx` the context of their batch (see
  [[batch-storage-paths]]): a vector of maps with `:label` and optional `:key`, `:style` and `:suffix` for each path
  segment. `:label` is the human-readable name; `:key` is a deduplication identity (entity_id, name, or nil); `:style`
  is `:name` (the default) for a label that is slugified into a file name, or `:slug` for a label that is already a
  slug safe to use as a file name as is; `:suffix` is appended to the file name after the label is slugified and
  truncated."
  {:arglists '([model entities ctx])}
  (fn [model _entities _ctx] model))

(defmethod storage-paths :default [_ entities ctx]
  (mapv #(storage-default-collection-path % ctx) entities))

(defn- by-entity-ids
  "The `columns` of the `model` rows of the app DB with the entity ids `eids`."
  [model eids columns]
  (vals (protocol/select-by-refs protocol.app-db/store model (set eids) columns)))

(defn- collection-paths
  "The map from entity id to the `{:label :key}` path of each Collection with an entity id in `eids`, root first."
  [eids]
  (let [colls     (by-entity-ids :model/Collection eids [:id :entity_id :location :name])
        ancestors (into {}
                        (map (juxt :id identity))
                        (protocol/select-by-pks
                         protocol.app-db/store
                         :model/Collection
                         (into #{} (comp (mapcat #(rest (str/split (:location %) #"/"))) (map parse-long)) colls)
                         [:id :entity_id :name]))
        segment   (fn [{:keys [name entity_id]}] {:label name :key entity_id})]
    (into {}
          (for [{:keys [entity_id location] :as coll} colls]
            [entity_id (conj (mapv #(segment (get ancestors (parse-long %))) (rest (str/split location #"/")))
                             (segment coll))]))))

(defn- storage-context
  "The context [[storage-paths]] stores `entities` in, for what they name: `:collections` maps the entity id of each
  of their Collections to the `{:label :key}` path of its hierarchy, `:collection-namespace-folders` to the folder
  of its namespace (see [[collection-namespace-folder]]), and `:dashboards` and `:documents` map the entity id of
  each of their Dashboards and Documents to its `{:label :key}`, for the cards they hold."
  [entities]
  (let [coll-eids (into [] (comp (mapcat (fn [{:keys [collection_id entity_id] :as entity}]
                                           [collection_id
                                            (when (= "Collection" (-> entity :serdes/meta last :model)) entity_id)]))
                                 (filter string?)
                                 (distinct))
                        entities)
        eids-of   (fn [k] (into [] (comp (keep k) (filter string?) (distinct)) entities))
        labels    (fn [rows]
                    (into {} (map (fn [{:keys [entity_id name]}] [entity_id {:label name :key entity_id}])) rows))]
    {:collections                  (if (seq coll-eids) (collection-paths coll-eids) {})
     :collection-namespace-folders (into {}
                                         (map (juxt :entity_id (comp collection-namespace-folder :namespace)))
                                         (by-entity-ids :model/Collection coll-eids [:entity_id :namespace]))
     :dashboards                   (labels (by-entity-ids :model/Dashboard (eids-of :dashboard_id) [:entity_id :name]))
     :documents                    (labels (by-entity-ids :model/Document (eids-of :document_id) [:entity_id :name]))}))

(defn batch-storage-paths
  "The storage path of each of `entities`, entities of any models (see [[storage-paths]]), with what they
  name loaded in bulk."
  [entities]
  (let [ctx     (storage-context entities)
        model   #(some->> % :serdes/meta last :model (keyword "model"))
        indexed (map-indexed vector entities)
        paths   (into {}
                      (mapcat (fn [[m group]]
                                (map (fn [[i _] path] [i path])
                                     group
                                     (storage-paths m (mapv second group) ctx))))
                      (group-by (comp model second) indexed))]
    (mapv paths (range (count entities)))))

(defn storage-path-prefixes
  "The directories of the Table or Field with the `[db-name schema table-name & field-names]` reference `ref`, for
  the [[storage-paths]] of what the data model stores under them, like
  `[{:label \"databases\"} {:label \"db\" :key \"db\"} {:label \"schemas\"} {:label \"public\" :key \"public\"}
  {:label \"tables\"} {:label \"orders\" :key \"orders\"}]`, without the schema directories for a nil schema."
  [[db-name schema table-name & field-names]]
  (into [{:label "databases"} {:label db-name :key db-name}]
        cat
        [(when schema [{:label "schemas"} {:label schema :key schema}])
         [{:label "tables"} {:label table-name :key table-name}]
         (mapcat (fn [field-name] [{:label "fields"} {:label field-name :key field-name}]) field-names)]))
