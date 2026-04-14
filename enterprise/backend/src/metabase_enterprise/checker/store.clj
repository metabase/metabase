(ns metabase-enterprise.checker.store
  "The store knows what entities exist and can load them.

   It combines three things:
   - A **SchemaSource** for resolving databases, tables, and fields
   - An **AssetsSource** for resolving cards, snippets, transforms, and segments
   - A **file index** that enumerates all known entities by kind and ref

   On top of that it maintains:
   - A bidirectional **ID registry** (portable refs ↔ synthetic integer IDs,
     because lib requires integer IDs)
   - **Entity caches** (loaded data with :id stamped on)

   Entities are loaded lazily from sources and cached on first access.
   The store is an atom passed explicitly — no dynamic vars."
  (:require
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Store creation
;;; ===========================================================================

(defn make-store
  "Create a fresh store for a checking session.

   `schema-source` is a SchemaSource for resolving databases/tables/fields.
   `assets-source` is an AssetsSource for resolving cards/snippets/transforms/segments.
   `index` is a file index: `{kind {ref file-path}}` — databases from the schema
   source, cards/dashboards/collections/transforms/segments/measures from assets."
  [schema-source assets-source index]
  (atom {:schema-source   schema-source
         :assets-source   assets-source
         :index           index
         :id-counter      0
         :ref->id         {}                ; {kind {ref id}}
         :id->ref         {}                ; {kind {id ref}}
         :entities        {}}))             ; {kind {ref data}}

;;; ===========================================================================
;;; Index queries
;;; ===========================================================================

(defn all-refs
  "All known refs of a given kind from the file index."
  [store kind]
  (keys (get-in @store [:index kind])))

(defn exists?
  "Is `ref` of `kind` known to the store?"
  [store kind ref]
  (contains? (get-in @store [:index kind]) ref))

(defn index-kind-of
  "Return the kind of an entity-id in the index, or nil if not found."
  [store entity-id]
  (cond
    (exists? store :collection entity-id) :collection
    (exists? store :card entity-id)       :card
    (exists? store :dashboard entity-id)  :dashboard
    (exists? store :document entity-id)   :document
    (exists? store :measure entity-id)    :measure
    (exists? store :segment entity-id)    :segment
    (exists? store :snippet entity-id)    :snippet
    (exists? store :transform entity-id)  :transform
    :else nil))

(defn index-file
  "Get the file path for a ref of a given kind from the index, or nil."
  [store kind ref]
  (get-in @store [:index kind ref]))

(defn all-database-names
  "All database names from the schema source."
  [store]
  (source/all-database-names (:schema-source @store)))

(defn all-table-paths
  "All table paths from the schema source."
  [store]
  (source/all-table-paths (:schema-source @store)))

(defn all-field-paths
  "All field paths from the schema source."
  [store]
  (source/all-field-paths (:schema-source @store)))

(defn all-card-ids
  "All card entity-ids from the file index."
  [store]
  (all-refs store :card))

(defn tables-for-database
  "Table paths belonging to a specific database."
  [store db-name]
  (source/tables-for-database (:schema-source @store) db-name))

(defn fields-for-table
  "Field paths belonging to a specific table path."
  [store table-path]
  (source/fields-for-table (:schema-source @store) table-path))

;;; ===========================================================================
;;; ID registry — assign synthetic integer IDs to portable refs
;;; ===========================================================================

(defn- next-id! [store]
  (:id-counter (swap! store update :id-counter inc)))

(defn get-or-assign!
  "Return the integer ID for `ref` under `kind`, assigning one if needed."
  [store kind ref]
  (or (get-in @store [:ref->id kind ref])
      (let [id (next-id! store)]
        (swap! store (fn [s]
                       (-> s
                           (assoc-in [:ref->id kind ref] id)
                           (assoc-in [:id->ref kind id] ref))))
        id)))

(defn id->ref
  "Look up the portable ref for an integer ID. Returns nil if unknown."
  [store kind id]
  (get-in @store [:id->ref kind id]))

(defn ref->id
  "Look up the integer ID for a portable ref. Returns nil if not yet assigned."
  [store kind ref]
  (get-in @store [:ref->id kind ref]))

;;; ===========================================================================
;;; Entity loading — lazy load from source, cache with assigned IDs
;;; ===========================================================================

(defn- schema-source [store]
  (:schema-source @store))

(defn- assets-source [store]
  (:assets-source @store))

(defn cached-entity
  "Look up a cached entity by kind and ref. Returns nil if not cached."
  [store kind ref]
  (get-in @store [:entities kind ref]))

(defn- cache-entity! [store kind ref data]
  (swap! store assoc-in [:entities kind ref] data)
  data)

;; --- Schema entities ---

(defn load-database!
  "Load and cache a database, assigning it an integer ID. Returns data or nil."
  [store db-name]
  (or (cached-entity store :database db-name)
      (when-let [data (source/resolve-database (schema-source store) db-name)]
        (let [id (get-or-assign! store :database db-name)]
          (cache-entity! store :database db-name (assoc data :id id))))))

(defn ensure-table-id!
  "Ensure a table path has an assigned integer ID and minimal metadata cached.
   Does NOT parse the table YAML — derives name/schema from the path.
   Use [[load-table!]] when full table data is needed."
  [store [db-name schema table-name :as table-path]]
  (or (cached-entity store :table table-path)
      (let [id    (get-or-assign! store :table table-path)
            db-id (get-or-assign! store :database db-name)]
        (cache-entity! store :table table-path
                       {:id    id
                        :db_id db-id
                        :name  table-name
                        :schema schema}))))

(defn load-table!
  "Load and cache a table, assigning it and its database integer IDs.
   Parses the table YAML for full metadata."
  [store table-path]
  (let [cached (cached-entity store :table table-path)]
    (if (and cached (contains? cached :display_name))
      ;; Already fully loaded
      cached
      ;; Load from YAML, merging with any existing minimal cache
      (when-let [data (source/resolve-table (schema-source store) table-path)]
        (let [[db-name _ _] table-path
              id    (get-or-assign! store :table table-path)
              db-id (get-or-assign! store :database db-name)]
          (cache-entity! store :table table-path (assoc data :id id :db_id db-id)))))))

(defn load-field!
  "Load and cache a field, assigning it and its table integer IDs."
  [store field-path]
  (or (cached-entity store :field field-path)
      (when-let [data (source/resolve-field (schema-source store) field-path)]
        (let [[db-name schema table-name _] field-path
              id       (get-or-assign! store :field field-path)
              table-id (get-or-assign! store :table [db-name schema table-name])]
          (cache-entity! store :field field-path (assoc data :id id :table_id table-id))))))

;; --- Asset entities ---

(defn load-card!
  "Load and cache a card, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :card entity-id)
      (when-let [data (source/resolve-card (assets-source store) entity-id)]
        (let [id (get-or-assign! store :card entity-id)]
          (cache-entity! store :card entity-id (assoc data :id id))))))

(defn load-snippet!
  "Load and cache a snippet, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :snippet entity-id)
      (when-let [data (source/resolve-snippet (assets-source store) entity-id)]
        (let [id (get-or-assign! store :snippet entity-id)]
          (cache-entity! store :snippet entity-id (assoc data :id id))))))

(defn load-transform!
  "Load and cache a transform, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :transform entity-id)
      (when-let [data (source/resolve-transform (assets-source store) entity-id)]
        (let [id (get-or-assign! store :transform entity-id)]
          (cache-entity! store :transform entity-id (assoc data :id id))))))

(defn load-segment!
  "Load and cache a segment, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :segment entity-id)
      (when-let [data (source/resolve-segment (assets-source store) entity-id)]
        (let [id (get-or-assign! store :segment entity-id)]
          (cache-entity! store :segment entity-id (assoc data :id id))))))

(defn load-dashboard!
  "Load and cache a dashboard, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :dashboard entity-id)
      (when-let [data (source/resolve-dashboard (assets-source store) entity-id)]
        (let [id (get-or-assign! store :dashboard entity-id)]
          (cache-entity! store :dashboard entity-id (assoc data :id id))))))

(defn load-collection!
  "Load and cache a collection, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :collection entity-id)
      (when-let [data (source/resolve-collection (assets-source store) entity-id)]
        (let [id (get-or-assign! store :collection entity-id)]
          (cache-entity! store :collection entity-id (assoc data :id id))))))

(defn load-document!
  "Load and cache a document, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :document entity-id)
      (when-let [data (source/resolve-document (assets-source store) entity-id)]
        (let [id (get-or-assign! store :document entity-id)]
          (cache-entity! store :document entity-id (assoc data :id id))))))

(defn load-measure!
  "Load and cache a measure, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :measure entity-id)
      (when-let [data (source/resolve-measure (assets-source store) entity-id)]
        (let [id (get-or-assign! store :measure entity-id)]
          (cache-entity! store :measure entity-id (assoc data :id id))))))
