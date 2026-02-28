(ns metabase-enterprise.product-analytics.models.site
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ProductAnalyticsSite [_model] :product_analytics_site)

(doto :model/ProductAnalyticsSite
  (derive :metabase/model)
  (derive :hook/timestamped?))
