(ns metabase-enterprise.product-analytics.models.event
  (:require
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/ProductAnalyticsEvent [_model] :product_analytics_event)

(doto :model/ProductAnalyticsEvent
  (derive :metabase/model)
  (derive :hook/created-at-timestamped?))
