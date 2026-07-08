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

   Reads are pure functions of `db-id`. Writes take pre-normalized `::table-spec` maps
   (`{:db, :schema, :table}`) — callers should normalize `nil`/missing slots to the
   empty-string sentinel before invoking the store. The convenience writers in
   [[metabase-enterprise.workspaces.table-remapping]] do this normalization.

   Writes are idempotent on the `(database_id, from_db, from_schema, from_table_name)`
   unique key: duplicate inserts no-op, missing removes return 0."
  ;; reads
  (enabled-for-db?* [store db-id]
    "Returns true if `db-id` has any active workspace remappings.")
  (remappings-for-db* [store db-id]
    "Returns remappings for `db-id` as `{from-spec to-spec, ...}` where each value is a
     `::table-spec` map (`{:db, :schema, :table}`).

     Empty-string `\"\"` in `:db` / `:schema` is the sentinel for \"this driver doesn't
     emit this level\" — pruned before being handed to SQLGlot.")
  (get-mapping* [store db-id from-spec]
    "Targeted lookup: return the to-side `::table-spec` for `from-spec`, or nil if no
     matching remap exists. AppDB impl uses an indexed select-one (matches the unique
     constraint on `(database_id, from_db, from_schema, from_table_name)`); MapStore
     does a hash-map get. Hot path -- called per-table during sync, so stays O(1) per call.")
  ;; writes
  (insert-mapping!* [store db-id from-spec to-spec]
    "Idempotently ensure a remapping exists. `from-spec` and `to-spec` are pre-normalized
     `::table-spec` maps. Returns truthy when the remapping is in place after the call
     (whether this call inserted it or it already existed). Handles the concurrent-insert
     race portably -- callers don't see SQL state codes. Spec slots must be all-string;
     use `\"\"` as the sentinel for slots a driver doesn't emit (nil slots are a contract
     violation).")
  (remove-mapping!* [store db-id from-spec]
    "Remove a single remapping by source `from-spec`. Returns the number of rows removed
     (0 or 1) as a long.")
  (clear-for-db!* [store db-id]
    "Remove all remappings for `db-id`. Returns the number of rows removed as a long."))

;;; -------------------------------------------- App-DB Implementation ---------------------------------------------

(defn- row->spec-pair
  "Project a `:model/TableRemapping` row into a `[from-spec to-spec]` pair."
  [row]
  [{:db (:from_db row) :schema (:from_schema row) :table (:from_table_name row)}
   {:db (:to_db row)   :schema (:to_schema row)   :table (:to_table_name row)}])

(defrecord AppDBRemappingStore []
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (t2/exists? :model/TableRemapping :database_id db-id))
  (remappings-for-db* [_ db-id]
    (into {} (map row->spec-pair) (t2/select :model/TableRemapping :database_id db-id)))
  (get-mapping* [_ db-id {:keys [db schema table]}]
    (when-let [row (t2/select-one :model/TableRemapping
                                  :database_id     db-id
                                  :from_db         db
                                  :from_schema     schema
                                  :from_table_name table)]
      {:db (:to_db row) :schema (:to_schema row) :table (:to_table_name row)}))
  (insert-mapping!* [_ db-id from-spec to-spec]
    ;; Idempotent on the unique constraint `(database_id, from_db, from_schema, from_table_name)`.
    ;; `app-db/update-or-insert!` handles the concurrent-insert race portably -- if a duplicate
    ;; insert loses the race, it retries the lookup and returns the existing row's id. The
    ;; update-fn returns nil on existing (no-op).
    (app-db/update-or-insert!
     :model/TableRemapping
     {:database_id     db-id
      :from_db         (:db from-spec)
      :from_schema     (:schema from-spec)
      :from_table_name (:table from-spec)}
     (fn [existing]
       (when-not existing
         {:to_db         (:db to-spec)
          :to_schema     (:schema to-spec)
          :to_table_name (:table to-spec)}))))
  (remove-mapping!* [_ db-id {:keys [db schema table]}]
    (long
     (t2/delete! :model/TableRemapping
                 :database_id     db-id
                 :from_db         db
                 :from_schema     schema
                 :from_table_name table)))
  (clear-for-db!* [_ db-id]
    (long (t2/delete! :model/TableRemapping :database_id db-id))))

(def app-db-store
  "Default remapping store backed by the `table_remapping` app-DB table."
  (->AppDBRemappingStore))

;;; ----------------------------------------- Map-backed Implementation --------------------------------------------

(defrecord MapRemappingStore [!mappings]
  ;; !mappings is an atom holding {db-id {from-spec to-spec, ...}}.
  ;; Atom-backed so test code can write through `insert-mapping!*` / `remove-mapping!*`
  ;; without going through the app DB.
  ;;
  ;; Specs MUST be `{:db, :schema, :table}` maps. The empty-string sentinel `""` is the
  ;; only allowed value for slots a driver doesn't emit -- the canonical shape across the
  ;; whole codebase. This impl does no normalization; tests get the same shape contract
  ;; as production.
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (boolean (seq (get @!mappings db-id))))
  (remappings-for-db* [_ db-id]
    (get @!mappings db-id {}))
  (get-mapping* [_ db-id from-spec]
    (get-in @!mappings [db-id from-spec]))
  (insert-mapping!* [_ db-id from-spec to-spec]
    ;; Idempotent: if `from-spec` already maps to anything, leave it alone (matches
    ;; `app-db/update-or-insert!`'s "no update" semantics). Either way return the pair
    ;; that's now in place so the caller sees a truthy result.
    (when-not (contains? (get @!mappings db-id {}) from-spec)
      (swap! !mappings update db-id (fnil assoc {}) from-spec to-spec))
    [from-spec (get-in @!mappings [db-id from-spec])])
  (remove-mapping!* [_ db-id from-spec]
    (if (contains? (get @!mappings db-id {}) from-spec)
      (do (swap! !mappings update db-id dissoc from-spec)
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
   Specs MUST be `::table-spec` maps `{:db :schema :table}` with `\"\"` as the sentinel
   for slots a driver doesn't emit. This is the canonical shape used everywhere.

   Examples:
     (map-store {})
     (map-store {1 {{:db \"\" :schema \"public\" :table \"orders\"}
                    {:db \"\" :schema \"mb_iso\" :table \"orders\"}}})
     (map-store {1 {{:db \"proj\" :schema \"ds\" :table \"orders\"}
                    {:db \"proj\" :schema \"ws_ds\" :table \"orders\"}}})  ;; BigQuery"
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

     {from-spec to-spec, ...}

   where each spec is a `::table-spec` map `{:db :schema :table}`. Empty-string `\"\"`
   in `:db`/`:schema` is the sentinel for \"this driver doesn't emit this level.\"

   Returns empty map if no remappings exist."
  [db-id]
  (remappings-for-db* *remapping-store* db-id))

(defn get-mapping
  "Targeted lookup: return the to-side `::table-spec` for `from-spec`, or nil if no
   matching remap exists. Hot path during sync -- O(1) per call."
  [db-id from-spec]
  (get-mapping* *remapping-store* db-id from-spec))

(defn insert-mapping!
  "Idempotently ensure a remapping exists in the active store. Specs MUST be
   pre-normalized `::table-spec` maps — `\"\"` (not nil) for slots a driver doesn't
   emit. The user-facing wrappers in `table-remapping` handle that normalization.

   Returns truthy when the remapping is in place after the call (insert or already-existed)."
  [db-id from-spec to-spec]
  (insert-mapping!* *remapping-store* db-id from-spec to-spec))

(defn remove-mapping!
  "Remove a single remapping via the active store. Returns the number of rows removed."
  [db-id from-spec]
  (remove-mapping!* *remapping-store* db-id from-spec))

(defn clear-for-db!
  "Remove all remappings for `db-id` via the active store. Returns the number of rows removed."
  [db-id]
  (clear-for-db!* *remapping-store* db-id))
