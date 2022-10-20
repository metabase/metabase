(ns metabase.models.app.graph
  "Code for generating and updating the App permissions graph. App permissions
  are based on the permissions of the app's collection."
  (:require [clojure.data :as data]
            [metabase.models.app-permission-graph-revision :as app-perm-revision
             :refer [AppPermissionGraphRevision]]
            [metabase.models.collection.graph :as graph]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.util.i18n :as i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def RootPermissions
  "The valid app permissions. Currently corresponds 1:1 to `CollectionPermissions`
  since app permissions are implemented in terms of collection permissions."
  {:root graph/CollectionPermissions})

(def ^:private GlobalPermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero RootPermissions}})

(s/defn global-graph :- GlobalPermissionsGraph
  "Fetch the global app permission graph.

  This works by reading the permissions for app collections, restricting
  the groups to admin and ''All Users'' and the collections to the root."
  []
  (-> (graph/graph :apps)
      (assoc :revision (app-perm-revision/latest-id))
      (update :groups (fn [group-perms]
                        (-> group-perms
                            (select-keys [(:id (perms-group/admin))
                                          (:id (perms-group/all-users))])
                            (update-vals #(select-keys % [:root])))))))

(s/defn update-global-graph!
  "Update the global app permission graph to the state specified by
  `new-graph`. Returns the new graph as read from the updated database."
  [new-graph :- GlobalPermissionsGraph]
  (let [old-graph (global-graph)
        [diff-old changes] (data/diff (:groups old-graph) (:groups new-graph))]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when-let [[[all-users-group-id [[root permission] & other-colls]] & other-groups] (seq changes)]
      (when (or (not= all-users-group-id (:id (perms-group/all-users)))
                (not= root :root)
                (seq other-colls)
                (seq other-groups))
        (throw (ex-info (tru "You can configure permissions only on the root and only for the ''All Users'' group")
                        {:group-ids (keys changes)
                         :status-code 400})))
      (db/transaction
        (graph/update-collection-permissions! :apps all-users-group-id root permission)
        (perms/save-perms-revision! AppPermissionGraphRevision (:revision old-graph)
                                    old-graph changes)
        (global-graph)))))
