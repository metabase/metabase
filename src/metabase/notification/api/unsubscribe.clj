(ns metabase.notification.api.unsubscribe
  "Unauthenticated `/api/notification/unsubscribe` endpoints to allow non-logged-in people to unsubscribe from
  Alerts/DashboardNotifications."
  (:require
   [medley.core :as m]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email.messages :as messages]
   [metabase.config.core :as config]
   [metabase.events.core :as events]
   [metabase.notification.db :as notification.db]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(def ^:private unsubscribe-throttler (throttle/make-throttler :notification-unsubscribe, :attempts-threshold 50))

(defn- check-hash [notification-handler-id email hash ip-address]
  (when-not throttling-disabled?
    (throttle/check unsubscribe-throttler ip-address))
  (when (not= hash (messages/generate-notification-unsubscribe-hash notification-handler-id email))
    (throw (ex-info (tru "Invalid hash.")
                    {:status-code 400}))))

(defn- notification-name-by-handler-id
  [notification-handler-id]
  (let [notification (t2/hydrate (notification.db/notification-for-handler notification-handler-id) :payload)]
    (case (:payload_type notification)
      ;; use the card name
      :notification/card (->> notification :payload :card_id notification.db/card-name)
      ;; use the dashboard name
      :notification/dashboard (->> notification :payload :dashboard_id notification.db/dashboard-name)
      (name (:payload_type notification)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Allow non-users to unsubscribe from notifications, with the hash given through email."
  [_route-params
   _query-params
   {:keys [email hash notification-handler-id]} :- [:map
                                                    [:notification-handler-id ms/PositiveInt]
                                                    [:email                   :string]
                                                    [:hash                    :string]]
   request]
  (check-hash notification-handler-id email hash (request/ip-address request))
  (t2/with-transaction [_conn]
    (let [recipients (notification.db/raw-value-recipients-for-handler notification-handler-id)
          matching-recipient (m/find-first #(= email (-> % :details :value)) recipients)]
      (if matching-recipient
        (notification.db/delete-recipient! (:id matching-recipient))
        (throw (ex-info (tru "Email doesn''t exist.") {:status-code 400})))))
  (events/publish-event! :event/notification-unsubscribe-ex {:details {:email email}
                                                             :object {:id notification-handler-id}})
  {:status :success :title (notification-name-by-handler-id notification-handler-id)})

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/undo"
  "Allow non-users to undo an unsubscribe from notifications, with the hash given through email."
  [_route-params
   _query-params
   {:keys [email hash notification-handler-id]} :- [:map
                                                    [:notification-handler-id ms/PositiveInt]
                                                    [:email                   :string]
                                                    [:hash                    :string]]
   request]
  (check-hash notification-handler-id email hash (request/ip-address request))
  (t2/with-transaction [_conn]
    (let [recipients         (notification.db/raw-value-recipients-for-handler notification-handler-id)
          matching-recipient (m/find-first #(= email (-> % :details :value)) recipients)]
      (if-not matching-recipient
        (notification.db/insert-recipients! {:type                    :notification-recipient/raw-value
                                             :details                 {:value email}
                                             :notification_handler_id notification-handler-id})
        (throw (ex-info (tru "Email already exist.") {:status-code 400})))))
  (events/publish-event! :event/notification-unsubscribe-undo-ex {:details {:email email}
                                                                  :object {:id notification-handler-id}})
  {:status :success :title (notification-name-by-handler-id notification-handler-id)})
