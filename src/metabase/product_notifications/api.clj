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

(defn- present
  [notification]
  (cond-> {:id      (:notification_id notification)
           :title   (:title notification)
           :content (:content notification)}
    (:icon notification) (assoc :icon (:icon notification))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case]}
(api.macros/defendpoint :get "/" :- [:vector ProductNotificationResponse]
  "Return the first eligible, undismissed product notification, or all of them when requested."
  [_route-params
   {:keys [include_all]} :- [:map
                             [:include_all {:default false} [:maybe :boolean]]]]
  (mapv present
        (service/visible-notifications api/*current-user-id*
                                       api/*is-superuser?*
                                       (true? include_all))))

(api.macros/defendpoint :post "/:notification-id/dismiss" :- NoContentResponse
  "Dismiss an eligible product notification for the current person."
  [{:keys [notification-id]} :- [:map
                                 [:notification-id ms/NonBlankString]]]
  (api/check-404
   (service/dismiss! notification-id api/*current-user-id* api/*is-superuser?*))
  api/generic-204-no-content)
