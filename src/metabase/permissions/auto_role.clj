(ns metabase.permissions.auto-role
  (:require [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.permissions.models.data-permissions :as data-perms]
            [metabase.query-processor :as qp]
            [toucan2.core :as t2])
  (:import (java.sql Connection)))

(defn- auto-role-name [group-id]
  (str "metabase$_auto_group_" group-id))

(defn role-exists? [conn group-id]
  (let [rs (t2/query-one conn {:select [[:%count.* :count]]
                               :from   [[:pg_roles :r]]
                               :where  [:= :rolname (auto-role-name group-id)]})]
    (< 0 (:count rs))))

(defn create-role! [conn group-id]
  (when-not (role-exists? conn group-id)
    (t2/query conn [(str "CREATE ROLE " (auto-role-name group-id))])
    (println "Created role" (auto-role-name group-id))))

(defn- get-tables-with-permission
  [graph permission]
  (let [view-data (-> graph
                      first
                      last
                      last
                      last
                      :perms/view-data)]
    (let [tables (mapcat (fn [[schema, table-perms]]
                           (map (fn [[table-id _]] [schema table-id])
                                (filter (fn [[_ perm]] (= perm permission)) table-perms)))  view-data)
          table-names (into {} (map (juxt :id :name)
                                    (if (empty? tables) [] (t2/select [:model/Table :id :name :active] {:where [:and [:= :active true] [:in :id (map last tables)]]}))))]
      (filter some? (map (fn [[schema, table-id]] (let [name (get table-names table-id)] (when name [schema, name]))) tables)))))

(defn auto-role! [db-id group-id]
  (let [conn (sql-jdbc.conn/db->pooled-connection-spec db-id)]
    (t2/query conn ["SET ROLE metabase"])
    (create-role! conn group-id)
    (let [graph (data-perms/data-permissions-graph {:group-id group-id :db-id db-id})]
      (mapv (fn [[schema table]]
              (println "Revoking " (str schema "." table) "permissions from" (auto-role-name group-id))
              (t2/query conn [(str "REVOKE ALL ON " schema "." table " FROM " (auto-role-name group-id))]))
            (get-tables-with-permission graph :blocked))
      (mapv (fn [[schema table]]
              (println "Adding" (str schema "." table) "permissions to" (auto-role-name group-id))
              (t2/query conn [(str "GRANT SELECT ON " schema "." table " TO " (auto-role-name group-id))]))
            (get-tables-with-permission graph :unrestricted)))))
