(ns metabase.product-notifications.api
  "Authenticated API for product notifications."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.core :as product-notifications]
   [metabase.product-notifications.models.product-notification]
   [metabase.product-notifications.models.product-notification-dismissal]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; open on purpose: the stored content is passed through, so a new renderable field
;; reaches the client without a backend change
(def ^:private ProductNotificationResponse
  [:map
   [:id ms/NonBlankString]
   [:title ms/NonBlankString]
   [:description ms/NonBlankString]
   [:icon {:optional true} [:maybe ms/NonBlankString]]])

(def ^:private NoContentResponse
  [:map {:closed true}
   [:status [:= 204]]
   [:body :nil]])

(defn- eligibility-context
  [superuser?]
  {:now         (t/offset-date-time)
   :superuser?  superuser?
   :hosted?     (premium-features/is-hosted?)
   :enterprise? config/ee-available?
   :version     (:tag config/mb-version-info)})

(defn- eligible-notifications
  [superuser?]
  (let [context (eligibility-context superuser?)]
    (filter #(product-notifications/eligible? % context)
            (t2/select :model/ProductNotification
                       {:where    [:= :retired_at nil]
                        :order-by [[:position :asc] [:id :asc]]}))))

(mu/defn- visible-notifications :- [:vector :map]
  "Return eligible, undismissed notifications for a person in feed order."
  [user-id :- pos-int?
   superuser? :- :boolean]
  (let [dismissed-ids (t2/select-fn-set :product_notification_id
                                        :model/ProductNotificationDismissal
                                        :user_id user-id)]
    (into []
          (remove #(contains? dismissed-ids (:id %)))
          (eligible-notifications superuser?))))

(mu/defn- dismiss!
  "Dismiss an eligible notification for a person. Returns true when eligible, nil otherwise."
  [notification-id :- :string
   user-id :- pos-int?
   superuser? :- :boolean]
  (when-let [notification (t2/select-one :model/ProductNotification
                                         :notification_id notification-id
                                         :retired_at nil)]
    (when (product-notifications/eligible? notification
                                           (eligibility-context superuser?))
      (mdb/update-or-insert!
       :model/ProductNotificationDismissal
       {:product_notification_id (:id notification)
        :user_id                 user-id}
       (fn [existing]
         (when-not existing
           {})))
      true)))

(defn- notification-response
  [notification]
  (assoc (:content notification) :id (:notification_id notification)))

(api.macros/defendpoint :get "/" :- [:vector ProductNotificationResponse]
  "Return eligible, undismissed product notifications in feed order."
  [_route-params
   _query-params
   _body
   _request]
  (mapv notification-response
        (visible-notifications api/*current-user-id* api/*is-superuser?*)))

(api.macros/defendpoint :post "/:notification-id/dismiss" :- NoContentResponse
  "Dismiss an eligible product notification for the current person."
  [{:keys [notification-id]} :- [:map
                                 [:notification-id ms/NonBlankString]]
   _query-params
   _body
   _request]
  (api/check-404
   (dismiss! notification-id api/*current-user-id* api/*is-superuser?*))
  api/generic-204-no-content)
