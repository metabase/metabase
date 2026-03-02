(ns metabase-enterprise.product-analytics.models.session-data
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ProductAnalyticsSessionData [_model] :product_analytics_session_data)

(doto :model/ProductAnalyticsSessionData
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
