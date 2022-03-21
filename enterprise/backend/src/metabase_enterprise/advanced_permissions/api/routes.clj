(ns metabase-enterprise.advanced-permissions.api.routes
  "`/advanced-permisisons/sso` Routes.

  Implements the SSO routes needed for SAML and JWT. This namespace primarily provides hooks for those two backends so
  we can have a uniform interface both via the API and code"
  (:require [compojure.core :refer [GET POST]]
            [metabase-enterprise.advanced-permissions.models.permissions.general-permissions :as g-perms]
            [metabase.api.common :as api]))

(api/defendpoint GET "/general/graph"
  "SSO entry-point for an SSO user that has not logged in yet"
  [:as _req]
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
  "Fix the types in the graph when it comes in from the API, e.g. converting things like `yes` to `:yes` and
  parsing object keys keyword "
  [graph]
  (update graph :groups dejsonify-groups))

(api/defendpoint PUT "/general/graph"
  "Route the SSO backends call with successful login details"
  [:as {:keys [body]}]
  (-> body
      dejsonify-graph
      g-perms/update-graph!)
  (g-perms/graph))

(api/define-routes)
