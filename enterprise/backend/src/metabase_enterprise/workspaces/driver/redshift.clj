(ns metabase-enterprise.workspaces.driver.redshift
  "Redshift-specific implementations for workspace isolation.

  Redshift differs from PostgreSQL:
  - DROP OWNED BY is not supported
  - Must revoke privileges from all granted schemas before dropping user"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

(defn- schemas-with-user-grants
  "Query Redshift to find schemas where the user has been granted privileges."
  [conn username]
  (->> (jdbc/query conn
                   ["SELECT DISTINCT namespace_name FROM svv_relation_privileges
           WHERE identity_name = ? AND identity_type = 'user'"
                    username])
       (keep :namespace_name)))

(defmethod isolation/destroy-workspace-isolation! :redshift
  [database workspace]
  (let [schema-name (:schema workspace)
        username    (-> workspace :database_details :user)]
    (jdbc/with-db-transaction [t-conn (sql-jdbc.conn/db->pooled-connection-spec (:id database))]
      (let [granted-schemas (schemas-with-user-grants t-conn username)]
        (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
          (doseq [schema granted-schemas]
            (.addBatch ^Statement stmt
                       ^String (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%s\" FROM \"%s\""
                                       schema username))
            (.addBatch ^Statement stmt
                       ^String (format "REVOKE ALL PRIVILEGES ON SCHEMA \"%s\" FROM \"%s\""
                                       schema username)))
          (.addBatch ^Statement stmt
                     ^String (format "ALTER DEFAULT PRIVILEGES IN SCHEMA \"%s\" REVOKE ALL ON TABLES FROM \"%s\""
                                     schema-name username))
          (.addBatch ^Statement stmt
                     ^String (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name))
          (.addBatch ^Statement stmt
                     ^String (format "DROP USER IF EXISTS \"%s\"" username))
          (.executeBatch ^Statement stmt))))))
