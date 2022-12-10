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
;;; |                                          Data model permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn data-model-write-perms-path
  "Returns the permissions path required to edit the data model for a table specified by `path-components`.
  This is a simple wrapper around `perms/feature-perms-path`, but it lives in an EE namespace to ensure that data model
  permissions only work when EE code can be loaded."
  [& path-components]
  (apply (partial perms/feature-perms-path :data-model :all) path-components))

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


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          Data model permissions                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(defn db-details-write-perms-path
  "Returns the permissions path required to edit the database details for the provided database ID.
  This is a simple wrapper around `perms/feature-perms-path`, but it lives in an EE namespace to ensure that database
  permissions only work when EE code can be loaded."
  [db-id]
  (perms/feature-perms-path :details :yes db-id))

(s/defn update-db-details-permissions!
  "Update the DB details permissions for a database."
  [group-id :- su/IntGreaterThanZero db-id :- su/IntGreaterThanZero new-perms :- perms/DetailsPermissions]
  (when-not (premium-features/enable-advanced-permissions?)
    (throw (perms/ee-permissions-exception :details)))
  (case new-perms
    :yes
    (do
      (revoke-permissions! :details :yes group-id db-id)
      (grant-permissions! :details :yes group-id db-id))

    :no
    (revoke-permissions! :details :yes group-id db-id)))
