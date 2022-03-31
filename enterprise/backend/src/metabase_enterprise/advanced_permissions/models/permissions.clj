(ns metabase-enterprise.advanced-permissions.models.permissions
  (:require [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.schema :as su]
            [schema.core :as s]))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Shared Util Functions                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- grant-permissions!
  {:arglists '([perm-type perm-value group-id db-id]
               [perm-type perm-value group-id db-id schema-name]
               [perm-type perm-value group-id db-id schema-name table-or-id])}
  [perm-type perm-value group-id & path-components]
  (perms/grant-permissions! group-id (perms/base->feature-perms-path
                                      perm-type
                                      perm-value
                                      (apply perms/data-perms-path path-components))))

(defn- revoke-permissions!
  {:arglists '([perm-type perm-value group-id db-id]
               [perm-type perm-value group-id db-id schema-name]
               [perm-type perm-value group-id db-id schema-name table-or-id])}
  [perm-type perm-value group-id & path-components]
  (perms/delete-related-permissions! group-id
                                     (apply (partial perms/feature-perms-path perm-type perm-value) path-components)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Download permissions                                                  |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- all-schemas-path
  [perm-type perm-value db-id]
  (perms/base->feature-perms-path perm-type perm-value (perms/all-schemas-path db-id)))

(defn- grant-permissions-for-all-schemas!
  [perm-type perm-value group-id db-id]
  (perms/grant-permissions! group-id (all-schemas-path perm-type perm-value db-id)))

(defn- revoke-download-permissions!
  {:arglists '([group-id db-id]
               [group-id db-id schema-name]
               [group-id db-id schema-name table-or-id])}
  [group-id & path-components]
  (apply (partial revoke-permissions! :download :full group-id) path-components)
  (apply (partial revoke-permissions! :download :limited group-id) path-components))

(defn- update-table-download-permissions!
  [group-id db-id schema table-id new-table-perms]
  (condp = new-table-perms
    :full
    (do
      (revoke-download-permissions! group-id db-id schema table-id)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :full db-id schema table-id)))

    :limited
    (do
      (revoke-download-permissions! group-id db-id schema table-id)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :limited db-id schema table-id)))

    :none
    (revoke-download-permissions! group-id db-id schema table-id)))

(defn- update-schema-download-permissions!
  [group-id db-id schema new-schema-perms]
  (condp = new-schema-perms
    :full
    (do
      (revoke-download-permissions! group-id db-id schema)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :full db-id schema)))

    :limited
    (do
      (revoke-download-permissions! group-id db-id schema)
      (perms/grant-permissions! group-id (perms/feature-perms-path :download :limited db-id schema)))

    :none
    (revoke-download-permissions! group-id db-id schema)

    (when (map? new-schema-perms)
      (doseq [[table-id table-perms] new-schema-perms]
        (update-table-download-permissions! group-id db-id schema table-id table-perms)))))

(s/defn update-db-download-permissions!
  "Update the download permissions graph for a database.

  This mostly works similar to [[metabase.models.permission/update-db-data-access-permissions!]], with a few key
  differences:
    - Permissions have three levels: full, limited, and none.
    - Native query download permissions are fully inferred from the non-native download permissions. For more details,
      see the docstring for [[metabase.models.permissions/update-native-download-permissions!]]."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero new-download-perms :- perms/DownloadPermissionsGraph]
  (when-not (premium-features/enable-advanced-permissions?)
    (throw (perms/ee-permissions-exception :download)))
  (when-let [schemas (:schemas new-download-perms)]
    (condp = schemas
      :full
      (do
        (revoke-download-permissions! group-id db-id)
        (grant-permissions-for-all-schemas! :download :full group-id db-id))

      :limited
      (do
        (revoke-download-permissions! group-id db-id)
        (grant-permissions-for-all-schemas! :download :limited group-id db-id))

      :none
      (revoke-download-permissions! group-id db-id)

      (when (map? schemas)
        (doseq [[schema new-schema-perms] (seq schemas)]
          (update-schema-download-permissions! group-id db-id schema new-schema-perms))))
    ;; We need to call update-native-download-permissions! whenever any download permissions are changed, but after we've
    ;; updated non-native donwload permissions. This is because native download permissions are fully computed from the
    ;; non-native download permissions.
    (perms/update-native-download-permissions! group-id db-id)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Data model permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn- update-table-data-model-permissions!
  [group-id db-id schema table-id new-table-perms]
  (condp = new-table-perms
    :all
    (do
      (revoke-permissions! :data-model :all group-id db-id schema table-id)
      (grant-permissions! :data-model :all group-id db-id schema table-id))

    :none
    (revoke-permissions! :data-model :all group-id db-id schema table-id)))

(defn- update-schema-data-model-permissions!
  [group-id db-id schema new-schema-perms]
  (condp = new-schema-perms
    :all
    (do
      (revoke-permissions! :data-model :all group-id db-id schema)
      (grant-permissions! :data-model :all group-id db-id schema))

    :none
    (revoke-permissions! :data-model :all group-id db-id schema)

    (when (map? new-schema-perms)
      (doseq [[table-id table-perms] new-schema-perms]
        (update-table-data-model-permissions! group-id db-id schema table-id table-perms)))))

(s/defn update-db-data-model-permissions!
  "Update the data model permissions graph for a database."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero new-data-model-perms :- perms/DataModelPermissionsGraph]
  (when-not (premium-features/enable-advanced-permissions?)
    (throw (perms/ee-permissions-exception :data-model)))
  (when-let [schemas (:schemas new-data-model-perms)]
    (condp = schemas
      :all
      (do
        (revoke-permissions! :data-model :all group-id db-id)
        (grant-permissions! :data-model :all group-id db-id))

      :none
      (revoke-permissions! :data-model :all group-id db-id)

      (when (map? schemas)
        (doseq [[schema new-schema-perms] (seq schemas)]
          (update-schema-data-model-permissions! group-id db-id schema new-schema-perms))))))
