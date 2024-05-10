(ns metabase-enterprise.scim.routes
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.scim.api :as scim]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for SCIM"} routes
  ;; TODO
  (compojure/context "/" [] (+auth scim/routes)))
