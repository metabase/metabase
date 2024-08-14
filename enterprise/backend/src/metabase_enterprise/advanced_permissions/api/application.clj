(ns metabase-enterprise.advanced-permissions.api.application
  "`/advanced-permisisons/application` Routes.
  Implements the Permissions routes needed for application permission - a class of permissions that control access to features
  like access Setting pages, access monitoring tools ... etc"
  (:require
   [compojure.core :refer [GET PUT]]
   [metabase-enterprise.advanced-permissions.models.permissions.application-permissions :as a-perms]
   [metabase.api.common :as api]))

(set! *warn-on-reflection* true)

(api/defendpoint GET "/graph"
  "Fetch a graph of Application Permissions."
  []
  (api/check-superuser)
  (a-perms/graph))

(defn- dejsonify-application-permissions
  [application-permissions]
  (into {} (for [[perm-type perm-value] application-permissions]
             [perm-type (keyword perm-value)])))

(defn- dejsonify-groups
  [groups]
  (into {} (for [[group-id application-permissions] groups]
             [(Integer/parseInt (name group-id))
              (dejsonify-application-permissions application-permissions)])))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"yes\"` to `:yes` and
  parsing object keys keyword."
  [graph]
  (update graph :groups dejsonify-groups))

(api/defendpoint PUT "/graph"
  "Do a batch update of Application Permissions by passing a modified graph."
  [:as {:keys [body]}]
  (api/check-superuser)
  (-> body
      dejsonify-graph
      a-perms/update-graph!)
  (a-perms/graph))

(api/define-routes)
