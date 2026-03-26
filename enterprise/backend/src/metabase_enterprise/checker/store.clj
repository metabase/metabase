(ns metabase-enterprise.checker.store
  "Checker store — source + ID registry + entity caches.

   The store is an atom holding:
   - A MetadataSource for resolving entities from disk/memory
   - Enumerator thunks for listing all entities by kind
   - A bidirectional ID registry (portable refs ↔ synthetic integer IDs)
   - Entity caches (raw data with :id stamped on)

   All mutable state lives in the store atom. There are no dynamic vars —
   the store is passed explicitly to every function that needs it."
  (:require
   [metabase-enterprise.checker.source :as source]))

(set! *warn-on-reflection* true)

;;; ===========================================================================
;;; Store creation
;;; ===========================================================================

(defn make-store
  "Create a fresh store for a checking session.

   `enumerators` is a map of thunks returning sets of all entities of each kind:
   :databases → (fn [] #{\"db-name\" ...})
   :tables    → (fn [] #{[\"db\" \"schema\" \"table\"] ...})
   :fields    → (fn [] #{[\"db\" \"schema\" \"table\" \"field\"] ...})
   :cards     → (fn [] #{\"entity-id\" ...})"
  [source enumerators]
  (atom {:source      source
         :enumerators enumerators
         :id-counter  0
         :ref->id     {}                ; {kind {ref id}}
         :id->ref     {}                ; {kind {id ref}}
         :entities    {}})) ; {kind {ref data}}

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

(defn all-refs
  "All refs of a given kind that have been assigned IDs."
  [store kind]
  (keys (get-in @store [:ref->id kind])))

;;; ===========================================================================
;;; Entity loading — lazy load from source, cache with assigned IDs
;;; ===========================================================================

(defn source
  "Get the MetadataSource from the store."
  [store]
  (:source @store))

(defn enumerator
  "Get the enumerator thunk for a given kind."
  [store kind]
  (get-in @store [:enumerators kind]))

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
