(ns metabase-enterprise.product-analytics.models.session
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ProductAnalyticsSession [_model] :product_analytics_session)

(doto :model/ProductAnalyticsSession
  (derive :metabase/model)
  (derive :hook/timestamped?))
