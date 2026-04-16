(ns metabase.permissions.test-util
  (:require
   [metabase.config.core :as config]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.test.data :as data]
   [metabase.test.initialize :as initialize]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms`."
  [thunk]
  ;; Select sandboxes _before_ permissions.
  (let [original-perms     (t2/select :model/Permissions)
        original-sandboxes (if config/ee-available?
                             (t2/select :model/Sandbox)
                             [])]
    (try
      (thunk)
      (finally
        (binding [perms/*allow-root-entries* true
                  perms/*allow-admin-permissions-changes* true]
          (when config/ee-available?
            (t2/delete! :model/Sandbox))
          (t2/delete! :model/Permissions)
          ;; Insert perms _before_ sandboxes because of a foreign key constraint on sandboxes.permission_id
          (t2/insert! :model/Permissions original-perms)
          (when config/ee-available?
            (t2/insert! :model/Sandbox original-sandboxes)))))))

(defmacro with-restored-perms!
  "Runs `body`, and restores permissions and sandboxes to their original state afterwards."
  [& body]
  `(do-with-restored-perms! (fn [] ~@body)))

(defn do-with-restored-data-perms!
  "Implementation of `with-restored-perms` and related helper functions. Optionally takes `group-ids` to restore only the
  permissions for a set of groups."
  [group-ids thunk]
  ;; make sure app DB is set up and test users are created
  (initialize/initialize-if-needed! :db :test-users)
  ;; make sure at least the normal test-data DB is loaded
  (data/db)
  (let [select-condition (if-not group-ids
                           true
                           [:in :group_id group-ids])
        original-perms (t2/select :model/DataPermissions {:where select-condition})]
    (try
      ;; TODO -- should this disabled the cache [[data-perms/*use-perms-cache?*]] ??
      (thunk)
      (finally
        (let [existing-db-ids    (t2/select-pks-set :model/Database)
              existing-table-ids (t2/select-pks-set :model/Table)
              still-valid-perms  (filter
                                  (fn [p] (and (contains? existing-db-ids (:db_id p))
                                               (or (nil? (:table_id p))
                                                   (contains? existing-table-ids (:table_id p)))))
                                  original-perms)]
          (t2/delete! :model/DataPermissions {:where select-condition})
          (t2/insert! :model/DataPermissions still-valid-perms))))))

(defmacro with-restored-data-perms!
  "Runs `body`, and restores all permissions to their original state afterwards."
  [& body]
  `(do-with-restored-data-perms! nil (fn [] ~@body)))

(defmacro with-restored-data-perms-for-group!
  "Runs `body`, and restores all permissions for `group-id` to their original state afterwards."
  [group-id & body]
  `(do-with-restored-data-perms! [~group-id] (fn [] ~@body)))

(defmacro with-restored-data-perms-for-groups!
  "Runs `body`, and restores all permissions for `group-ids` to their original state afterwards."
  [group-ids & body]
  `(do-with-restored-data-perms! ~group-ids (fn [] ~@body)))

(defn do-with-no-data-perms-for-all-users!
  "Implementation of `with-no-data-perms-for-all-users`. Sets every data permission for all databases to the
  least permissive value for the All Users permission group for the duration of the test."
  [thunk]
  ;; force creation of test-data if it is not already created
  (data/db)
  (with-restored-data-perms-for-group! (u/the-id (perms-group/all-users))
    (doseq [[perm-type _] permissions.schema/data-permissions
            db-id         (t2/select-pks-set :model/Database)]
      (data-perms/set-database-permission! (perms-group/all-users)
                                           db-id
                                           perm-type
                                           (data-perms/least-permissive-value perm-type)))
    (thunk)))

(defmacro with-no-data-perms-for-all-users!
  "Runs `body`, and sets every data permission for all databases to its least permissive value for the All Users
  permission group for the duration of the test. Restores the original permissions afterwards."
  [& body]
  `(do-with-no-data-perms-for-all-users! (fn [] ~@body)))

(defn do-with-full-data-perms-for-all-users!
  "Implementation of `with-full-data-perms-for-all-users`. Sets every data permission for all databases to the
  most permissive value for the All Users permission group for the duration of the test."
  [thunk]
  ;; make sure app DB is set up and test users are created
  (initialize/initialize-if-needed! :db :test-users)
  (with-restored-data-perms-for-group! (u/the-id (perms-group/all-users))
    (doseq [[perm-type _] permissions.schema/data-permissions
            db-id         (t2/select-pks-set :model/Database)]
      (data-perms/set-database-permission! (perms-group/all-users)
                                           db-id
                                           perm-type
                                           (data-perms/most-permissive-value perm-type)))
    (thunk)))

(defmacro with-full-data-perms-for-all-users!
  "Runs `body`, and sets every data permission for all databases to its most permissive value for the All Users
  permission group for the duration of the test. Restores the original permissions afterwards."
  [& body]
  `(do-with-full-data-perms-for-all-users! (fn [] ~@body)))

(defn do-with-db-perm-for-group!
  "Implementation of `with-db-perm-for-group`. Sets the data permission for the given database to the given value
  for the given permission group for the duration of the test."
  [group-or-id db-id perm-type value thunk]
  (with-restored-data-perms-for-group! (u/the-id group-or-id)
    (data-perms/set-database-permission! group-or-id db-id perm-type value)
    (thunk)))

(defn do-with-perm-for-group!
  "Implementation of `with-perm-for-group`. Sets the data permission for the test dataset to the given value
  for the given permission group for the duration of the test."
  [group-or-id perm-type value thunk]
  (do-with-db-perm-for-group! group-or-id (data/db) perm-type value thunk))

(defn do-with-perms-for-group-and-tables!
  "Implementation of `with-perm-for-group-and-table`. Sets the data permission for the test dataset/table to the given
  value for the given permission group for the duration of the test."
  [group-or-id table-or-id->perm-type->value thunk]
  (with-restored-data-perms-for-group! (u/the-id group-or-id)
    (doseq [[table-or-id perm-type->value] table-or-id->perm-type->value
            [perm-type value] perm-type->value]
      (data-perms/set-table-permission! group-or-id table-or-id perm-type value))
    (thunk)))

(defmacro with-perm-for-group-and-table!
  "Sets the data permission for the test dataset and specified table to the given value for the given permission group
  and runs `body` in that context."
  [group-or-id table-or-id perm-type value & body]
  `(do-with-perms-for-group-and-tables! ~group-or-id ~{table-or-id {perm-type value}} (fn [] ~@body)))

(defmacro with-perms-for-group-and-tables!
  "Sets the data permission for the test dataset and specified tables to the given values for the given permission
  group, running `body` in that context."
  [group-or-id table-or-id->perm-type->value & body]
  `(do-with-perms-for-group-and-tables! ~group-or-id ~table-or-id->perm-type->value (fn [] ~@body)))

(defmacro with-perm-for-group!
  "Runs `body`, and sets the data permission for the the test dataset to the given value for the given permission
  group for the duration of the test."
  [group-or-id perm-type value & body]
  `(do-with-perm-for-group! ~group-or-id ~perm-type ~value (fn [] ~@body)))

(defmacro with-db-perm-for-group!
  "Runs `body`, and sets the data permission for the the test dataset to the given value for the given permission
  group for the duration of the test."
  [group-or-id db-id perm-type value & body]
  `(do-with-db-perm-for-group! ~group-or-id ~db-id ~perm-type ~value (fn [] ~@body)))

(defn do-with-data-analyst-role!
  "Implementation of `with-data-analyst-role!`. Sets the `is_data_analyst` column to true for the given user
  for the duration of the test, then restores the original value."
  [user-or-id thunk]
  (let [user-id        (u/the-id user-or-id)
        original-value (t2/select-one-fn :is_data_analyst :model/User :id user-id)]
    (try
      (t2/update! :model/User user-id {:is_data_analyst true})
      (thunk)
      (finally
        (t2/update! :model/User user-id {:is_data_analyst original-value})))))

(defmacro with-data-analyst-role!
  "Runs `body` with the given user's `is_data_analyst` column set to true.
  Restores the original value afterwards."
  [user-or-id & body]
  `(do-with-data-analyst-role! ~user-or-id (fn [] ~@body)))
