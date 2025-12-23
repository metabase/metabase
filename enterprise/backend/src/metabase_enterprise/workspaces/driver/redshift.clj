(ns metabase-enterprise.workspaces.driver.redshift
  "Redshift-specific implementations for workspace isolation.

  Redshift differs from PostgreSQL:
  - DROP OWNED BY is not supported
  - Must revoke privileges from all granted schemas before dropping user"
  (:require
   [clojure.java.jdbc :as jdbc]
   [metabase-enterprise.workspaces.isolation :as isolation]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn])
  (:import
   (java.sql Connection Statement)))

(set! *warn-on-reflection* true)

#_{:clj-kondo/ignore [:discouraged-var]}
(defmethod driver/database-supports? [:redshift :workspace] [_driver _feature _db] true)

(defn- user-exists?
  "Check if a Redshift user exists."
  [conn username]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_user WHERE usename = ?" username])))

(defn- schema-exists?
  "Check if a schema exists in Redshift."
  [conn schema-name]
  (seq (jdbc/query conn ["SELECT 1 FROM pg_namespace WHERE nspname = ?" schema-name])))

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
      (let [user-exists    (user-exists? t-conn username)
            schema-exists  (schema-exists? t-conn schema-name)
            granted-schemas (when user-exists
                              (schemas-with-user-grants t-conn username))]
        (with-open [stmt (.createStatement ^Connection (:connection t-conn))]
          ;; Only revoke if user exists
          (when user-exists
            (doseq [schema granted-schemas]
              (.addBatch ^Statement stmt
                         ^String (format "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%s\" FROM \"%s\""
                                         schema username))
              (.addBatch ^Statement stmt
                         ^String (format "REVOKE ALL PRIVILEGES ON SCHEMA \"%s\" FROM \"%s\""
                                         schema username)))
            ;; Only revoke default privileges if both user and schema exist
            (when schema-exists
              (.addBatch ^Statement stmt
                         ^String (format "ALTER DEFAULT PRIVILEGES IN SCHEMA \"%s\" REVOKE ALL ON TABLES FROM \"%s\""
                                         schema-name username))))
          ;; These are safe with IF EXISTS
          (.addBatch ^Statement stmt
                     ^String (format "DROP SCHEMA IF EXISTS \"%s\" CASCADE" schema-name))
          (.addBatch ^Statement stmt
                     ^String (format "DROP USER IF EXISTS \"%s\"" username))
          (.executeBatch ^Statement stmt))))))
