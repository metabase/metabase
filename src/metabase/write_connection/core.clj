(ns metabase.write-connection.core
  "Core functionality for separate write connections (PRO-86).

  This namespace provides OSS stubs for the write connection functions.
  Enterprise implementations override these in metabase-enterprise.write-connection.core."
  (:require
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise get-write-database-id
  "Returns the write database ID for the given database, or nil if not configured.
   OSS implementation: always returns nil (no write connection feature)."
  metabase-enterprise.write-connection.core
  [_db-or-id]
  nil)

(defenterprise get-effective-database-id
  "Returns the database ID to use for write operations.
   OSS implementation: always returns the original database ID."
  metabase-enterprise.write-connection.core
  [db-or-id]
  (if (map? db-or-id) (:id db-or-id) db-or-id))

(defn using-write-connection?
  "Returns true if db has :connection/type :write.
   Useful for conditional logging or behavior when using a write connection."
  [db]
  (= :write (:connection/type db)))

(defenterprise get-effective-database
  "Returns the effective database for write operations, tagged with :connection/type.
   OSS implementation: always returns the original database with :connection/type :primary."
  metabase-enterprise.write-connection.core
  [db-or-id]
  (let [db (if (map? db-or-id)
             db-or-id
             ((requiring-resolve 'toucan2.core/select-one) :model/Database :id db-or-id))]
    (assoc db :connection/type :primary)))
