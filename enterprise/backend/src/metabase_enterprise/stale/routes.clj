(ns metabase-enterprise.stale.routes
  (:require
   [compojure.core :as compojure]
   [metabase-enterprise.stale.api :as stale-api]
   [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for Stale API"} routes
  (compojure/context "/" [] (+auth stale-api/routes)))
