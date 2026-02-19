(ns metabase-enterprise.remote-sync.spec
  "Centralized specifications for remote-syncable models.

   Each spec defines everything needed for a model to participate in remote sync:
   - Event handling (what events to listen to, how to determine status)
   - Eligibility checking (when should this model be tracked)
   - Dirty tracking (how to create/update RemoteSyncObject entries)
   - Identity resolution (for import/export matching)
   - Path construction (for serialization paths)

   To add a new syncable model, add a spec entry to `remote-sync-specs` and
   optionally implement custom multimethods if the default behavior doesn't fit."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [metabase-enterprise.remote-sync.settings :as rs-settings]
   [metabase-enterprise.transforms-python.core :as transforms-python]
   [metabase.collections.core :as collections]
   [metabase.collections.models.collection :as collection]
   [metabase.models.serialization :as serdes]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Spec Definitions -------------------------------------------------

(def remote-sync-specs
  "Map of model keyword to its remote-sync specification.

   Each spec contains:
   - :model-type     - String name for RemoteSyncObject model_type column
   - :model-key      - Toucan2 model keyword (e.g., :model/Card)
   - :identity       - Identity strategy: :entity-id, :path, or :hybrid
   - :path-keys      - For :path or :hybrid identity: vector of path components [:database :schema :table :field]
   - :parent-model   - For :parent-table eligibility: the parent model key to check eligibility against
                       (e.g., :model/Table for Field, Segment, Measure)
   - :parent-fk      - For child models: the FK column pointing to the parent (e.g., :table_id)
   - :cascade-filter  - Optional map of additional filter conditions for cascade queries.
                       Only needed when the filter differs from {archived-key false}.
                       E.g., Field needs {:active true} since it has no :archived-key.
   - :delete-after   - Optional vector of model keys that must be deleted AFTER this model.
                       Used to handle FK constraints during import cleanup. For example, if Card
                       has :delete-after [:model/Collection], Card will be deleted before Collection.
   - :events         - Event configuration map:
                       :prefix - Event keyword prefix (e.g., :event/card)
                       :types  - Vector of event types to handle [:create :update :delete]
   - :eligibility    - Eligibility configuration:
                       :type       - :collection, :published-table, :parent-table, :setting, or :library-synced
                       :collection - For :collection type: :remote-synced, :transforms-namespace, :snippets-namespace, or :any
                       :setting    - For :setting type: setting keyword to check
                       (Note: :library-synced type uses the library-is-remote-synced? setting to determine eligibility)
   - :archived-key   - Key to check for archived status (nil if model has no archived concept)
   - :tracking       - RemoteSyncObject field configuration:
                       :select-fields  - Fields to select for hydration
                       :hydrate-query  - Optional custom query for joins (overrides select-fields)
                       :field-mappings - Map of RemoteSyncObject column -> source field or [field transform-fn]
   - :conditions     - Optional map of conditions for filtering syncable entities.
                       Only entities matching these conditions are eligible for sync
                       (export, import cleanup, removal). Example: {:built_in_type nil}
                       to exclude built-in items from sync.
   - :removal        - Removal/cleanup configuration:
                       :statuses   - Set of statuses to check for removal (e.g., #{\"removed\" \"delete\"})
                       :scope-key  - Optional key for scoping deletions (e.g., :collection_id, :id).
                                     If nil, deletions are global (by entity_id only).
                       :all-on-setting-disable - Optional setting keyword; when this setting's sentinel
                                     RSO exists with 'delete' status, remove ALL entities of this type
   - :export-scope   - Export scope for query-export-roots:
                       :root-collections - Query root-level remote-synced + namespace collections (Collection)
                       :root-only        - Query root instances with collection_id = nil (Transform)
                       :all              - Query all instances (TransformTag, PythonLibrary, NativeQuerySnippet)
                       nil/:derived      - No root query; derived from other models via serdes/descendants
   - :enabled?       - true, or setting keyword (e.g., :remote-sync-transforms, :library-synced).
                       When :library-synced, uses the library-is-remote-synced? setting."
  {:model/Card
   {:model-type     "Card"
    :model-key      :model/Card
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/card
                     :types  [:create :update :delete]}
    :eligibility    {:type       :collection
                     :collection :remote-synced}
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id :display]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id
                                      :model_display       [:display #(some-> % name)]}}
    :removal        {:statuses  #{"removed"}
                     :scope-key :collection_id}
    :enabled?       true}

   :model/Dashboard
   {:model-type     "Dashboard"
    :model-key      :model/Dashboard
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/dashboard
                     :types  [:create :update :delete]}
    :eligibility    {:type       :collection
                     :collection :remote-synced}
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id}}
    :removal        {:statuses  #{"removed"}
                     :scope-key :collection_id}
    :enabled?       true}

   :model/Document
   {:model-type     "Document"
    :model-key      :model/Document
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/document
                     :types  [:create :update :delete]}
    :eligibility    {:type       :collection
                     :collection :remote-synced}
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id}}
    :removal        {:statuses  #{"removed"}
                     :scope-key :collection_id}
    :enabled?       true}

   :model/NativeQuerySnippet
   {:model-type     "NativeQuerySnippet"
    :model-key      :model/NativeQuerySnippet
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/snippet
                     :types  [:create :update :delete]}
    :eligibility    {:type :library-synced}  ; sync all snippets when Library is remote-synced
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id}}
    :removal        {:statuses #{"removed" "delete"}}  ; no scope-key = global deletion
    :export-scope   :all  ; export all snippets
    :enabled?       :library-synced}

   :model/Timeline
   {:model-type     "Timeline"
    :model-key      :model/Timeline
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/timeline
                     :types  [:create :update :delete]}
    :eligibility    {:type       :collection
                     :collection :remote-synced}
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id}}
    :removal        {:statuses  #{"removed"}
                     :scope-key :collection_id}
    :enabled?       true}

   :model/Collection
   {:model-type     "Collection"
    :model-key      :model/Collection
    :identity       :entity-id
    :events         {:prefix :event/collection
                     :types  [:create :update]}  ; no delete event for collections
    :eligibility    {:type       :collection
                     :collection :any}  ; remote-synced OR transforms-namespace
    :archived-key   :archived
    :tracking       {:select-fields  [:name :id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :id}}  ; collection_id is self
    :removal        {:statuses  #{"removed" "delete"}  ; delete is set when collection is archived
                     :scope-key :id}  ; collections are scoped by their own id
    :export-scope   :root-collections  ; query for root-level remote-synced + transforms-namespace collections
    :enabled?       true}

   :model/Table
   {:model-type     "Table"
    :model-key      :model/Table
    :identity       :path
    :path-keys      [:database :schema :table]
    :events         {:prefix :event/table
                     :types  [:create :update :delete :publish :unpublish]}
    :eligibility    {:type :published-table}
    :archived-key   :archived_at  ; tables use archived_at, not archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id
                                      :model_table_id      :id
                                      :model_table_name    :name}}  ; self-reference
    :removal        {:statuses #{"removed"}}
    :enabled?       true}

   :model/Field
   {:model-type     "Field"
    :model-key      :model/Field
    :identity       :path
    :path-keys      [:database :schema :table :field]
    :parent-model   :model/Table
    :parent-fk      :table_id
    :cascade-filter {:active true}
    :events         {:prefix :event/field
                     :types  [:create :update :delete]}
    :eligibility    {:type :parent-table}
    :archived-key   nil  ; fields don't have archived
    :tracking       {:hydrate-query  {:select [:f.name :f.table_id
                                               [:t.collection_id :collection_id]
                                               [:t.name :table_name]]
                                      :from   [[:metabase_field :f]]
                                      :join   [[:metabase_table :t] [:= :f.table_id :t.id]]
                                      :where  [:= :f.id :?id]}
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id
                                      :model_table_id      :table_id
                                      :model_table_name    :table_name}}
    :removal        {:statuses #{"removed"}}
    :enabled?       true}

   :model/Segment
   {:model-type     "Segment"
    :model-key      :model/Segment
    :identity       :hybrid  ; entity_id but needs table context for path
    :path-keys      [:database :schema :table]
    :parent-model   :model/Table
    :events         {:prefix :event/segment
                     :types  [:create :update :delete]}
    :eligibility    {:type :parent-table}
    :archived-key   :archived
    :tracking       {:hydrate-query  {:select [:s.name :s.table_id
                                               [:t.collection_id :collection_id]
                                               [:t.name :table_name]]
                                      :from   [[:segment :s]]
                                      :join   [[:metabase_table :t] [:= :s.table_id :t.id]]
                                      :where  [:= :s.id :?id]}
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id
                                      :model_table_id      :table_id
                                      :model_table_name    :table_name}}
    :removal        {:statuses #{"removed" "delete"}}  ; Segment has both
    :enabled?       true}

   :model/Measure
   {:model-type     "Measure"
    :model-key      :model/Measure
    :identity       :hybrid  ; entity_id but needs table context for path
    :path-keys      [:database :schema :table]
    :parent-model   :model/Table
    :events         {:prefix :event/measure
                     :types  [:create :update :delete]}
    :eligibility    {:type :parent-table}
    :archived-key   :archived
    ;; Note: hydrate-query uses :s alias because query-entities-for-sync :hybrid
    ;; hardcodes :s.id and :s.entity_id references
    :tracking       {:hydrate-query  {:select [:s.name :s.table_id
                                               [:t.collection_id :collection_id]
                                               [:t.name :table_name]]
                                      :from   [[:measure :s]]
                                      :join   [[:metabase_table :t] [:= :s.table_id :t.id]]
                                      :where  [:= :s.id :?id]}
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id
                                      :model_table_id      :table_id
                                      :model_table_name    :table_name}}
    :removal        {:statuses #{"removed" "delete"}}
    :enabled?       true}

   :model/Transform
   {:model-type     "Transform"
    :model-key      :model/Transform
    :identity       :entity-id
    :delete-after   [:model/Collection]  ; has collection_id FK
    :events         {:prefix :event/transform
                     :types  [:create :update :delete]}
    :eligibility    {:type    :setting
                     :setting :remote-sync-transforms}
    :archived-key   :archived
    :tracking       {:select-fields  [:name :collection_id]
                     :field-mappings {:model_name          :name
                                      :model_collection_id :collection_id}}
    :removal        {:statuses #{"removed" "delete"}  ; no scope-key = global deletion
                     :all-on-setting-disable :remote-sync-transforms}
    :export-scope   :root-only  ; query for root transforms (collection_id = nil)
    :enabled?       :remote-sync-transforms}

   :model/TransformTag
   {:model-type     "TransformTag"
    :model-key      :model/TransformTag
    :identity       :entity-id
    :events         {:prefix :event/transform-tag
                     :types  [:create :update :delete]}
    :eligibility    {:type    :setting
                     :setting :remote-sync-transforms}
    :archived-key   nil  ; no archived field
    :tracking       {:select-fields  [:name]
                     :field-mappings {:model_name :name}}
    :conditions     {:built_in_type nil}  ; exclude built-in tags from sync
    :removal        {:statuses #{"removed" "delete"}  ; no scope-key = global deletion
                     :all-on-setting-disable :remote-sync-transforms}
    :export-scope   :all  ; query for all instances
    :enabled?       :remote-sync-transforms}

   :model/PythonLibrary
   {:model-type     "PythonLibrary"
    :model-key      :model/PythonLibrary
    :identity       :entity-id
    :events         {:prefix :event/python-library
                     :types  [:create :update]}  ; no delete - upsert only
    :eligibility    {:type    :setting
                     :setting :remote-sync-transforms}
    :archived-key   nil  ; no archived field
    :tracking       {:select-fields  [:path]
                     :field-mappings {:model_name :path}}
    :conditions     {:entity_id [:not= transforms-python/builtin-entity-id]}  ; exclude built-in common.py from sync
    :removal        {:statuses               #{"removed" "delete"}  ; no scope-key = global deletion
                     :all-on-setting-disable :remote-sync-transforms}
    :export-scope   :all  ; query for all instances
    :enabled?       :remote-sync-transforms}})

;;; ------------------------------------------------- Helper Functions -------------------------------------------------

(defn spec-enabled?
  "Returns true if the spec is currently enabled based on its :enabled? value."
  [{:keys [enabled?]}]
  (cond
    (true? enabled?)            true
    (= enabled? :library-synced) (rs-settings/library-is-remote-synced?)
    (keyword? enabled?)         (boolean (setting/get-value-of-type :boolean enabled?))
    :else                       false))

(defn enabled-specs
  "Returns a map of model-key -> spec for all currently enabled specs."
  []
  (into {}
        (filter (fn [[_ spec]] (spec-enabled? spec)))
        remote-sync-specs))

(defn spec-for-model-type
  "Returns the spec for a given model type string (e.g., \"Card\")."
  [model-type-str]
  (some (fn [[_ spec]]
          (when (= (:model-type spec) model-type-str)
            spec))
        remote-sync-specs))

(defn spec-for-model-key
  "Returns the spec for a given model key (e.g., :model/Card)."
  [model-key]
  (get remote-sync-specs model-key))

(defn children-specs
  "Returns child specs for a given parent model key, derived from :parent-model references."
  [parent-model-key]
  (into []
        (comp (map val)
              (filter #(and (= (:parent-model %) parent-model-key)
                            (:parent-fk %))))
        remote-sync-specs))

(defn specs-by-identity-type
  "Returns a map of model-key -> spec filtered by identity type."
  [identity-type]
  (into {}
        (filter (fn [[_ spec]] (= (:identity spec) identity-type)))
        (enabled-specs)))

(defn specs-for-deletion
  "Returns specs with :entity-id identity type, topologically sorted for safe deletion.
   Uses :delete-after declarations to ensure models are deleted before their dependencies.
   If model A has :delete-after [:model/B], then A will be deleted before B."
  []
  (let [entity-id-specs (specs-by-identity-type :entity-id)
        ;; Build dependency graph: model -> set of models that must be deleted after it
        ;; (i.e., the models listed in this model's :delete-after)
        delete-after-map (reduce-kv
                          (fn [m model-key spec]
                            (assoc m model-key (set (get spec :delete-after))))
                          {}
                          entity-id-specs)
        ;; Invert to get: model -> set of models that must be deleted before it
        ;; If A has :delete-after [B], then B must wait for A to be deleted first
        must-wait-for (reduce-kv
                       (fn [m model-key deps]
                         (reduce (fn [m' dep]
                                   (update m' dep (fnil conj #{}) model-key))
                                 m
                                 deps))
                       {}
                       delete-after-map)
        ;; Simple topological sort - repeatedly take models with no remaining dependencies
        sorted (loop [remaining (set (keys entity-id-specs))
                      result []]
                 (if (empty? remaining)
                   result
                   (let [;; Find models whose dependencies are all already processed
                         ready (filter (fn [k]
                                         (every? #(not (remaining %))
                                                 (get must-wait-for k)))
                                       remaining)]
                     (if (empty? ready)
                       ;; Cycle detected or no progress - just append remaining
                       (into result remaining)
                       (recur (apply disj remaining ready)
                              (into result ready))))))]
    (mapv (fn [k] [k (entity-id-specs k)]) sorted)))

(defn excluded-model-types
  "Returns a set of model type strings that should be excluded from dirty detection
   based on current settings. Models with a setting-based or library-synced :enabled?
   that is currently false will be excluded."
  []
  (->> remote-sync-specs
       (filter (fn [[_ spec]]
                 (let [enabled? (:enabled? spec)]
                   (and (keyword? enabled?)
                        (not (spec-enabled? spec))))))
       (map (fn [[_ spec]] (:model-type spec)))
       set))

(defn all-model-types
  "Returns a set of all model type strings."
  []
  (into #{} (map :model-type (vals remote-sync-specs))))

;;; ---------------------------------------- Import Conflict Detection -----------------------------------------------

(defn optional-feature-specs
  "Returns specs for optional features, grouped by their enabling setting keyword.
   Optional features are those with a keyword `:enabled?` value (not `true`).
   Returns map of {setting-keyword {model-key spec}}."
  []
  (-> remote-sync-specs
      (->> (filter (fn [[_ spec]] (keyword? (:enabled? spec))))
           (group-by (fn [[_ spec]] (:enabled? spec))))
      (update-vals #(into {} %))))

(defn- setting->category
  "Converts a setting keyword to a human-readable conflict category name."
  [setting-kw]
  (case setting-kw
    :remote-sync-transforms "Transforms"
    :library-synced         "Snippets"
    (str/capitalize (name setting-kw))))

(defn models-for-setting
  "Returns set of model-type strings for specs with the given `:enabled?` setting."
  [setting-kw]
  (->> remote-sync-specs
       (filter (fn [[_ spec]] (= (:enabled? spec) setting-kw)))
       (map (fn [[_ spec]] (:model-type spec)))
       (into #{})))

(def transform-models
  "Models that indicate transforms content in a snapshot.
   Derived from specs with `:enabled? :remote-sync-transforms`."
  (disj (models-for-setting :remote-sync-transforms) :model/TransformTag))

(defn models-in-import
  "Returns set of model-type strings present in the import.
   Takes an ingest-list (sequence of serdes paths from serialization/ingest-list)."
  [ingest-list]
  (->> ingest-list
       (map (fn [path] (:model (last path))))
       (into #{})))

(defn check-entity-id-conflicts
  "Checks if imported entity_ids exist locally but are NOT in RemoteSyncObject.
   Returns map of {model-type #{conflicting-entity-ids}}.

   Excludes the Library collection entity_id since that's handled by the library-conflict check."
  [imported-entity-ids-by-model]
  (into {}
        (for [[model-type entity-ids] imported-entity-ids-by-model
              :when (seq entity-ids)
              :let [spec (spec-for-model-type model-type)
                    model-key (:model-key spec)]
              :when (and spec model-key (#{:entity-id :hybrid} (:identity spec)))
              :let [local-entity-ids (t2/select-fn-set :entity_id model-key :entity_id [:in entity-ids])
                    tracked-entity-ids (when (seq local-entity-ids)
                                         (let [pks (t2/select-pks-vec model-key
                                                                      :entity_id [:in local-entity-ids])]
                                           (t2/select-fn-set
                                            (fn [rso]
                                              (:entity_id (t2/select-one model-key :id (:model_id rso))))
                                            :model/RemoteSyncObject
                                            :model_type model-type
                                            :model_id [:in pks])))
                    conflicting-entity-ids (set/difference local-entity-ids (or tracked-entity-ids #{}))
                    conflicting-entity-ids (if (= model-type "Collection")
                                             (disj conflicting-entity-ids collection/library-entity-id)
                                             conflicting-entity-ids)]
              :when (seq conflicting-entity-ids)]
          [model-type conflicting-entity-ids])))

(defn- has-unsynced-entities-for-feature?
  "Returns true if any model in the feature group has local entities not tracked in RemoteSyncObject.
   Excludes built-in TransformTags from the count since they are system-created and not user data."
  [specs-for-feature]
  (some (fn [[_ spec]]
          (let [model-key (:model-key spec)
                model-type (:model-type spec)
                ;; Exclude built-in entities from count (they are system-created, not user data)
                local-count (case model-key
                              :model/TransformTag   (t2/count model-key :built_in_type nil)
                              :model/PythonLibrary  (t2/count model-key :entity_id [:not= transforms-python/builtin-entity-id])
                              (t2/count model-key))
                synced-count (t2/count :model/RemoteSyncObject :model_type model-type)]
            (and (pos? local-count)
                 (> local-count synced-count))))
        specs-for-feature))

(defn check-feature-conflicts
  "Checks if import contains models that conflict with existing local entities that are NOT already remote synced.
   Derives conflict categories from specs with keyword `:enabled?` values (optional features).
   Only triggers conflict when local has unsynced entities AND import has matching entities.
   If local entities are already synced, dirty tracking handles conflicts instead."
  [models-present]
  (let [feature-groups (optional-feature-specs)]
    (into []
          (for [[setting-kw specs-for-feature] feature-groups
                :let [feature-model-types (into #{} (map (fn [[_ s]] (:model-type s))) specs-for-feature)]
                :when (some feature-model-types models-present)
                :when (has-unsynced-entities-for-feature? specs-for-feature)
                :let [category (setting->category setting-kw)]]
            {:type     (keyword (str (u/lower-case-en category) "-conflict"))
             :category category
             :message  (format "Import contains %s but local instance has unsynced %s"
                               category category)}))))

;;; ------------------------------------------------ Eligibility Checking ----------------------------------------------

(defn transforms-namespace-collection?
  "Check if this is a transforms-namespace collection."
  [object]
  (= (keyword (:namespace object)) :transforms))

(defn snippets-namespace-collection?
  "Check if this is a snippets-namespace collection."
  [object]
  (= (keyword (:namespace object)) :snippets))

(defn library-collection?
  "Check if this is the Library collection."
  [collection]
  (= (:type collection) "library"))

(defn should-sync-collection?
  "Check if a collection should be synced - either remote-synced, transforms-namespace with setting enabled,
   or snippets-namespace with Library synced."
  [collection]
  (or (collections/remote-synced-collection? collection)
      (and (rs-settings/remote-sync-transforms)
           (transforms-namespace-collection? collection))
      (and (rs-settings/library-is-remote-synced?)
           (snippets-namespace-collection? collection))))

(defn all-syncable-collection-ids
  "Returns a vector of all collection IDs that are eligible for remote sync.
   This includes:
   - Collections with is_remote_synced=true
   - Transforms-namespace collections (when remote-sync-transforms setting is enabled)
   - Snippets-namespace collections (when Library is remote-synced)

   Used by import cleanup to determine which collections to scope deletions to."
  []
  (into []
        cat
        [(t2/select-pks-vec :model/Collection :is_remote_synced true)
         (when (rs-settings/remote-sync-transforms)
           (t2/select-pks-vec :model/Collection :namespace (name collections/transforms-ns)))
         (when (rs-settings/library-is-remote-synced?)
           (t2/select-pks-vec :model/Collection :namespace "snippets"))]))

(defmulti check-eligibility
  "Determines if a model instance should be tracked for remote sync.
   Dispatches on the eligibility type defined in the spec."
  {:arglists '([spec object])}
  (fn [spec _object] (get-in spec [:eligibility :type])))

(defmethod check-eligibility :collection
  [{:keys [eligibility]} object]
  (let [collection-type (:collection eligibility)
        collection-id   (:collection_id object)]
    (case collection-type
      :remote-synced
      (boolean (collections/remote-synced-collection? collection-id))

      :transforms-namespace
      (and (rs-settings/remote-sync-transforms)
           (transforms-namespace-collection? object))

      :snippets-namespace
      (and (rs-settings/library-is-remote-synced?)
           (snippets-namespace-collection? object))

      :any
      (or (collections/remote-synced-collection? (or collection-id object))
          (and (rs-settings/remote-sync-transforms)
               (transforms-namespace-collection? object))
          (and (rs-settings/library-is-remote-synced?)
               (snippets-namespace-collection? object)))

      false)))

(defmethod check-eligibility :published-table
  [_ {:keys [is_published collection_id]}]
  (boolean
   (and is_published
        (collections/remote-synced-collection? collection_id))))

(defmethod check-eligibility :parent-table
  [{:keys [parent-model]} {:keys [table_id]}]
  (boolean
   (when table_id
     (when-let [table (t2/select-one parent-model :id table_id)]
       (check-eligibility (spec-for-model-key parent-model) table)))))

(defmethod check-eligibility :setting
  [{:keys [eligibility]} _object]
  (boolean (setting/get-value-of-type :boolean (:setting eligibility))))

(defmethod check-eligibility :library-synced
  [_spec _object]
  (rs-settings/library-is-remote-synced?))

(defmethod check-eligibility :default
  [_ _]
  false)

(defmulti batch-check-eligibility
  "Batch version of check-eligibility. Returns a map of instance-id -> eligible? boolean."
  {:arglists '([spec instances])}
  (fn [spec _instances] (get-in spec [:eligibility :type])))

(defmethod batch-check-eligibility :library-synced
  [_spec instances]
  (let [eligible? (rs-settings/library-is-remote-synced?)]
    (into {} (map (fn [inst] [(:id inst) eligible?])) instances)))

(defmethod batch-check-eligibility :default
  [spec instances]
  (into {} (map (fn [inst] [(:id inst) (check-eligibility spec inst)])) instances))

;;; -------------------------------------------- Editability Checking ------------------------------------------------

(defn model-editable?
  "Determines if a model instance is editable based on remote sync configuration.

   Returns false if:
   - The model has a spec in remote-sync-specs AND
   - The instance is eligible for sync (via check-eligibility) AND
   - remote-sync-type is :read-only

   For models with global eligibility (e.g., :library-synced, :setting), the instance
   argument can be nil or an empty map since eligibility doesn't depend on instance data."
  [model-key instance]
  (if-let [spec (spec-for-model-key model-key)]
    (or (= (rs-settings/remote-sync-type) :read-write)
        (not (check-eligibility spec instance)))
    ;; Model not in spec, always editable
    true))

(defn batch-model-editable?
  "Batch version of model-editable?. Returns a map of instance-id -> editable? boolean."
  [model-key instances]
  (if-let [spec (spec-for-model-key model-key)]
    (if (= (rs-settings/remote-sync-type) :read-write)
      (into {} (map (fn [inst] [(:id inst) true])) instances)
      (let [eligibility-map (batch-check-eligibility spec instances)]
        (into {} (map (fn [[id eligible?]] [id (not eligible?)])) eligibility-map)))
    (into {} (map (fn [inst] [(:id inst) true])) instances)))

;;; ---------------------------------------------------- Hydration -----------------------------------------------------

(defn hydrate-model-details
  "Hydrates model details for RemoteSyncObject based on spec.
   Returns a map with the fields needed to populate the sync object."
  [{:keys [model-key tracking]} model-id]
  (if-let [query (:hydrate-query tracking)]
    ;; Use custom query for joins (Field, Segment)
    (first (t2/query (update query :where
                             (fn [where-clause]
                               (walk/postwalk
                                #(if (= % :?id) model-id %)
                                where-clause)))))
    ;; Simple select using select-fields
    (when-let [fields (:select-fields tracking)]
      (t2/select-one (into [model-key] fields) :id model-id))))

(defn build-sync-object-fields
  "Builds the fields map for RemoteSyncObject from hydrated model details.
   Applies any transform functions defined in field-mappings."
  [{:keys [tracking]} model-details]
  (when model-details
    (into {}
          (for [[sync-field source-spec] (:field-mappings tracking)]
            (let [value (cond
                          ;; Simple keyword - just get the field
                          (keyword? source-spec)
                          (get model-details source-spec)

                          ;; Vector with transform function [field transform-fn]
                          (vector? source-spec)
                          (let [[field transform-fn] source-spec]
                            (transform-fn (get model-details field)))

                          :else
                          source-spec)]
              [sync-field value])))))

;;; ------------------------------------------------ Identity Resolution -----------------------------------------------

(defmulti extract-identity
  "Extracts the identity for a model instance based on the spec's identity strategy.
   Used for matching during import/export."
  {:arglists '([spec instance])}
  (fn [spec _instance] (:identity spec)))

(defmethod extract-identity :entity-id
  [_ instance]
  {:entity-id (:entity_id instance)})

(defmethod extract-identity :path
  [{:keys [path-keys]} instance]
  ;; Path-based identity uses the path-keys to build a unique identifier
  (select-keys instance path-keys))

(defmethod extract-identity :hybrid
  [{:keys [path-keys]} instance]
  ;; Hybrid uses both entity_id and path context
  {:entity-id (:entity_id instance)
   :path      (select-keys instance path-keys)})

;;; ----------------------------------------- Serdes Path Identity Extraction ------------------------------------------

(def ^:private serdes-path-identity-hierarchy
  "Hierarchy for extract-identity-from-serdes-path dispatch. Both :entity-id and :hybrid models
   extract identity the same way (entity_id from last path element)."
  (-> (make-hierarchy)
      (derive :entity-id ::entity-id-extractor)
      (derive :hybrid ::entity-id-extractor)))

(defmulti extract-identity-from-serdes-path
  "Extracts identity data from a serdes path based on the spec's identity strategy. For entity-id
   and hybrid models, returns the entity_id string from the last path element. For path-based models
   like Table and Field, returns a map with database, schema, and table/field names that can be used
   to look up the entity."
  {:arglists '([spec serdes-path])}
  (fn [spec _path] (:identity spec))
  :hierarchy #'serdes-path-identity-hierarchy)

(defmethod extract-identity-from-serdes-path ::entity-id-extractor
  [_ serdes-path]
  (:id (last serdes-path)))

(defmethod extract-identity-from-serdes-path :path
  [_ serdes-path]
  (let [path-map (into {} (map (fn [elem] [(keyword (u/lower-case-en (:model elem))) (:id elem)]) serdes-path))]
    (cond-> {}
      (contains? path-map :database) (assoc :db_name (:database path-map))
      (contains? path-map :schema)   (assoc :schema (:schema path-map))
      (contains? path-map :table)    (assoc :table_name (:table path-map))
      (contains? path-map :field)    (assoc :field_name (:field path-map)))))

(defmethod extract-identity-from-serdes-path :default
  [_ _]
  nil)

(defn extract-imported-entities
  "Processes serdes paths from an import and extracts entity identities grouped by how they should be looked up.
   Returns a map with :by-entity-id containing entity_ids grouped by model type, and :by-path containing
   path lookup maps for models like Table and Field that use path-based identity."
  [seen-paths]
  (reduce
   (fn [acc path]
     (let [model-type (-> path last :model)]
       (if-let [spec (spec-for-model-type model-type)]
         (let [identity-type (:identity spec)
               identity-data (extract-identity-from-serdes-path spec path)]
           (if identity-data
             (case identity-type
               (:entity-id :hybrid)
               (update-in acc [:by-entity-id model-type] (fnil conj #{}) identity-data)

               :path
               (update-in acc [:by-path (:model-key spec)] (fnil conj []) identity-data)

               acc)
             acc))
         acc)))
   {:by-entity-id {}
    :by-path {}}
   seen-paths))

;;; --------------------------------------------- Export Path Construction ---------------------------------------------

(defn- transform-entity-for-serdes
  "Transforms entity fields to serdes format for path generation.
   - Converts integer table_id to [db-name schema table-name] format
   - Converts integer collection_id to entity_id string for collection path lookup"
  [entity]
  (cond-> entity
    ;; Transform table_id for Segment (and other table-based entities)
    (and (:table_id entity) (integer? (:table_id entity)))
    (assoc :table_id (serdes/*export-table-fk* (:table_id entity)))
    ;; Transform collection_id for snippet and other collection-based entities
    (and (:collection_id entity) (integer? (:collection_id entity)))
    (assoc :collection_id (t2/select-one-fn :entity_id :model/Collection :id (:collection_id entity)))))

(defn- entity->serdes-path
  "Builds the file path for an entity using serdes/storage-path.
   For Collections, returns the directory path (for recursive deletion).
   For other entities, returns the full file path.
   Returns the path as a string (without extension), or nil if path cannot be built."
  [model-type entity ctx]
  (try
    (when-let [serdes-meta (serdes/generate-path model-type entity)]
      (let [;; Transform entity fields to serdes format (e.g., table_id -> [db schema table])
            transformed-entity (transform-entity-for-serdes entity)
            entity-with-meta (assoc transformed-entity :serdes/meta serdes-meta)
            storage-path (serdes/storage-path entity-with-meta ctx)]
        ;; For Collections, drop the last segment (filename) to get directory path
        (if (= model-type "Collection")
          (str/join "/" (butlast storage-path))
          (str/join "/" storage-path))))
    (catch Exception e
      (log/warnf "Failed to build storage path for %s %s: %s"
                 model-type (:id entity) (ex-message e))
      nil)))

;;; -------------------------------------------- Event Helper Functions ------------------------------------------------

(defn determine-status
  "Determines the sync status based on event type and archived state."
  [{:keys [archived-key]} topic object]
  (let [archived? (and archived-key (get object archived-key))]
    (if archived?
      "delete"
      (let [topic-name (name topic)]
        (cond
          (str/ends-with? topic-name "-create") "create"
          (str/ends-with? topic-name "-update") "update"
          (str/ends-with? topic-name "-delete") "delete"
          :else "update")))))

(defn event-keywords
  "Returns a map of event keywords for a spec: {:parent :create :update :delete}."
  [{:keys [events]}]
  (let [{:keys [prefix types]} events
        ns-str (namespace prefix)
        base   (name prefix)]
    (merge
     ;; Parent keyword uses the event prefix name (e.g., :card -> card-change-event)
     {:parent (keyword "metabase-enterprise.remote-sync.events"
                       (str base "-change-event"))}
     (into {}
           (for [event-type types]
             [event-type (keyword ns-str (str base "-" (name event-type)))])))))

;;; ---------------------------------------------- Spec Field Accessors ------------------------------------------------

(defn fields-for-sync
  "Returns the fields to select for a model during sync operations.
   Falls back to default if not specified in spec."
  [model-type-str]
  (if-let [spec (spec-for-model-type model-type-str)]
    (or (get-in spec [:tracking :select-fields])
        [:id :name :collection_id])
    [:id :name :collection_id]))

;;; -------------------------------------------- Removal Path Building --------------------------------------------------

(defn- query-removed-ids
  "Queries RemoteSyncObject for model IDs marked for removal."
  [model-type statuses]
  (t2/select-fn-set :model_id :model/RemoteSyncObject
                    :model_type model-type
                    :status [:in (vec statuses)]))

(defn- query-removed-entities
  "Queries entities marked for removal with all fields needed for serdes path generation.
   serdes/generate-path needs: entity_id, name (for label)
   serdes/storage-path needs: collection_id (for collection context), table_id (for segment paths)"
  [{:keys [model-type model-key removal]}]
  (let [{:keys [statuses]} removal
        removed-ids (query-removed-ids model-type statuses)]
    (when (seq removed-ids)
      ;; Select all columns since different models need different fields for serdes paths
      (t2/select model-key :id [:in removed-ids]))))

(defn- setting-sentinel-delete?
  "Returns true if the setting's sentinel RSO exists with 'delete' status.
   Used to detect when a setting (like :remote-sync-transforms) has been disabled
   and all entities of the controlled types should be removed."
  [setting-key]
  (when (= setting-key :remote-sync-transforms)
    (t2/exists? :model/RemoteSyncObject
                :model_type "Collection"
                :model_id rs-settings/transforms-root-id
                :status "delete")))

(defn- build-bulk-removal-paths
  "Builds removal paths for ALL entities of a spec's model type.
   Used when the controlling setting is disabled (sentinel RSO has 'delete' status).
   Respects :conditions from the spec to exclude ineligible entities."
  [spec ctx]
  (let [{:keys [model-type model-key conditions]} spec]
    (for [entity (if conditions
                   (apply t2/select model-key (into [] cat conditions))
                   (t2/select model-key))
          :let [path (entity->serdes-path model-type entity ctx)]
          :when path]
      path)))

(defn build-all-removal-paths
  "Builds full file paths for all entities marked for removal in RemoteSyncObject.
   Uses serdes/storage-path to generate paths that exactly match the file structure.

   Does bulk queries per model type for efficiency:
   1. Query RemoteSyncObject for model_ids with removal statuses
   2. Query actual entities by those IDs
   3. Use serdes/storage-path to build the exact file path

   Also handles bulk removal for specs with :all-on-setting-disable when the
   controlling setting's sentinel RSO has 'delete' status.

   Returns paths without file extensions - the git source adds .yaml as needed."
  []
  (let [ctx (serdes/storage-base-context)
        ;; Standard removal paths from enabled specs
        standard-paths (into []
                             (for [[_model-key spec] (enabled-specs)
                                   :when (spec-enabled? spec)
                                   :let [{:keys [statuses]} (:removal spec)
                                         model-type (:model-type spec)]
                                   :when (seq statuses)
                                   entity (query-removed-entities spec)
                                   :let [path (entity->serdes-path model-type entity ctx)]
                                   :when path]
                               path))
        ;; Bulk removal paths for specs with :all-on-setting-disable
        bulk-paths (into []
                         (for [[_model-key spec] remote-sync-specs
                               :let [setting-key (get-in spec [:removal :all-on-setting-disable])]
                               :when (and setting-key (setting-sentinel-delete? setting-key))
                               path (build-bulk-removal-paths spec ctx)]
                           path))]
    (into standard-paths bulk-paths)))

;;; ----------------------------------------- Sync Object Query Functions --------------------------------------------

(defmulti query-entities-for-sync
  "Queries entities for sync based on identity type.
   Returns a sequence of maps ready for RemoteSyncObject insertion.

   Parameters:
   - spec: The model spec
   - data: For :entity-id/:hybrid - a collection of entity_ids
           For :path - a collection of path maps {:db_name :schema :table_name [:field_name]}
   - timestamp: The sync timestamp"
  {:arglists '([spec data timestamp])}
  (fn [spec _data _timestamp] (:identity spec)))

(defmethod query-entities-for-sync :entity-id
  [{:keys [model-type model-key tracking]} entity-ids timestamp]
  (when (seq entity-ids)
    (let [;; Get select fields from spec, with :id always included
          select-fields (into [:id] (or (:select-fields tracking) [:name :collection_id]))
          entities (t2/select (into [model-key] select-fields) :entity_id [:in entity-ids])]
      (map (fn [entity]
             (let [;; Apply field mappings
                   field-mappings (:field-mappings tracking)
                   mapped-fields (into {}
                                       (for [[sync-field source-spec] field-mappings]
                                         (let [value (cond
                                                       (keyword? source-spec)
                                                       (get entity source-spec)
                                                       (vector? source-spec)
                                                       (let [[field transform-fn] source-spec]
                                                         (transform-fn (get entity field)))
                                                       :else source-spec)]
                                           [sync-field value])))]
               (merge {:model_type        model-type
                       :model_id          (:id entity)
                       :status            "synced"
                       :status_changed_at timestamp}
                      mapped-fields)))
           entities))))

(defmethod query-entities-for-sync :hybrid
  ;; Hybrid models like Segment need a join query for table info
  [{:keys [model-type tracking]} entity-ids timestamp]
  (when (seq entity-ids)
    (when-let [query-template (:hydrate-query tracking)]
      ;; Use custom hydrate query adapted for batch lookup
      ;; Keep the existing from/join structure, just modify select and where
      ;; The query template uses alias :s for the main model (segment)
      (let [base-query (-> query-template
                           (update :select (fn [cols] (vec (concat [:s.id] cols))))
                           (assoc :where [:in :s.entity_id entity-ids]))]
        (->> (t2/query base-query)
             (map (fn [entity]
                    (let [field-mappings (:field-mappings tracking)
                          mapped-fields (into {}
                                              (for [[sync-field source-spec] field-mappings]
                                                [sync-field (get entity source-spec)]))]
                      (merge {:model_type        model-type
                              :model_id          (:id entity)
                              :status            "synced"
                              :status_changed_at timestamp}
                             mapped-fields)))))))))

(defn- build-path-where-clause
  "Builds an :or where clause for path-based lookups."
  [paths has-field?]
  (into [:or]
        (for [path paths]
          (let [{:keys [db_name schema table_name field_name]} path]
            (cond-> [:and
                     [:= :db.name db_name]
                     (if schema [:= :t.schema schema] [:is :t.schema nil])
                     [:= :t.name table_name]]
              (and has-field? field_name)
              (conj [:= :f.name field_name]))))))

(defmethod query-entities-for-sync :path
  [{:keys [model-type model-key]} paths timestamp]
  (when (seq paths)
    (case model-key
      :model/Table
      (->> (t2/query {:select [:t.id :t.name :t.collection_id]
                      :from   [[:metabase_table :t]]
                      :join   [[:metabase_database :db] [:= :db.id :t.db_id]]
                      :where  (build-path-where-clause paths false)})
           (map (fn [{:keys [id name collection_id]}]
                  {:model_type        model-type
                   :model_id          id
                   :model_name        name
                   :model_collection_id collection_id
                   :model_display     nil
                   :model_table_id    id
                   :model_table_name  name
                   :status            "synced"
                   :status_changed_at timestamp})))

      :model/Field
      (->> (t2/query {:select [:f.id :f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                      :from   [[:metabase_field :f]]
                      :join   [[:metabase_table :t] [:= :t.id :f.table_id]
                               [:metabase_database :db] [:= :db.id :t.db_id]]
                      :where  (build-path-where-clause paths true)})
           (map (fn [{:keys [id name table_id table_name collection_id]}]
                  {:model_type          model-type
                   :model_id            id
                   :model_name          name
                   :model_collection_id collection_id
                   :model_display       nil
                   :model_table_id      table_id
                   :model_table_name    table_name
                   :status              "synced"
                   :status_changed_at   timestamp})))

      ;; Default for unknown path models
      nil)))

(defmethod query-entities-for-sync :default
  [_ _ _]
  nil)

(defn sync-all-entities!
  "Builds RemoteSyncObject entries for all imported entities based on their specs. Iterates over enabled
   specs and queries the database to hydrate the fields needed for each sync object. Returns a sequence
   of maps ready for insertion into the RemoteSyncObject table."
  [timestamp {:keys [by-entity-id by-path]}]
  (into []
        (for [[model-key spec] (enabled-specs)
              :let [identity-type (:identity spec)
                    model-type (:model-type spec)
                    data (case identity-type
                           :entity-id (get by-entity-id model-type)
                           :path (get by-path model-key)
                           :hybrid (get by-entity-id model-type))]
              :when (seq data)
              entity (query-entities-for-sync spec data timestamp)]
          entity)))

;;; -------------------------------------------- Export Extraction ------------------------------------------------

(defmulti query-export-roots
  "Queries for root-level export targets based on eligibility configuration.
   Returns a sequence of [model-type id] tuples for initial targets, or nil if
   this model type's targets are derived from other models (e.g., via serdes/descendants)."
  {:arglists '([spec])}
  (fn [spec] (get-in spec [:eligibility :type])))

(defmethod query-export-roots :collection
  [{:keys [export-scope]}]
  (case (or export-scope :derived)
    :root-collections
    ;; Excludes archived collections - their files are handled by the removal logic
    (concat
     (t2/select-fn-set (juxt (constantly "Collection") :id)
                       :model/Collection
                       {:where [:and
                                [:= :is_remote_synced true]
                                [:= :location "/"]
                                [:not :archived]]})
     (when (rs-settings/remote-sync-transforms)
       (t2/select-fn-set (juxt (constantly "Collection") :id)
                         :model/Collection
                         {:where [:and
                                  [:= :namespace (name collections/transforms-ns)]
                                  [:= :location "/"]
                                  [:not :archived]]}))
     (when (rs-settings/library-is-remote-synced?)
       (t2/select-fn-set (juxt (constantly "Collection") :id)
                         :model/Collection
                         {:where [:and
                                  [:= :namespace "snippets"]
                                  [:= :location "/"]
                                  [:not :archived]]})))
    :derived
    nil))

(defmethod query-export-roots :setting
  [{:keys [export-scope model-key model-type conditions] :as spec}]
  (when (spec-enabled? spec)
    (case export-scope
      :root-only
      (apply t2/select-fn-set (juxt (constantly model-type) :id) model-key
             :collection_id nil
             (into [] cat conditions))
      :all
      (apply t2/select-fn-set (juxt (constantly model-type) :id) model-key
             (into [] cat conditions))
      nil)))

(defmethod query-export-roots :published-table [_] nil)
(defmethod query-export-roots :parent-table [_] nil)

(defmethod query-export-roots :library-synced
  [{:keys [export-scope model-key model-type archived-key] :as spec}]
  (when (spec-enabled? spec)
    (case export-scope
      :all
      (if archived-key
        (t2/select-fn-set (juxt (constantly model-type) :id) model-key archived-key false)
        (t2/select-fn-set (juxt (constantly model-type) :id) model-key))
      nil)))

(defmethod query-export-roots :default [_] nil)

(defn- resolve-targets
  "Expands collection IDs to include all descendant collections.
   Takes a set of collection IDs and returns a set including the original IDs
   plus all IDs of nested collections."
  [targets opts]
  (when (seq targets)
    (merge-with into
                (u/traverse targets #(serdes/descendants (first %) (second %) opts))
                (u/traverse targets #(serdes/required (first %) (second %))))))

(defn extract-entities-for-export
  "Extracts all entities for remote-sync export based on enabled specs.

   Returns a lazy sequence of serialized entities ready for storage.

   Iterates over enabled specs and uses `query-export-roots` to find root targets
   for each model type. Models with `:export-scope :derived` or no export-scope
   are expanded from other targets via serdes/descendants.

   Only extracts models that:
   1. Have a spec in remote-sync-specs
   2. Are currently enabled (based on :enabled? field)
   3. Are in one of the provided collections (or descendants)"
  []
  (let [specs (enabled-specs)
        ;; Collect all root targets by iterating over enabled specs
        root-targets (into []
                           (comp (map val)
                                 (mapcat query-export-roots)
                                 (filter identity))
                           specs)]
    (when-let [targets (resolve-targets
                        root-targets
                        {:include-field-values false
                         :include-database-secrets false
                         :continue-on-error false
                         :skip-archived true})]
      (eduction (map (fn [[model ids]]
                       (serdes/extract-all model {:where [:in :id ids]
                                                  :skip-archived true})))
                cat
                (u/group-by first second (keys targets))))))
