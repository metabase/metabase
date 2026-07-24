(ns metabase.product-notifications.service
  "Application operations for listing and dismissing product notifications."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as mdb]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-notifications.core :as product-notifications]
   [metabase.product-notifications.models.product-notification]
   [metabase.product-notifications.models.product-notification-dismissal]
   [metabase.util.malli :as mu]
   [metabase.version.settings :as version.settings]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
                       {:where    [:= :active true]
                        :order-by [[:position :asc]]}))))

(mu/defn visible-notifications :- [:vector :map]
  "Return eligible, undismissed notifications for a person in feed order."
  [user-id :- pos-int?
   superuser? :- :boolean
   include-all? :- :boolean]
  (if-not (version.settings/check-for-updates)
    []
    (let [dismissed-ids (t2/select-fn-set :product_notification_id
                                          :model/ProductNotificationDismissal
                                          :user_id user-id)
          eligible      (remove #(contains? dismissed-ids (:id %))
                                (eligible-notifications superuser?))]
      (into [] (cond->> eligible (not include-all?) (take 1))))))

(mu/defn dismiss!
  "Dismiss an eligible notification for a person. Returns false when it isn't eligible."
  [notification-id :- :string
   user-id :- pos-int?
   superuser? :- :boolean]
  (when (version.settings/check-for-updates)
    (when-let [notification (t2/select-one :model/ProductNotification
                                           :notification_id notification-id
                                           :active true)]
      (when (product-notifications/eligible? notification
                                             (eligibility-context superuser?))
        (mdb/update-or-insert!
         :model/ProductNotificationDismissal
         {:product_notification_id (:id notification)
          :user_id                 user-id}
         (fn [existing]
           (when-not existing
             {})))
        true))))
