(ns metabase.api.pulse.unsubscribe
  "Unauthenticated `/api/pulse/unsubscribe` endpoints to allow non-logged-in people to unsubscribe from
  Alerts/DashboardNotifications."
  (:require
   [compojure.core :refer [POST]]
   [metabase.api.common :as api]
   [metabase.config :as config]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.models.pulse :as models.pulse]
   [metabase.request.core :as request]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [throttle.core :as throttle]
   [toucan2.core :as t2]))

(def ^:private throttling-disabled? (config/config-bool :mb-disable-session-throttle))

(def ^:private unsubscribe-throttler (throttle/make-throttler :unsubscribe, :attempts-threshold 50))

(defn- check-hash [pulse-id email hash ip-address]
  (when-not throttling-disabled?
    (throttle/check unsubscribe-throttler ip-address))
  (when (not= hash (messages/generate-pulse-unsubscribe-hash pulse-id email))
    (throw (ex-info (tru "Invalid hash.")
                    {:type        type
                     :status-code 400}))))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/"
  "Allow non-users to unsubscribe from pulses/subscriptions, with the hash given through email."
  [:as {{:keys [email hash pulse-id]} :body, :as request}]
  {pulse-id ms/PositiveInt
   email    :string
   hash     :string}
  (check-hash pulse-id email hash (request/ip-address request))
  (t2/with-transaction [_conn]
    (api/let-404 [pulse-channel (t2/select-one :model/PulseChannel :pulse_id pulse-id :channel_type "email")]
      (let [emails (get-in pulse-channel [:details :emails])]
        (if (some #{email} emails)
          (t2/update! :model/PulseChannel (:id pulse-channel) (update-in pulse-channel [:details :emails] #(remove #{email} %)))
          (throw (ex-info (tru "Email for pulse-id doesn't exist.")
                          {:type        type
                           :status-code 400}))))
      (events/publish-event! :event/subscription-unsubscribe {:object {:email email}})
      {:status :success :title (:name (models.pulse/retrieve-notification pulse-id :archived false))})))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint POST "/undo"
  "Allow non-users to undo an unsubscribe from pulses/subscriptions, with the hash given through email."
  [:as {{:keys [email hash pulse-id]} :body, :as request}]
  {pulse-id ms/PositiveInt
   email    :string
   hash     :string}
  (check-hash pulse-id email hash (request/ip-address request))
  (t2/with-transaction [_conn]
    (api/let-404 [pulse-channel (t2/select-one :model/PulseChannel :pulse_id pulse-id :channel_type "email")]
      (let [emails (get-in pulse-channel [:details :emails])]
        (if (some #{email} emails)
          (throw (ex-info (tru "Email for pulse-id already exists.")
                          {:type        type
                           :status-code 400}))
          (t2/update! :model/PulseChannel (:id pulse-channel) (update-in pulse-channel [:details :emails] conj email))))
      (events/publish-event! :event/subscription-unsubscribe-undo {:object {:email email}})
      {:status :success :title (:name (models.pulse/retrieve-notification pulse-id :archived false))})))

(api/define-routes)
