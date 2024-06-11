(ns metabase-enterprise.scim.routes
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.scim.api :as scim-config]
   [metabase-enterprise.scim.auth :refer [+scim-auth]]
   [metabase-enterprise.scim.v2.api :as scim-api]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for SCIM"} routes
  (compojure/context "/v2" [] (+scim-auth scim-api/routes))
  (compojure/context "/" [] (+auth scim-config/routes)))
