(ns metabase-enterprise.advanced-config.api.routes
  "API endpoints that are only enabled if we have a premium token with the `:advanced-config` feature. These live under
  `/api/ee/advanced-config/`."
  (:require [compojure.core :as compojure]
            [metabase-enterprise.advanced-config.api.user :as user]
            [metabase-enterprise.api.routes.common :as ee.api.common]
            [metabase.api.routes.common :refer [+auth]]))

(defn- +require-advanced-config [handler]
  (ee.api.common/+require-premium-feature :advanced-config handler))

(compojure/defroutes ^{:doc "Ring routes for mt API endpoints."} routes
  (compojure/context "/user" [] (+auth user/routes)))
