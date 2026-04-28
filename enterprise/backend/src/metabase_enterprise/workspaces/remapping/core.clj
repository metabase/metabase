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
    "Returns remappings for `db-id` as {[from-schema from-table] [to-schema to-table], ...}."))

;;; -------------------------------------------- App-DB Implementation ---------------------------------------------

(defrecord AppDBRemappingStore []
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (t2/exists? :model/TableRemapping :database_id db-id))
  (remappings-for-db* [_ db-id]
    (into {}
          (map (fn [row]
                 [[(:from_schema row) (:from_table_name row)]
                  [(:to_schema row) (:to_table_name row)]]))
          (t2/select :model/TableRemapping :database_id db-id))))

(def app-db-store
  "Default remapping store backed by the `table_remapping` app-DB table."
  (->AppDBRemappingStore))

;;; ----------------------------------------- Map-backed Implementation --------------------------------------------

(defrecord MapRemappingStore [mappings]
  ;; mappings is {db-id {[from-schema from-table] [to-schema to-table], ...}}
  RemappingStore
  (enabled-for-db?* [_ db-id]
    (boolean (seq (get mappings db-id))))
  (remappings-for-db* [_ db-id]
    (get mappings db-id {})))

(defn map-store
  "Create a remapping store backed by a plain map. For testing.

   Example:
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

     {[from-schema from-table] [to-schema to-table], ...}

   Returns empty map if no remappings exist."
  [db-id]
  (remappings-for-db* *remapping-store* db-id))
