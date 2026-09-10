(ns metabase-enterprise.data-apps.permissions
  (:require
   [metabase-enterprise.data-apps.db :as data-apps.db]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]))

(defenterprise data-app-view-data-permission-level
  "Use legacy across the database when an ordinary group needs it. A block on another table can deny legacy queries."
  :feature :none
  [database-id]
  (if (contains? (data-apps.db/databases-with-legacy-permissions [database-id]) database-id)
    :legacy-no-self-service
    :blocked))

(defn- database-level-permission?
  [rows value]
  (and (= 1 (count rows))
       (let [{:keys [table_id perm_value]} (first rows)]
         (and (nil? table_id) (= perm_value value)))))

(defn- reconcile-group-permissions!
  [permissions group-id database-id view-data]
  (let [permissions (if (database-level-permission? (get permissions [group-id database-id :perms/view-data]) view-data)
                      permissions
                      (do
                        (perms/set-database-permission! group-id database-id :perms/view-data view-data)
                        (perms/index-database-permissions [group-id] [database-id])))]
    ;; Joining a data app must not grant permissions other than "view data".
    (doseq [perm-type [:perms/create-queries :perms/download-results
                       :perms/manage-table-metadata :perms/manage-database :perms/transforms]
            :when (not (database-level-permission? (get permissions [group-id database-id perm-type]) :no))]
      (perms/set-database-permission! group-id database-id perm-type :no))))

(defenterprise reconcile-data-app-permissions!
  "Preserve ordinary groups' data access when app groups are created or database permissions change.
   Call under the global permissions lock so the source grants and app groups change together."
  :feature :none
  [database-ids]
  (when-let [group-ids (seq (data-apps.db/data-app-group-ids))]
    (let [legacy-databases (data-apps.db/databases-with-legacy-permissions database-ids)
          permissions (perms/index-database-permissions group-ids database-ids)]
      (doseq [group-id group-ids
              database-id database-ids]
        (reconcile-group-permissions! permissions group-id database-id
                                      (if (contains? legacy-databases database-id)
                                        :legacy-no-self-service
                                        :blocked))))))
