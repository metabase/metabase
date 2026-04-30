(ns metabase-enterprise.workspaces.remapping.core
  "Data-access layer for workspace table remappings.

   Access methods are defined as a protocol ([[RemappingStore]]). The default implementation
   reads from the `table_remapping` app-DB table via Toucan2. Tests can bind
   [[*remapping-store*]] with a simple map-backed implementation to avoid DB access."
  (:require
   [metabase-enterprise.workspaces.models.table-remapping]
   [toucan2.core :as t2]))

(comment metabase-enterprise.workspaces.models.table-remapping/keep-me)

(set! *warn-on-reflection* true)

;;; ------------------------------------------------- Protocol --------------------------------------------------

(defprotocol RemappingStore
  "Protocol for accessing workspace table remappings."
  (enabled-for-db?* [store db-id]
    "Returns true if `db-id` has any active workspace remappings.")
  (remappings-for-db* [store db-id]
    "Returns remappings for `db-id` as `{[from-db from-schema from-table] [to-db to-schema to-table], ...}`.

     Each tuple is 3-wide. Empty-string `\"\"` in `from-db`/`from-schema`/`to-db`/`to-schema`
     is the sentinel for \"this driver doesn't emit this level\" and is filtered out
     before being handed to SQLGlot."))

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
          (t2/select :model/TableRemapping :database_id db-id))))

(def app-db-store
  "Default remapping store backed by the `table_remapping` app-DB table."
  (->AppDBRemappingStore))

;;; ----------------------------------------- Map-backed Implementation --------------------------------------------

(defrecord MapRemappingStore [mappings]
  ;; mappings is {db-id {[from-db from-schema from-table] [to-db to-schema to-table], ...}}
  ;; Tuples may be 2-wide for back-compat with existing tests; they're widened on read.
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (boolean (seq (get mappings db-id))))
  (remappings-for-db* [_ db-id]
    (into {}
          (map (fn [[from to]]
                 (let [widen #(if (= 2 (count %)) (into [""] %) %)]
                   [(widen from) (widen to)])))
          (get mappings db-id {}))))

(defn map-store
  "Create a remapping store backed by a plain map. For testing.

   Example (3-tuple keys, the canonical shape):
     (map-store {1 {[\"\" \"public\" \"orders\"] [\"\" \"mb_iso\" \"orders\"]}})

   Example (2-tuple keys, auto-widened with empty `db`):
     (map-store {1 {[\"public\" \"orders\"] [\"mb_iso\" \"orders\"]}})"
  [mappings]
  (->MapRemappingStore mappings))

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
