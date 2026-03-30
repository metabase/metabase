(ns metabase-enterprise.checker.store
  "Checker store — source + file index + ID registry + entity caches.

   The store is an atom holding:
   - A MetadataSource for resolving entities from disk/memory
   - A file index of all known refs by kind
   - A fields-by-table index for efficient table→fields lookup
   - A bidirectional ID registry (portable refs ↔ synthetic integer IDs)
   - Entity caches (raw data with :id stamped on)

   All mutable state lives in the store atom. There are no dynamic vars —
   the store is passed explicitly to every function that needs it."
  (:require
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Index utilities
;;; ===========================================================================

(defn- build-fields-by-table
  "Build a map of table-path → set-of-field-paths from a field index.
   Field paths are [db schema table field]; table path is the first 3 elements."
  [field-index]
  (reduce-kv (fn [m field-path _file]
               (let [table-path (subvec field-path 0 3)]
                 (update m table-path (fnil conj #{}) field-path)))
             {}
             field-index))

;;; ===========================================================================
;;; Store creation
;;; ===========================================================================

(defn make-store
  "Create a fresh store for a checking session.

   `source` is a MetadataSource for resolving entities.
   `index` is a file index: `{kind {ref file-path}}` where kind is
   :database, :table, :field, :card."
  [source index]
  (atom {:source          source
         :index           index
         :fields-by-table (build-fields-by-table (:field index))
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

(defn in-index?
  "Is `ref` known in the file index under `kind`?"
  [store kind ref]
  (contains? (get-in @store [:index kind]) ref))

(defn index-kind-of
  "Return the kind of an entity-id in the index, or nil if not found."
  [store entity-id]
  (cond
    (in-index? store :collection entity-id) :collection
    (in-index? store :card entity-id)       :card
    (in-index? store :dashboard entity-id)  :dashboard
    (in-index? store :document entity-id)   :document
    (in-index? store :measure entity-id)    :measure
    (in-index? store :segment entity-id)    :segment
    :else nil))

(defn index-file
  "Get the file path for a ref of a given kind from the index, or nil."
  [store kind ref]
  (get-in @store [:index kind ref]))

(defn all-database-names
  "All database names from the file index."
  [store]
  (all-refs store :database))

(defn all-table-paths
  "All table paths from the file index."
  [store]
  (all-refs store :table))

(defn all-field-paths
  "All field paths from the file index."
  [store]
  (all-refs store :field))

(defn all-card-ids
  "All card entity-ids from the file index."
  [store]
  (all-refs store :card))

(defn fields-for-table
  "Field paths belonging to a specific table path."
  [store table-path]
  (get-in @store [:fields-by-table table-path]))

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

(defn source
  "Get the MetadataSource from the store."
  [store]
  (:source @store))

(defn cached-entity
  "Look up a cached entity by kind and ref. Returns nil if not cached."
  [store kind ref]
  (get-in @store [:entities kind ref]))

(defn- cache-entity! [store kind ref data]
  (swap! store assoc-in [:entities kind ref] data)
  data)

(defn load-database!
  "Load and cache a database, assigning it an integer ID. Returns data or nil."
  [store db-name]
  (or (cached-entity store :database db-name)
      (when-let [data (source/resolve-database (source store) db-name)]
        (let [id (get-or-assign! store :database db-name)]
          (cache-entity! store :database db-name (assoc data :id id))))))

(defn load-table!
  "Load and cache a table, assigning it and its database integer IDs."
  [store table-path]
  (or (cached-entity store :table table-path)
      (when-let [data (source/resolve-table (source store) table-path)]
        (let [[db-name _ _] table-path
              id    (get-or-assign! store :table table-path)
              db-id (get-or-assign! store :database db-name)]
          (cache-entity! store :table table-path (assoc data :id id :db_id db-id))))))

(defn load-field!
  "Load and cache a field, assigning it and its table integer IDs."
  [store field-path]
  (or (cached-entity store :field field-path)
      (when-let [data (source/resolve-field (source store) field-path)]
        (let [[db-name schema table-name _] field-path
              id       (get-or-assign! store :field field-path)
              table-id (get-or-assign! store :table [db-name schema table-name])]
          (cache-entity! store :field field-path (assoc data :id id :table_id table-id))))))

(defn load-card!
  "Load and cache a card, assigning it an integer ID."
  [store entity-id]
  (or (cached-entity store :card entity-id)
      (when-let [data (source/resolve-card (source store) entity-id)]
        (let [id (get-or-assign! store :card entity-id)]
          (cache-entity! store :card entity-id (assoc data :id id))))))
