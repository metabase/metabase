(ns metabase.product-notifications.models.product-notification
  "Toucan model for remotely authored product notifications."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ProductNotification [_model] :product_notification)

(doto :model/ProductNotification
  (derive :metabase/model)
  (derive :hook/timestamped?))

(t2/deftransforms :model/ProductNotification
  {:audience   mi/transform-keyword
   :deployment mi/transform-keyword
   :edition    mi/transform-keyword})
