(ns metabase.sync.sync-metadata.sync-table-privileges
  (:require
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
    (when (and (not= :redshift driver)
               ;; redshift does support table-privileges, but we don't want to sync it now because table privileges are
               ;; meant to enhance action features, but redshift does not support actions for now, so we skip it here.
               (driver.u/supports? driver :table-privileges database))
      (let [rows               (driver/current-user-table-privileges driver database)
            schema+table->id   (t2/select-fn->pk (fn [t] {:schema (:schema t), :table (:name t)}) :model/Table :db_id (:id database))
            rows-with-table-id (keep (fn [row]
                                       (when-let [table-id (get schema+table->id (select-keys row [:schema :table]))]
                                         (-> row
                                             (assoc :table_id table-id)
                                             (dissoc :schema :table))))
                                     rows)]
        (t2/with-transaction [_conn]
          (t2/delete! :model/TablePrivileges :table_id [:in {:select [:t.id]
                                                             :from   [[:metabase_table :t]]
                                                             :where  [:= :t.db_id (:id database)]}])
          {:total-table-privileges (t2/insert! :model/TablePrivileges rows-with-table-id)})))))
