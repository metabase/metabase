(ns metabase.product-notifications.api
  "Authenticated API for product notifications."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.product-notifications.service :as service]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private ProductNotificationResponse
  [:map {:closed true}
   [:id ms/NonBlankString]
   [:title ms/NonBlankString]
   [:content ms/NonBlankString]
   [:icon {:optional true} ms/NonBlankString]])

(def ^:private NoContentResponse
  [:map {:closed true}
   [:status [:= 204]]
   [:body :nil]])

(defn- notification-response
  [notification]
  (cond-> {:id      (:notification_id notification)
           :title   (:title notification)
           :content (:content notification)}
    (:icon notification) (assoc :icon (:icon notification))))

(api.macros/defendpoint :get "/" :- [:vector ProductNotificationResponse]
  "Return eligible, undismissed product notifications in feed order."
  [_route-params
   _query-params
   _body
   _request]
  (mapv notification-response
        (service/visible-notifications api/*current-user-id* api/*is-superuser?*)))

(api.macros/defendpoint :post "/:notification-id/dismiss" :- NoContentResponse
  "Dismiss an eligible product notification for the current person."
  [{:keys [notification-id]} :- [:map
                                 [:notification-id ms/NonBlankString]]
   _query-params
   _body
   _request]
  (api/check-404
   (service/dismiss! notification-id api/*current-user-id* api/*is-superuser?*))
  api/generic-204-no-content)
