(ns metabase.product-analytics.api
  "/api/product-analytics endpoints."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.lib.schema :as lib.schema]
   [metabase.product-analytics.core :as product-analytics]))

(api.macros/defendpoint :post "/compile" :- ::lib.schema/query
  "Build the query for an analysis. It runs through `POST /api/dataset` and saves through `POST /api/card`, as any query
  does."
  [_route-params
   _query-params
   body :- ::product-analytics/analysis.input]
  (product-analytics/build-analysis body))
