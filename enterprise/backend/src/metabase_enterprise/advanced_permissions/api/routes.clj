(ns metabase-enterprise.advanced-permissions.api.routes
  (:require [compojure.core :as compojure]
            [metabase-enterprise.advanced-permissions.api.application :as application]
            [metabase.api.routes.common :refer [+auth]]))

(compojure/defroutes ^{:doc "Ring routes for advanced permissions API endpoints."} routes
  (compojure/context "/application" [] (+auth application/routes)))
