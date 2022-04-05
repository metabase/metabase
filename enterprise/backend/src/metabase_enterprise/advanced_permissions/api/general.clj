(ns metabase-enterprise.advanced-permissions.api.general
  "`/advanced-permisisons/general` Routes.
  Implements the Permissions routes needed for general permission - a class of permissions that control access to features
  like access Setting pages, access monitoring tools ... etc"
  (:require [compojure.core :refer [GET PUT]]
            [metabase-enterprise.advanced-permissions.models.permissions.general-permissions :as g-perms]
            [metabase.api.common :as api]))

(api/defendpoint GET "/graph"
  "Fetch a graph of General Permissions."
  []
  (api/check-superuser)
  (g-perms/graph))

(defn- dejsonify-general-permissions
  [general-permissions]
  (into {} (for [[perm-type perm-value] general-permissions]
             [perm-type (keyword perm-value)])))

(defn- dejsonify-groups
  [groups]
  (into {} (for [[group-id general-permissions] groups]
             [(Integer/parseInt (name group-id))
              (dejsonify-general-permissions general-permissions)])))

(defn- dejsonify-graph
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `\"yes\"` to `:yes` and
  parsing object keys keyword."
  [graph]
  (update graph :groups dejsonify-groups))

(api/defendpoint PUT "/graph"
  "Do a batch update of General Permissions by passing a modified graph."
  [:as {:keys [body]}]
  (api/check-superuser)
  (-> body
      dejsonify-graph
      g-perms/update-graph!)
  (g-perms/graph))

(api/define-routes)
