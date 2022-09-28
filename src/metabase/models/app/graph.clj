(ns metabase.models.app.graph
  "Code for generating and updating the App permissions graph. App permissions
  are based on the permissions of the app's collection."
  (:require [clojure.data :as data]
            [metabase.models.collection-permission-graph-revision :as c-perm-revision
             :refer [CollectionPermissionGraphRevision]]
            [metabase.models.collection.graph :as graph]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as perms-group]
            [metabase.models.setting :as setting :refer [defsetting]]
            [metabase.public-settings.premium-features :as premium-features]
            [metabase.util.i18n :as i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(def ^:private AppPermissions
  graph/CollectionPermissions)

(def ^:private GlobalPermissionsGraph
  {:revision s/Int
   :groups   {su/IntGreaterThanZero AppPermissions}})

(s/defn ^:private set-all-users-app-permission
  [permission :- AppPermissions]
  (setting/set-value-of-type! :keyword :all-users-app-permission permission))

(defsetting all-users-app-permission
  "App permission of the All Users group"
  :type :keyword
  :visibility :internal
  :default :none
  :setter (fn [v]
            (set-all-users-app-permission (cond-> v (string? v) keyword))))

(defn set-default-permissions!
  "Sets the default permissions for the ''All Users'' group on`app` as specified
  by `all-users-app-permission` if advanced permissions are not available."
  [app]
  (when-not (premium-features/has-feature? :advanced-permissions)
    (graph/update-collection-permissions! (:id (perms-group/all-users))
                                          (:collection_id app)
                                          (all-users-app-permission))))

(s/defn global-graph :- GlobalPermissionsGraph
  "Fetch the global app permission graph."
  []
  {:revision (c-perm-revision/latest-id)
   :groups   {(:id (perms-group/admin)) :write
              (:id (perms-group/all-users)) (all-users-app-permission)}})

(s/defn update-global-graph!
  "Update the global app permission graph to the state specified by
  `new-graph`."
  [new-graph :- GlobalPermissionsGraph]
  (let [old-graph (global-graph)
        [diff-old changes] (data/diff (:groups old-graph) (:groups new-graph))]
    (perms/log-permissions-changes diff-old changes)
    (perms/check-revision-numbers old-graph new-graph)
    (when-let [[[group-id permission] & other-groups] (seq changes)]
      (when (or (not= group-id (:id (perms-group/all-users)))
                (seq other-groups))
        (throw (ex-info (tru "You can configure for the ''All Users'' group only")
                        {:group-ids (keys changes)
                         :status-code 400})))
      (db/transaction
        (when (not= permission (all-users-app-permission))
          (all-users-app-permission! permission)
          (doseq [collection-id (db/select-field :collection_id 'App)]
            (graph/update-collection-permissions! group-id collection-id permission))
          (perms/save-perms-revision!
           CollectionPermissionGraphRevision (:revision old-graph) old-graph changes))))))
