(ns metabase.product-notifications.models.product-notification-dismissal
  "Toucan model for per-user product notification dismissals."
  (:require
   [metabase.models.interface :as mi]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/ProductNotificationDismissal [_model]
  :product_notification_dismissal)

(doto :model/ProductNotificationDismissal
  (derive :metabase/model))

(t2/define-before-insert :model/ProductNotificationDismissal
  [dismissal]
  (assoc dismissal :dismissed_at (mi/now)))
