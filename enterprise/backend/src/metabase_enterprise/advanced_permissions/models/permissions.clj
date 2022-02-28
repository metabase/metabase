(ns metabase-enterprise.advanced-permissions.models.permissions
  (:require [metabase.models.permissions :as perms :refer [Permissions]]
            [metabase.models.table :refer [Table]]
            [metabase.util.honeysql-extensions :as hx]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(defn- perms-path
  [perm-type perm-value base-path]
  (case [perm-type perm-value]
    [:download :full]
    (str "/download" base-path)

    [:download :limited]
    (str "/download/limited" base-path)))

(defn- data-perms-path
  [perm-type perm-value db-id & [schema-name table-id]]
  (perms-path perm-type perm-value (apply perms/data-perms-path
                                          (remove nil? [db-id schema-name table-id]))))

(defn- native-perms-path
  [perm-type perm-value db-id]
  (perms-path perm-type perm-value (perms/adhoc-native-query-path db-id)))

(defn- all-schemas-path
  [perm-type perm-value db-id]
  (perms-path perm-type perm-value (perms/all-schemas-path db-id)))

(defn- revoke-permissions!
  {:arglists '([perm-type perm-value group-id database-or-id]
               [perm-type perm-value group-id database-or-id schema-name]
               [perm-type perm-value group-id database-or-id schema-name table-or-id])}
  [perm-type perm-value group-id & path-components]
  (perms/delete-related-permissions! group-id (apply (partial data-perms-path perm-type perm-value)
                                                     path-components)))

(defn- revoke-schema-permissions!
  [perm-type perm-value group-id db-id]
  (perms/delete-related-permissions! group-id
                                     (data-perms-path perm-type perm-value db-id)
                                     [:not= :object (native-perms-path perm-type perm-value db-id)]))

(defn- revoke-native-permissions!
  [perm-type perm-value group-id db-id]
  (perms/delete-related-permissions! group-id (native-perms-path perm-type perm-value db-id)))

(defn- grant-permissions-for-all-schemas!
  [perm-type perm-value group-id db-id]
  (perms/grant-permissions! group-id (all-schemas-path perm-type perm-value db-id)))

(defn- grant-native-permissions!
  [perm-type perm-value group-id db-id]
  (perms/grant-permissions! group-id (native-perms-path perm-type perm-value db-id)))

(defn- update-table-download-permissions!
  [group-id db-id schema table-id new-table-perms]
  (condp = new-table-perms
    :full
    (do
      (revoke-permissions! :download :full group-id db-id schema table-id)
      (revoke-permissions! :download :limited group-id db-id schema table-id)
      (perms/grant-permissions! group-id (data-perms-path :download :full db-id schema table-id)))

    :limited
    (do
      (revoke-permissions! :download :full group-id db-id schema table-id)
      (revoke-permissions! :download :limited group-id db-id schema table-id)
      (perms/grant-permissions! group-id (data-perms-path :download :limited db-id schema table-id)))

    :none
    (do
      (revoke-permissions! :download :full group-id db-id schema table-id)
      (revoke-permissions! :download :limited group-id db-id schema table-id))))

(defn- update-schema-download-permissions!
  [group-id db-id schema new-schema-perms]
  (condp = new-schema-perms
    :full
    (do
      (revoke-permissions! :download :full group-id db-id schema)
      (revoke-permissions! :download :limited group-id db-id schema)
      (perms/grant-permissions! group-id (data-perms-path :download :full db-id schema)))

    :limited
    (do
      (revoke-permissions! :download :full group-id db-id schema)
      (revoke-permissions! :download :limited group-id db-id schema)
      (perms/grant-permissions! group-id (data-perms-path :download :limited db-id schema)))

    :none
    (do
      (revoke-permissions! :download :full group-id db-id schema)
      (revoke-permissions! :download :limited group-id db-id schema))

    (when (map? new-schema-perms)
      (doseq [[table-id table-perms] new-schema-perms]
        (update-table-download-permissions! group-id db-id schema table-id table-perms)))))

(defn- download-permissions-set
  [group-id]
  (map :object
       (db/select [Permissions :object]
                  {:where [:and
                           [:= :group_id group-id]
                           [:or
                            [:= :object (hx/literal "/")]
                            [:like :object (hx/literal "/download/%")]]]})))

(defn- download-permissions-level
  [permissions-set db-id & [schema-name table-id]]
  (cond
   (perms/set-has-full-permissions? permissions-set (data-perms-path :download :full db-id schema-name table-id))
   :full

   (perms/set-has-full-permissions? permissions-set (data-perms-path :download :limited db-id schema-name table-id))
   :limited

   :else
   :none))

(s/defn ^:private update-native-download-permissions!
  "To update native download permissions, we must read the list of tables in the database, and check the group's
   download permission level for each one.
     - If they have full download permissions for all tables, they have full native download permissions.
     - If they have *at least* limited download permissions for all tables, they have limited native download
       permissions.
     - If they have no download permissions for at least one table, they have no native download permissions."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero]
  (doseq [perm-value [:full :limited]]
    (revoke-native-permissions! :download perm-value group-id db-id))
  (let [permissions-set (download-permissions-set group-id)
        table-ids-and-schemas (db/select-id->field :schema Table :db_id db-id)
        native-perm-level (reduce (fn [highest-seen-perm-level [table-id table-schema]]
                                    (let [table-perm-level (download-permissions-level permissions-set
                                                                                       db-id
                                                                                       table-schema
                                                                                       table-id)]
                                      (cond
                                        (or (= highest-seen-perm-level :none)
                                            (= table-perm-level :none))
                                        :none

                                        (or (= highest-seen-perm-level :limited)
                                            (= table-perm-level :limited))
                                        :limited

                                        :else
                                        :full)))
                                  :full
                                  (seq table-ids-and-schemas))]
    (when (not= native-perm-level :none)
      (grant-native-permissions! :download native-perm-level group-id db-id))))

(s/defn update-db-download-permissions!
  "Update the download permissions graph for a database.

  This mostly works similar to [[metabase.models.permission/update-db-data-access-permissions!]], with a few key
  differences:
    - Permissions have three levels: full, limited, and none.
    - Native query download permissions are fully inferred from the non-native download permissions. For more details,
      see the docstring for [[update-native-download-permissions!]]."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero new-download-perms :- perms/DownloadPermissionsGraph]
  (when-let [schemas (:schemas new-download-perms)]
    (condp = schemas
      :full
      (do
        (revoke-schema-permissions! :download :full group-id db-id)
        (revoke-schema-permissions! :download :limited group-id db-id)
        (grant-permissions-for-all-schemas! :download :full group-id db-id))

      :limited
      (do
        (revoke-schema-permissions! :download :full group-id db-id)
        (revoke-schema-permissions! :download :limited group-id db-id)
        (grant-permissions-for-all-schemas! :download :limited group-id db-id))

      :none
      (do
        (revoke-schema-permissions! :download :full group-id db-id)
        (revoke-schema-permissions! :download :limited group-id db-id))

      (when (map? schemas)
        (doseq [[schema new-schema-perms] (seq schemas)]
          (update-schema-download-permissions! group-id db-id schema new-schema-perms)))))
  ;; We need to call update-native-download-permissions! whenever any download permissions are changed, but after we've
  ;; updated non-native donwload permissions. This is because native download permissions are fully computed from the
  ;; non-native download permissions.
  (update-native-download-permissions! group-id db-id))
