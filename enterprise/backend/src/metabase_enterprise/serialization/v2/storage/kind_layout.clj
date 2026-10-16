(ns metabase-enterprise.serialization.v2.storage.kind-layout
  "The kind layout of an export: each item is a file `<name>.<kind>.yaml`, each
  collection a folder `<name>/` with its own `collection.yaml`, and the items an item contains are in the folder
  `<name>.<kind>/` beside it. [[kind-layout]] is the layout function (see [[storage.util/storage-context]]); it needs a
  storage context with a `:layout-cache`, where it keeps what it reads from the app DB."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.serialization.db :as serialization.db]
   [metabase-enterprise.serialization.v2.storage.kind-folders :as kind-folders]
   [metabase-enterprise.serialization.v2.storage.util :as storage.util]
   [metabase.collections.core :as collections]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.core :as lib]
   [metabase.models.serialization :as serdes]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Open items ------------------------------------------------------
;;; Each open question of the layout's design that this layout needs is answered in one place below, each under a
;;; comment that names it (open items 1 to 10 of the design).

(def kind-words
  "The word of each kind of item, in its file name `<name>.<word>.yaml`."
  ;; Open item 1: the proposed list. `field`, `field_settings`, `dimension` and `field_values` are not in it: they
  ;; name the files a table has until one file holds a table and its field settings (its table settings are the file
  ;; `_table_settings.yaml` in the table's folder until then).
  {:table             "table"
   :segment           "segment"
   :measure           "measure"
   :metric            "metric"
   :question          "question"
   :model             "model"
   :dashboard         "dashboard"
   :document          "document"
   :timeline          "timeline"
   :term              "term"
   :snippet           "snippet"
   :action            "action"
   :transform         "transform"
   :transform-test    "transform_test"
   :transform-tag     "transform_tag"
   :transform-job     "transform_job"
   :database          "database"
   :metabot           "metabot"
   :channel           "channel"
   :embedding-theme   "embedding_theme"
   :custom-viz-plugin "custom_viz_plugin"
   :osi-ai-context    "osi_ai_context"
   :field             "field"
   :field-settings    "field_settings"
   :dimension         "dimension"
   :field-values      "field_values"})

(defn- python-library-file
  "The file stem of the Python library at `path` (`common.py`): the path itself, without a kind word."
  ;; Open item 2: the fixed file names stay exceptions to rule 1 (`common.py.yaml`; `data_app.yaml` comes from the
  ;; DataApp's own storage path; `settings.yaml` is not an entity file).
  [path]
  (storage.util/slugify-name path))

(def ^:private resource-collection-has-file?
  "Whether a data app's resource collection has its own file, `data_apps/<slug>/resources/collection.yaml`."
  ;; Open item 3: yes. The app's manifest names the collection by entity_id, and the import needs the collection's
  ;; file to create it before the app.
  true)

;; Open item 4 (the folder of another namespace): `collections/<namespace folder>/`, by
;; [[kind-folders/namespace-folder]] (see [[namespace-root-folder]]).

(defn- schema-folders
  "The folders of the schema `schema` inside its database's folder."
  ;; Open item 5: a table of a database without schemas is directly in the database's folder.
  [schema]
  (if (str/blank? schema) [] [schema]))

;; Open item 6 (field values in a serdes export), decided: one file per column, `<column>.field_values.yaml`, in the
;; table's folder `<table>.table/`.

(def ^:private library-section-folders
  "The top-level folder of each of the Library's section collections, which have no file of their own, by type."
  ;; Open item 8: the Library has no Documents collection yet, so nothing goes in `documents/`.
  {collections/library-data-collection-type       "data"
   collections/library-metrics-collection-type    "metrics"
   collections/library-dashboards-collection-type "dashboards"})

(def ^:private action-in-model-folder?
  "Whether an action on a model goes in the model's folder `<name>.model/`, rather than in the model's collection."
  ;; Open item 10: no; it stays in the model's collection, as in the default layout.
  false)

;;; ------------------------------------------------- Folders --------------------------------------------------------

(def ^:private legacy-root-folder
  "The folder of the default-namespace content outside the Library: the root collections and the items in no
  collection."
  ["collections" "main"])

(defn- namespace-root-folder
  "The folder of the root collections of the namespace `coll-ns` (a keyword, nil for the default namespace). Snippets,
  data actions and transforms have top-level folders; every other namespace has a folder under `collections/`."
  [coll-ns]
  (case coll-ns
    nil           legacy-root-folder
    :snippets     ["snippets"]
    :transforms   ["transforms"]
    :data-actions ["data_actions"]
    ["collections" (kind-folders/namespace-folder coll-ns)]))

;;; ------------------------------------------------- Context --------------------------------------------------------

(defn- cached
  "The value under `k` in the `:layout-cache` of `ctx`, computed by `(f)` the first time."
  [ctx k f]
  (let [cache (or (:layout-cache ctx)
                  (throw (ex-info "The kind layout needs a storage context with a :layout-cache" {})))]
    (if-let [[_ v] (find @cache k)]
      v
      (let [v (f)]
        (swap! cache assoc k v)
        v))))

(defn- collections-index [ctx]
  (cached ctx ::collections
          #(let [rows (serialization.db/layout-collections)]
             {:by-eid (u/index-by :entity_id rows)
              :by-id  (u/index-by :id rows)})))

(defn- collection-eid
  "The entity_id of the collection with id `id`, or nil."
  [ctx id]
  (get-in (collections-index ctx) [:by-id id :entity_id]))

(defn- data-app-slugs [ctx]
  (cached ctx ::data-app-slugs serialization.db/data-app-slugs-by-collection-id))

(declare rows)

(defn- containers
  "The `:entity_id`, `:name`, `:collection_id` (an entity_id) and `:created_at` of every instance of the kind `k` of
  [[row-queries]], by entity_id."
  [ctx k]
  (cached ctx [::containers k]
          #(u/index-by :entity_id
                       (map (fn [row] (-> row
                                          (select-keys [:entity_id :name :collection_id :created_at])
                                          (update :collection_id (partial collection-eid ctx))))
                            (rows ctx k)))))

(defn- published-tables
  "Each published Table's `:collection_id` (an entity_id) and `:created_at`, keyed by `[db-name schema table-name]`."
  [ctx]
  (cached ctx ::published-tables
          #(let [db-names (serialization.db/database-names-by-id)]
             (into {}
                   (for [{:keys [db_id schema collection_id] table-name :name :as row} (serialization.db/published-tables)
                         :when collection_id]
                     [[(db-names db_id) schema table-name]
                      (assoc row :collection_id (collection-eid ctx collection_id))])))))

;;; -------------------------------------------------- Names ---------------------------------------------------------

(defn- slug
  "The file or folder name of the label `s`: [[storage.util/slugify-name]], with `.` also turned into `_`, so that no
  name ends in
  `.<kind>` and a collection's folder cannot be taken for an item's `<name>.<kind>/` folder."
  [s]
  (str/replace (or (storage.util/slugify-name s) "") "." "_"))

(def ^:private row-queries
  "The app-DB query of the rows of each kind of item that the layout places by its container or numbers."
  {:cards           serialization.db/layout-cards
   :dashboards      serialization.db/layout-dashboards
   :documents       serialization.db/layout-documents
   :timelines       serialization.db/layout-timelines
   :snippets        serialization.db/layout-snippets
   :actions         serialization.db/layout-actions
   :transforms      serialization.db/layout-transforms
   :transform-tests serialization.db/layout-transform-tests
   :transform-tags  serialization.db/layout-transform-tags
   :transform-jobs  serialization.db/layout-transform-jobs
   :segments        serialization.db/layout-segments
   :measures        serialization.db/layout-measures
   :glossary        serialization.db/layout-glossary})

(defn- rows
  "The rows of the kind `k` of [[row-queries]], read once per storage context."
  [ctx k]
  (cached ctx [::rows k] (row-queries k)))

(defn- live-rows
  "A function of a storage context that gives the rows of the kind `k` that are not archived."
  [k]
  (fn [ctx] (remove :archived (rows ctx k))))

(defn- numbered-collections
  "The collections whose folders the layout numbers on a name clash: not archived, and not the Trash, a personal
  collection or the Library, which have no folder among the others."
  [ctx]
  (remove (fn [{:keys [archived personal_owner_id] coll-type :type}]
            (or archived
                personal_owner_id
                (contains? #{collections.schema/trash-collection-type collections/library-collection-type} coll-type)))
          (vals (:by-eid (collections-index ctx)))))

(def ^:private rank-specs
  "How to number the items of each kind that share a name in a folder: `:rows` reads every instance (a function of the
  storage context), `:group` gives the folder an instance is in, as the app DB says it. `:id` (default `:entity_id`)
  and `:label` (default `:name`) read the instance's identity and name."
  (let [by-collection {:group :collection_id}
        card          {:rows  (live-rows :cards)
                       :group (fn [{:keys [collection_id dashboard_id document_id] card-type :type}]
                                (cond
                                  dashboard_id [:dashboard dashboard_id]
                                  document_id  [:document document_id]
                                  :else        [:collection collection_id (keyword card-type)]))}]
    {:collection     {:rows  numbered-collections
                      :group (juxt :location :namespace)}
     :question       card
     :model          card
     :metric         card
     :dashboard      (assoc by-collection :rows (live-rows :dashboards))
     :document       (assoc by-collection :rows (live-rows :documents))
     :timeline       (assoc by-collection :rows (live-rows :timelines))
     :snippet        (assoc by-collection :rows (live-rows :snippets))
     :transform      (assoc by-collection :rows (live-rows :transforms))
     :action         {:rows  (live-rows :actions)
                      ;; with no collection, an action on a model is in collections/, one on no model in data_actions/
                      :group (fn [{:keys [collection_id model_id]}]
                               [collection_id (and (nil? collection_id) (some? model_id))])}
     :transform-test {:rows (live-rows :transform-tests) :group :transform_id}
     :transform-tag  {:rows (live-rows :transform-tags) :group (constantly nil)}
     :transform-job  {:rows (live-rows :transform-jobs) :group (constantly nil)}
     :segment        {:rows (live-rows :segments) :group :table_id}
     :measure        {:rows (live-rows :measures) :group :table_id}
     :term           {:rows  (live-rows :glossary)
                      :group (constantly nil)
                      :label :term}
     :table          {:rows  (fn [ctx] (for [[ref row] (published-tables ctx)] (assoc row :ref ref)))
                      :group :collection_id
                      :id    :ref}}))

(defn- rank-index
  "For the kind `kind`: `:key-of`, each instance's `[group slug]` by identity, and `:order`, the identities of the
  instances with each `[group slug]` in creation order (`created_at`, then identity)."
  [ctx kind]
  (let [{:keys [rows group id label] :or {id :entity_id label :name}} (rank-specs kind)]
    ;; the card kinds (question, model, metric) share one spec, and so one index
    (cached ctx [::ranks (if (#{:question :model :metric} kind) :card kind)]
            #(let [keyed (for [row (rows ctx)]
                           {:id         (id row)
                            :key        [(group row) (slug (get row label))]
                            :created-at (:created_at row)})]
               {:key-of (into {} (map (juxt :id :key)) keyed)
                :order  (update-vals (group-by :key keyed)
                                     (fn [items] (mapv :id (sort-by (juxt :created-at (comp str :id)) items))))}))))

(defn- ranked-slug
  "The slug of `label` for the item of `kind` with identity `id`, with `_2`, `_3` when it is the second, third item of
  its kind with that slug in its folder, in creation order. The app DB says which items share the folder, so every
  export numbers an item the same way whatever it exports and in what order. An item the app DB does not list (such
  as an archived one) gets no number."
  [ctx kind id label]
  (let [base (slug label)]
    (if-let [{:keys [key-of order]} (when (rank-specs kind) (rank-index ctx kind))]
      (let [^java.util.List ids (some-> (key-of id) order)
            position            (if ids (.indexOf ids id) -1)]
        (if (pos? position)
          (str base "_" (inc position))
          base))
      base)))

(defn- unique-stem
  "The name, unique among the items of `kind` in `folder`, of the item with identity `key` and label `label`: its
  [[ranked-slug]], with a further number only when that name is already taken (an item named `Orders 2` beside two
  named `Orders`)."
  [ctx folder kind key label]
  (let [gen (cached ctx [::names folder kind] lib/non-truncating-unique-name-generator)]
    (gen key (ranked-slug ctx kind key label))))

(defn- item-file
  "`folder` with the file stem `<name>.<kind>` of the item with dedup key `key` and label `label` appended."
  [ctx folder kind key label]
  (conj (vec folder) (str (unique-stem ctx folder kind key label) "." (kind-words kind))))

;;; ------------------------------------------------ Collections -----------------------------------------------------

(defn- parent-id
  "The id of the parent of a collection at `location`, or nil for a root collection."
  [location]
  (some-> (re-seq #"\d+" (str location)) last parse-long))

(defn- library-section-folder
  "The top-level folder of `coll` when it is one of the Library's section collections, else nil."
  [ctx coll]
  (when-let [parent (get-in (collections-index ctx) [:by-id (parent-id (:location coll))])]
    (when (= collections/library-collection-type (:type parent))
      (library-section-folders (:type coll)))))

(defn- library-root? [coll]
  (= collections/library-collection-type (:type coll)))

(defn- collection-folder
  "The folder (a vector of strings) that the collection with entity_id `eid` stands for, where its contents go; nil
  when there is no such collection."
  [ctx eid]
  (when-let [{coll-ns :namespace :as coll} (get-in (collections-index ctx) [:by-eid eid])]
    (let [coll-ns (some-> coll-ns keyword)
          parent  (get-in (collections-index ctx) [:by-id (parent-id (:location coll))])]
      (if-let [section (library-section-folder ctx coll)]
        [section]
        (let [parent-folder (cond
                              parent
                              (collection-folder ctx (:entity_id parent))

                              (= collections/data-apps-ns coll-ns)
                              nil

                              :else
                              (namespace-root-folder coll-ns))]
          (if (and (nil? parent) (= collections/data-apps-ns coll-ns))
            ;; a data app's resource collection is the resources/ folder in the app's folder, which is named by the
            ;; slug as is, like the app's own path
            ["data_apps" (or (get (data-app-slugs ctx) (:id coll)) (slug (:name coll))) "resources"]
            (conj parent-folder (unique-stem ctx parent-folder :collection eid (:name coll)))))))))

(defn- collection-file
  "The resolved path of the file of the collection with entity_id `eid`, or nil when it has no file: the Library and
  its section collections stand for themselves by their folders."
  [ctx eid]
  (let [coll (get-in (collections-index ctx) [:by-eid eid])]
    (when-not (or (library-root? coll)
                  (library-section-folder ctx coll)
                  (and (not resource-collection-has-file?)
                       (= collections/data-apps-ns (some-> (:namespace coll) keyword))
                       (nil? (parent-id (:location coll)))))
      (conj (collection-folder ctx eid) "collection"))))

(defn- item-folder
  "The folder of an item in the collection with entity_id `coll-eid`, or `root-folder` when it has none."
  [ctx coll-eid root-folder]
  (or (some->> coll-eid (collection-folder ctx))
      root-folder))

;;; ------------------------------------------------- Tables ---------------------------------------------------------

(defn- table-ref
  "The `[db schema table]` names of the table in the serdes `path` (a table's, or a descendant's)."
  [path]
  (let [by-model (into {} (map (juxt :model :id)) (take-while #(not= "Field" (:model %)) path))]
    [(get by-model "Database") (get by-model "Schema") (get by-model "Table")]))

(defn- database-folder [ctx db-name]
  ["databases" (unique-stem ctx ["databases"] :database db-name db-name)])

(defn- table-path
  "The resolved path of the file of the table `[db schema table]`, whose folder holds what it contains: in the
  folder of its collection when it is published, else in its database's folder."
  [ctx [db-name schema table-name :as ref]]
  (let [published (get (published-tables ctx) ref)
        folder    (if published
                    (item-folder ctx (:collection_id published) ["data"])
                    (into (database-folder ctx db-name) (map slug) (schema-folders schema)))]
    (item-file ctx folder :table ref table-name)))

(defn- field-names
  "The names of the fields in the serdes `path`, from the outermost."
  [path]
  (into [] (comp (filter #(= "Field" (:model %))) (map :id)) path))

(defn- field-file
  "The resolved path of the file of `kind` for the field in the serdes `path`, in its table's `fields/` folder."
  [ctx path kind]
  (let [names  (field-names path)
        folder (-> (table-path ctx (table-ref path))
                   (conj "fields")
                   (into (map slug) (butlast names)))]
    (item-file ctx folder kind names (last names))))

;;; ------------------------------------------------- Layout ---------------------------------------------------------

(defn- model-of [entity]
  (-> entity :serdes/meta last :model))

(defmulti ^:private item-path
  "The resolved path of the file of the extracted `entity` in the kind layout, or nil when it has no file."
  {:arglists '([ctx entity])}
  (fn [_ctx entity] (model-of entity)))

(defmethod item-path :default [ctx entity]
  (storage.util/default-layout ctx entity))

(defn- serdes-only-path
  "The [[serdes/storage-path]] of `entity`, its file name followed by the word of `kind`."
  [ctx entity kind]
  (let [segments (vec (serdes/storage-path entity ctx))]
    (storage.util/resolve-segments ctx (update segments (dec (count segments))
                                               assoc :suffix (str "." (kind-words kind))))))

(doseq [[model kind] {"Metabot"         :metabot
                      "Channel"         :channel
                      "EmbeddingTheme"  :embedding-theme
                      "CustomVizPlugin" :custom-viz-plugin
                      "OsiAiContext"    :osi-ai-context}]
  (defmethod item-path model [ctx entity]
    (serdes-only-path ctx entity kind)))

(defmethod item-path "Collection" [ctx {:keys [entity_id]}]
  (collection-file ctx entity_id))

(defn- contained-folder
  "The folder of the items the instance of the kind `k` of [[row-queries]] (of the serdes model `model-name`) with
  entity_id `eid` contains, or nil when there is none."
  [ctx k model-name eid]
  (when-let [{:keys [collection_id] :as row} (get (containers ctx k) eid)]
    (item-path ctx (assoc row :serdes/meta [{:model model-name :id eid}] :collection_id collection_id))))

(defmethod item-path "Card" [ctx {:keys [collection_id dashboard_id document_id] card-type :type :as card}]
  (let [folder (or (some->> dashboard_id (contained-folder ctx :dashboards "Dashboard"))
                   (some->> document_id (contained-folder ctx :documents "Document"))
                   (item-folder ctx collection_id legacy-root-folder))]
    (item-file ctx folder (keyword (or (some-> card-type name) "question")) (:entity_id card) (:name card))))

(defmethod item-path "Dashboard" [ctx entity]
  (item-file ctx (item-folder ctx (:collection_id entity) legacy-root-folder) :dashboard (:entity_id entity) (:name entity)))

(defmethod item-path "Document" [ctx entity]
  (item-file ctx (item-folder ctx (:collection_id entity) legacy-root-folder) :document (:entity_id entity) (:name entity)))

(defmethod item-path "Timeline" [ctx entity]
  (item-file ctx (item-folder ctx (:collection_id entity) legacy-root-folder) :timeline (:entity_id entity) (:name entity)))

(defmethod item-path "Action" [ctx {:keys [model_id collection_id] :as action}]
  (let [folder (cond
                 (and model_id action-in-model-folder?) (contained-folder ctx :cards "Card" model_id)
                 model_id                               (item-folder ctx collection_id legacy-root-folder)
                 :else                                  (item-folder ctx collection_id ["data_actions"]))]
    (item-file ctx folder :action (:entity_id action) (:name action))))

(defmethod item-path "NativeQuerySnippet" [ctx entity]
  (item-file ctx (item-folder ctx (:collection_id entity) ["snippets"]) :snippet (:entity_id entity) (:name entity)))

(defmethod item-path "Transform" [ctx entity]
  (item-file ctx (item-folder ctx (:collection_id entity) ["transforms"]) :transform (:entity_id entity) (:name entity)))

(defmethod item-path "TransformTest" [ctx {:keys [transform_id] :as entity}]
  (let [folder (or (contained-folder ctx :transforms "Transform" transform_id) ["transforms"])]
    (item-file ctx folder :transform-test (:entity_id entity) (:name entity))))

(defmethod item-path "TransformTag" [ctx entity]
  (item-file ctx ["transform_tags"] :transform-tag (:entity_id entity) (:name entity)))

(defmethod item-path "TransformJob" [ctx entity]
  (item-file ctx ["transform_jobs"] :transform-job (:entity_id entity) (:name entity)))

(defmethod item-path "PythonLibrary" [_ctx entity]
  ["python_library" (python-library-file (:path entity))])

(defmethod item-path "Glossary" [ctx entity]
  (item-file ctx ["glossary"] :term (:entity_id entity) (:term entity)))

(defmethod item-path "Database" [ctx {db-name :name}]
  ["databases" (str (unique-stem ctx ["databases"] :database db-name db-name) "." (kind-words :database))])

(defmethod item-path "Table" [ctx entity]
  (table-path ctx (table-ref (serdes/path entity))))

(defmethod item-path "TableUserSettings" [ctx entity]
  (let [table (table-path ctx (table-ref (serdes/path entity)))]
    (conj table "_table_settings")))

(defmethod item-path "Field" [ctx entity]
  (field-file ctx (serdes/path entity) :field))

(defmethod item-path "FieldUserSettings" [ctx entity]
  (field-file ctx (serdes/path entity) :field-settings))

(defmethod item-path "Dimension" [ctx entity]
  (field-file ctx (serdes/path entity) :dimension))

(defmethod item-path "FieldValues" [ctx entity]
  ;; one file per column, in the table's folder; a nested column is named by its path of names
  (let [path  (serdes/path entity)
        names (field-names path)]
    (item-file ctx (table-path ctx (table-ref path)) :field-values names (str/join "." names))))

(defn- definition-table-path
  "The resolved path of the file of the table the `definition` of a segment or measure reads."
  [ctx definition]
  (let [[db-name schema table-name] (serdes/serialized-query-source-table definition)]
    (table-path ctx [db-name schema table-name])))

(defmethod item-path "Segment" [ctx entity]
  (item-file ctx (definition-table-path ctx (:definition entity)) :segment (:entity_id entity) (:name entity)))

(defmethod item-path "Measure" [ctx entity]
  (item-file ctx (definition-table-path ctx (:definition entity)) :measure (:entity_id entity) (:name entity)))

(defn kind-layout
  "The kind layout: the resolved path of the file of the extracted `entity` in storage context `ctx` (which needs a
  `:layout-cache`), or nil when the entity has no file of its own (the Library and its section collections)."
  [ctx entity]
  (item-path ctx entity))
