(ns metabase-enterprise.content-verification.api.routes
  (:require
   [compojure.core :as compojure :refer [context]]
   [metabase-enterprise.api.routes.common :as ee.api.common]
   [metabase-enterprise.content-verification.api.review :as review]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defn- +require-content-verification [handler]
  (ee.api.common/+require-premium-feature :content-verification (deferred-tru "Content verification") handler))

(compojure/defroutes ^{:doc "API routes only available if we have a premium token with the `:content-verification` feature."}
  routes
  (context "/moderation-review"  [] (+require-content-verification (+auth review/routes))))
