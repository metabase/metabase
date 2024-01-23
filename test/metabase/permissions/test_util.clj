(ns metabase.permissions.test-util
  (:require
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.test.data :as data]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms`."
  [thunk]
  ;; Select sandboxes _before_ permissions.
  (let [original-perms     (t2/select :model/Permissions)
        original-sandboxes (t2/select :model/GroupTableAccessPolicy)]
    (try
      (thunk)
      (finally
        (binding [perms/*allow-root-entries* true
                  perms/*allow-admin-permissions-changes* true]
          (t2/delete! :model/GroupTableAccessPolicy)
          (t2/delete! :model/Permissions)
          ;; Insert perms _before_ sandboxes because of a foreign key constraint on sandboxes.permission_id
          (t2/insert! :model/Permissions original-perms)
          (t2/insert! :model/GroupTableAccessPolicy original-sandboxes))))))

(defmacro with-restored-perms!
  "Runs `body`, and restores permissions and sandboxes to their original state afterwards."
  [& body]
  `(do-with-restored-perms! (fn [] ~@body)))

(defn do-with-restored-data-perms!
  "Implementation of `with-restored-perms` and related helper functions. Optionally takes `group-ids` to restore only the
  permissions for a set of groups."
  [group-ids thunk]
  (let [select-condition [(when group-ids [:in :group_id group-ids])]
        original-perms (t2/select :model/DataPermissions {:where select-condition})]
    (try
      (thunk)
      (finally
        (t2/delete! :model/DataPermissions {:where select-condition})
        (t2/insert! :model/DataPermissions original-perms)))))

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
  "Implementation of `with-no-data-perms-for-all-users`. Sets every data permission for the test dataset to its
  least-permissive value for the All Users permission group for the duration of the test."
  [thunk]
  (with-restored-data-perms-for-group! (u/the-id (perms-group/all-users))
    (doseq [[perm-type _] data-perms/Permissions]
      (data-perms/set-database-permission! (perms-group/all-users)
                                           (data/db)
                                           perm-type
                                           (data-perms/least-permissive-value perm-type)))
    (thunk)))

(defmacro with-no-data-perms-for-all-users!
  "Runs `body`, and sets every data permission for the test dataset to its least-permissive value for the All Users
  permission group for the duration of the test."
  [& body]
  `(do-with-no-data-perms-for-all-users! (fn [] ~@body)))

(defn do-with-perm-for-group!
  "Implementation of `with-perm-for-group`. Sets the data permission for the the test dataset to the given value
  for the given permission group for the duration of the test."
  [group-or-id perm-type value thunk]
  (with-restored-data-perms-for-group! (u/the-id (perms-group/all-users))
   (data-perms/set-database-permission! group-or-id (data/db) perm-type value)
   (thunk)))

(defmacro with-perm-for-group!
  "Runs `body`, and sets the data permission for the the test dataset to the given value for the given permission
  group for the duration of the test."
  [group-or-id perm-type value & body]
  `(do-with-perm-for-group! ~group-or-id ~perm-type ~value (fn [] ~@body)))
