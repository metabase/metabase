(ns metabase-enterprise.workspaces.remapping.core
  "Data-access layer for workspace table remappings.

   Access methods are defined as a protocol ([[RemappingStore]]). The default implementation
   reads from the `table_remapping` app-DB table via Toucan2. Tests can bind
   [[*remapping-store*]] with a simple map-backed implementation to avoid DB access."
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [metabase.app-db.core :as app-db]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me)

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Protocol --------------------------------------------------

(defprotocol RemappingStore
  "Protocol for accessing workspace table remappings.

   Reads are pure functions of `db-id`. Writes take pre-normalized 3-tuples
   `[db schema table]` -- callers should normalize `nil`/missing slots to the
   empty-string sentinel before invoking the store. The convenience writers in
   [[metabase-enterprise.workspaces.table-remapping]] do this normalization.

   Writes are idempotent on the `(database_id, from_db, from_schema, from_table_name)`
   unique key: duplicate inserts no-op, missing removes return 0."
  ;; reads
  (enabled-for-db?* [store db-id]
    "Returns true if `db-id` has any active workspace remappings.")
  (remappings-for-db* [store db-id]
    "Returns remappings for `db-id` as `{[from-db from-schema from-table] [to-db to-schema to-table], ...}`.

     Each tuple is 3-wide. Empty-string `\"\"` in `from-db`/`from-schema`/`to-db`/`to-schema`
     is the sentinel for \"this driver doesn't emit this level\" and is filtered out
     before being handed to SQLGlot.")
  (get-mapping* [store db-id from-tuple]
    "Targeted lookup: return the `[to-db to-schema to-table]` 3-tuple for `from-tuple`, or
     nil if no matching remap exists. AppDB impl uses an indexed select-one (matches the
     unique constraint on `(database_id, from_db, from_schema, from_table_name)`); MapStore
     does a hash-map get. Hot path -- called per-table during sync, so stays O(1) per call.")
  ;; writes
  (insert-mapping!* [store db-id from-tuple to-tuple]
    "Idempotently ensure a remapping exists. `from-tuple` and `to-tuple` are pre-normalized
     `[db schema table]` 3-tuples. Returns truthy when the remapping is in place after the
     call (whether this call inserted it or it already existed). Handles the concurrent-insert
     race portably -- callers don't see SQL state codes. Tuples must be all-string; use `\"\"`
     as the sentinel for slots a driver doesn't emit (nil slots are a contract violation).")
  (remove-mapping!* [store db-id from-tuple]
    "Remove a single remapping by source `from-tuple`. Returns the number of rows removed
     (0 or 1) as a long.")
  (clear-for-db!* [store db-id]
    "Remove all remappings for `db-id`. Returns the number of rows removed as a long."))

;;; -------------------------------------------- App-DB Implementation ---------------------------------------------

(defrecord AppDBRemappingStore []
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (t2/exists? :model/TableRemapping :database_id db-id))
  (remappings-for-db* [_ db-id]
    (into {}
          (map (fn [row]
                 [[(:from_db row) (:from_schema row) (:from_table_name row)]
                  [(:to_db row) (:to_schema row) (:to_table_name row)]]))
          (t2/select :model/TableRemapping :database_id db-id)))
  (get-mapping* [_ db-id [from-db from-schema from-table]]
    (when-let [row (t2/select-one :model/TableRemapping
                                  :database_id     db-id
                                  :from_db         from-db
                                  :from_schema     from-schema
                                  :from_table_name from-table)]
      [(:to_db row) (:to_schema row) (:to_table_name row)]))
  (insert-mapping!* [_ db-id [from-db from-schema from-table] [to-db to-schema to-table]]
    ;; Idempotent on the unique constraint `(database_id, from_db, from_schema, from_table_name)`.
    ;; `app-db/update-or-insert!` handles the concurrent-insert race portably -- if a duplicate
    ;; insert loses the race, it retries the lookup and returns the existing row's id. The
    ;; update-fn returns nil on existing (no-op).
    (app-db/update-or-insert!
     :model/TableRemapping
     {:database_id db-id, :from_db from-db, :from_schema from-schema, :from_table_name from-table}
     (fn [existing]
       (when-not existing
         {:to_db to-db, :to_schema to-schema, :to_table_name to-table}))))
  (remove-mapping!* [_ db-id [from-db from-schema from-table]]
    (long
     (t2/delete! :model/TableRemapping
                 :database_id     db-id
                 :from_db         from-db
                 :from_schema     from-schema
                 :from_table_name from-table)))
  (clear-for-db!* [_ db-id]
    (long (t2/delete! :model/TableRemapping :database_id db-id))))

(def app-db-store
  "Default remapping store backed by the `table_remapping` app-DB table."
  (->AppDBRemappingStore))

;;; ----------------------------------------- Map-backed Implementation --------------------------------------------

(defrecord MapRemappingStore [!mappings]
  ;; !mappings is an atom holding {db-id {[from-db from-schema from-table] [to-db to-schema to-table], ...}}.
  ;; Atom-backed so test code can write through `insert-mapping!*` / `remove-mapping!*`
  ;; without going through the app DB.
  ;;
  ;; Tuples MUST be 3-wide. The empty-string sentinel `""` is the only allowed value
  ;; for slots a driver doesn't emit -- the canonical shape across the whole codebase.
  ;; This impl does no normalization; tests get the same shape contract as production.
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (boolean (seq (get @!mappings db-id))))
  (remappings-for-db* [_ db-id]
    (get @!mappings db-id {}))
  (get-mapping* [_ db-id from-tuple]
    (get-in @!mappings [db-id from-tuple]))
  (insert-mapping!* [_ db-id from-tuple to-tuple]
    ;; Idempotent: if `from-tuple` already maps to anything, leave it alone (matches
    ;; `app-db/update-or-insert!`'s "no update" semantics). Either way return the pair
    ;; that's now in place so the caller sees a truthy result.
    (when-not (contains? (get @!mappings db-id {}) from-tuple)
      (swap! !mappings update db-id (fnil assoc {}) from-tuple to-tuple))
    [from-tuple (get-in @!mappings [db-id from-tuple])])
  (remove-mapping!* [_ db-id from-tuple]
    (if (contains? (get @!mappings db-id {}) from-tuple)
      (do (swap! !mappings update db-id dissoc from-tuple)
          1)
      0))
  (clear-for-db!* [_ db-id]
    (let [n (count (get @!mappings db-id {}))]
      (swap! !mappings dissoc db-id)
      n)))

(defn map-store
  "Create a mutable map-backed remapping store. For testing -- supports both reads and writes
   without app-DB access. **Single-threaded; not safe for concurrent writers** (the store
   reads-then-swaps to compute return values; multiple writers could race). Tests are
   single-threaded so this is fine; do not reach for this in production.

   `initial-mappings` is the seed value, consumed-into-an-atom (not held by reference).
   Tuples MUST be 3-wide `[db schema table]` with `\"\"` as the sentinel for slots a
   driver doesn't emit. This is the canonical shape used everywhere. The store does NOT
   widen 2-tuples; tests must pass the correct shape.

   Examples:
     (map-store {})
     (map-store {1 {[\"\" \"public\" \"orders\"] [\"\" \"mb_iso\" \"orders\"]}})
     (map-store {1 {[\"proj\" \"ds\" \"orders\"] [\"proj\" \"ws_ds\" \"orders\"]}})  ;; BigQuery"
  [initial-mappings]
  (->MapRemappingStore (atom initial-mappings)))

;;; ------------------------------------------------ Dynamic vars -------------------------------------------------

(def ^:dynamic *remapping-store*
  "The active remapping store. Defaults to [[app-db-store]]. Bind in tests to avoid DB access."
  app-db-store)

(def ^:dynamic *skip-remapping?*
  "When true, [[enabled-for-db?]] always returns false. Used by workspace execution contexts
   that need to query the isolation schema directly without remapping."
  false)

;;; ------------------------------------------------ Public API ---------------------------------------------------

(defn enabled-for-db?
  "Returns true if database `db-id` has any active workspace remappings.
   Returns false when [[*skip-remapping?*]] is true."
  [db-id]
  (and (not *skip-remapping?*)
       (enabled-for-db?* *remapping-store* db-id)))

(defn remappings-for-db
  "Returns a map of remappings for `db-id`:

     {[from-db from-schema from-table] [to-db to-schema to-table], ...}

   Each tuple is 3-wide. Empty-string `\"\"` in `from-db`/`from-schema`/`to-db`/`to-schema`
   is the sentinel for \"this driver doesn't emit this level.\"

   Returns empty map if no remappings exist."
  [db-id]
  (remappings-for-db* *remapping-store* db-id))

(defn get-mapping
  "Targeted lookup: return the `[to-db to-schema to-table]` tuple for `from-tuple`, or nil
   if no matching remap exists. Hot path during sync -- O(1) per call."
  [db-id from-tuple]
  (get-mapping* *remapping-store* db-id from-tuple))

(defn insert-mapping!
  "Idempotently ensure a remapping exists in the active store. Tuples are pre-normalized
   `[db schema table]` 3-tuples; callers in `metabase-enterprise.workspaces.table-remapping`
   normalize from `::table-spec` maps before calling.

   Returns truthy when the remapping is in place after the call (insert or already-existed)."
  [db-id from-tuple to-tuple]
  (insert-mapping!* *remapping-store* db-id from-tuple to-tuple))

(defn remove-mapping!
  "Remove a single remapping via the active store. Returns the number of rows removed."
  [db-id from-tuple]
  (remove-mapping!* *remapping-store* db-id from-tuple))

(defn clear-for-db!
  "Remove all remappings for `db-id` via the active store. Returns the number of rows removed."
  [db-id]
  (clear-for-db!* *remapping-store* db-id))
