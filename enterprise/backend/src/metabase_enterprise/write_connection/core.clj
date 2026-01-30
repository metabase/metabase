(ns metabase-enterprise.write-connection.core
  "Core functionality for separate write connections (PRO-86).

  This namespace provides utilities to get the write database connection
  for a given database, which can be used by features that write to the
  database (Transforms, Actions, Table Editing, etc.)."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.warehouses.models.database :as database]
   [toucan2.core :as t2]))

(def ^{:arglists '([db-id])
       :private true}
  db-id->write-db-id
  "Returns the write_database_id for a given database ID, or nil if not configured.
   Delegates to [[database/db-id->write-db-id]]."
  database/db-id->write-db-id)

(defenterprise get-write-database-id
  "Returns the write database ID for the given database, or nil if not configured.
   Use this when you need to execute write operations (e.g., Transforms)
   with the separate write connection.

   If no write connection is configured, returns nil to indicate that the main
   connection should be used."
  :feature :advanced-permissions
  [db-or-id]
  (let [db-id (if (map? db-or-id) (:id db-or-id) db-or-id)]
    (db-id->write-db-id db-id)))

(defenterprise get-effective-database-id
  "Returns the database ID to use for write operations.
   If a write connection is configured, returns the write database ID.
   Otherwise returns the original database ID.

   Use this when you need to execute write operations and want to automatically
   use the write connection if available."
  :feature :advanced-permissions
  [db-or-id]
  (let [db-id (if (map? db-or-id) (:id db-or-id) db-or-id)]
    (or (db-id->write-db-id db-id) db-id)))

(defenterprise get-effective-database
  "Returns the effective database for write operations.
   Tags the returned map with :connection/type and :connection/parent-id
   so downstream code can distinguish the logical DB from the physical connection."
  :feature :advanced-permissions
  [db-or-id]
  (let [original-id (if (map? db-or-id) (:id db-or-id) db-or-id)
        write-db-id (db-id->write-db-id original-id)]
    (if write-db-id
      (-> (t2/select-one :model/Database :id write-db-id)
          (assoc :connection/type :write
                 :connection/parent-id original-id))
      (let [db (if (map? db-or-id)
                 db-or-id
                 (t2/select-one :model/Database :id original-id))]
        (assoc db :connection/type :primary)))))

(defn is-write-database?
  "Returns true if the given database is a write database (i.e., is referenced
   by another database's write_database_id)."
  [db]
  (t2/exists? :model/Database :write_database_id (:id db)))
