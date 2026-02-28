(ns metabase-enterprise.product-analytics.models.event-data
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ProductAnalyticsEventData [_model] :product_analytics_event_data)

(doto :model/ProductAnalyticsEventData
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
