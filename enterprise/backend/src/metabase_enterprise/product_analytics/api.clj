(ns metabase-enterprise.product-analytics.api
  "`/api/ee/product-analytics/` routes"
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "Placeholder endpoint for product analytics."
  [_route _query _body]
  {:status "ok"})

(def routes (api.macros/ns-handler *ns* +auth))
