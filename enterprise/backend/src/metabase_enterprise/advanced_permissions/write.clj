(ns metabase-enterprise.advanced-permissions.write
  "The update of the Application Permission graph, with its revision row."
  (:require
   [clojure.data :as data]
   [metabase-enterprise.advanced-permissions.models.permissions.application-permissions :as a-perms]
   [metabase.permissions.core :as perms]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(defn- update-application-permissions!
  "Perform update application permissions for a group-id."
  [group-id changes]
  (doseq [[perm-type perm-value] changes]
    (case perm-value
      :yes
      (perms/grant-application-permissions! group-id perm-type)

      :no
      (perms/revoke-application-permissions! group-id perm-type))))

(mu/defn update-graph!
  "Update the application Permissions graph.
  This works just like [[metabase.permissions-rest.write/update-data-perms-graph!]], but for
  Application permissions; refer to that function's extensive documentation to get a sense for how this works."
  ([new-graph :- a-perms/ApplicationPermissionsGraphUpdate]
   (update-graph! new-graph false))

  ([new-graph :- a-perms/ApplicationPermissionsGraphUpdate
    force?     :- :boolean]
   (let [old-graph          (a-perms/graph)
         old-perms          (:groups old-graph)
         new-perms          (:groups new-graph)
         [diff-old changes] (data/diff old-perms new-perms)]
     (perms/log-permissions-changes diff-old changes)
     (when-not force? (perms/check-revision-numbers old-graph new-graph))
     (when (seq changes)
       (t2/with-transaction [_conn]
         (doseq [[group-id changes] changes]
           (update-application-permissions! group-id changes))
         (perms/save-perms-revision! :model/ApplicationPermissionsRevision (:revision old-graph) (:groups old-graph) changes))))))
