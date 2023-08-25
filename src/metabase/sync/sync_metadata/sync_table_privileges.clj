(ns metabase.sync.sync-metadata.sync-table-privileges
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.db.insert :as mdb.insert]
   [metabase.driver :as driver]
   [metabase.driver.util :as driver.u]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mu/defn sync-table-privileges!
  "Sync the `table_privileges` table with the privileges in the database.

   This is a cache of the data returned from `driver/table-privileges`, but it's stored in the database for performance."
  [database :- (mi/InstanceOf :model/Database)]
  (let [driver (driver.u/database->driver database)]
    (when (contains? (methods driver/table-privileges) driver)
      (let [rows               (drop 1 (driver/table-privileges driver database))
            schema+table->id   (t2/select-fn->pk (fn [t] {:schema (:schema t), :table (:name t)}) 'Table :db_id (:id database))
            rows-with-table-id (keep (fn [row]
                                       (when-let [table-id (get schema+table->id {:schema (nth row 2), :table (nth row 3)})]
                                         [table-id
                                          (nth row 0)
                                          (nth row 1)
                                          ;; remove schema and table name
                                          (nth row 4)
                                          (nth row 5)
                                          (nth row 6)
                                          (nth row 7)]))
                                     rows)
            columns            ["table_id"
                                "role"
                                "is_current_user"
                                "select"
                                "update"
                                "insert"
                                "delete"]]
        (t2/with-transaction [conn]
          (jdbc/execute! {:connection conn}
                         (sql/format {:delete-from [:table_privileges :tp]
                                      :where       [:in :tp.table_id {:select [:t.id]
                                                                      :from   [[:metabase_table :t]]
                                                                      :where  [:= :t.db_id (:id database)]}]})))
          {:total-table-privileges (mdb.insert/bulk-insert!
                                    (t2/table-name :model/TablePrivileges)
                                    columns
                                    rows-with-table-id)}))))
