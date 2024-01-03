(ns metabase.permissions.test-util
  (:require
   [metabase.models.permissions :as perms]
   [toucan2.core :as db]))

(defn do-with-restored-perms!
  "Implementation of `with-restored-perms`."
  [thunk]
  ;; Select sandboxes _before_ permissions.
  (let [original-perms     (db/select :model/Permissions)
        original-sandboxes (db/select :model/GroupTableAccessPolicy)]
    (try
      (thunk)
      (finally
        (binding [perms/*allow-root-entries* true
                  perms/*allow-admin-permissions-changes* true]
          (db/delete! :model/GroupTableAccessPolicy)
          (db/delete! :model/Permissions)
          ;; Insert perms _before_ sandboxes because of a foreign key constraint on sandboxes.permission_id
          (db/insert! :model/Permissions original-perms)
          (db/insert! :model/GroupTableAccessPolicy original-sandboxes))))))

(defmacro with-restored-perms!
  "Runs `body`, and restores permissions and sandboxes to their original state afterwards."
  [& body]
  `(do-with-restored-perms! (fn [] ~@body)))
