(ns metabase-enterprise.advanced-permissions.models.permissions.application-permissions
  "Code for generating the Application Permission graph; [[metabase-enterprise.advanced-permissions.write/update-graph!]]
  updates it."
  (:require
   [metabase-enterprise.advanced-permissions.db :as advanced-permissions.db]
   [metabase.permissions.core :as perms]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

;;; ---------------------------------------------------- Schemas -----------------------------------------------------

(def ^:private GroupPermissionsGraph
  [:map-of
   [:enum :setting :monitoring :subscription]
   [:enum :yes :no]])

(def ^:private ApplicationPermissionsGraph
  [:map {:closed true}
   [:revision :int]
   [:force {:optional true} [:maybe :boolean]]
   [:groups [:map-of ms/PositiveInt GroupPermissionsGraph]]])

(def ApplicationPermissionsGraphUpdate
  "An update of the application permissions graph: per group, whether it holds each application permission."
  [:map {:closed true}
   [:revision {:optional true} [:maybe :int]]
   [:force    {:optional true} [:maybe :boolean]]
   [:groups   [:map-of ms/PositiveInt GroupPermissionsGraph]]])

;; -------------------------------------------------- Fetch Graph ---------------------------------------------------

(defn- group-id->permissions-set
  "Returns a map of group-id -> application permissions paths.
  Only groups that has at least one application permission enabled will be included."
  []
  (let [application-permissions (advanced-permissions.db/application-permissions)]
    (into {} (for [[group-id perms] (group-by :group_id application-permissions)]
               {group-id (set (map :object perms))}))))

(defn- permission-for-type
  [permissions-set perm-type]
  (if (some (set permissions-set) ["/" "/application/" (perms/application-perms-path perm-type)])
    :yes
    :no))

(mu/defn permissions-set->application-perms :- GroupPermissionsGraph
  "Get a map of all application permissions for a group."
  [permission-set :- [:maybe [:set :string]]]
  {:setting      (permission-for-type permission-set :setting)
   :monitoring   (permission-for-type permission-set :monitoring)
   :subscription (permission-for-type permission-set :subscription)})

(mu/defn graph :- ApplicationPermissionsGraph
  "Fetch a graph representing the application permissions status for groups that has at least one application permission
  enabled. This works just like the function of the same name in `metabase.permissions.models.permissions`; see also the
  documentation for that function."
  []
  {:revision (perms/latest-application-permissions-revision-id)
   :groups   (into {} (for [[group-id perms] (group-id->permissions-set)]
                        {group-id (permissions-set->application-perms perms)}))})
