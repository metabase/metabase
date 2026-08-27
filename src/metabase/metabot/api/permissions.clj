(ns metabase.metabot.api.permissions
  "`/api/metabot/permissions` routes"
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.metabot.scope :as scope]))

(defn- simplify-permissions
  "Strip the namespace from permission keywords for a flatter JSON response.
  e.g. {:permission/metabot :yes} → {:metabot :yes}"
  [perms]
  (into {} (map (fn [[k v]] [(keyword (name k)) v])) perms))

(def ^:private user-permissions-response-schema
  [:map
   [:permissions
    [:map
     [:metabot [:enum :yes :no]]
     [:metabot-sql-generation [:enum :yes :no]]
     [:metabot-nlq [:enum :yes :no]]
     [:metabot-other-tools [:enum :yes :no]]]]])

(api.macros/defendpoint :get "/user-permissions" :- user-permissions-response-schema
  "Return the current user's resolved metabot permissions, taking the most
  permissive value across all their groups."
  []
  {:permissions (simplify-permissions
                 (if api/*is-superuser?*
                   scope/all-yes-permissions
                   (scope/resolve-user-permissions api/*current-user-id*)))})

(def ^{:arglists '([request respond raise])} routes
  "`/api/metabot/permissions` routes."
  (api.macros/ns-handler *ns* +auth))
