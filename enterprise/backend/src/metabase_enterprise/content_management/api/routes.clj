(ns metabase-enterprise.content-management.api.routes
  (:require [compojure.core :as compojure :refer [context]]
            [metabase-enterprise.api.routes.common :as ee.api.common]
            [metabase-enterprise.content-management.api.review :as review]
            [metabase.api.routes.common :refer [+auth]]))

(defn- +require-content-management [handler]
  (ee.api.common/+require-premium-feature :content-management handler))

(compojure/defroutes ^{:doc "API routes only available if we have a premium token with the `:content-management` feature."}
  routes
  (context "/moderation-review"  [] (+require-content-management (+auth review/routes))))
