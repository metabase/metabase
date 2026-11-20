(ns metabase.notification.api.notification
  "/api/notification endpoints"
  (:require
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.embedding.util :as embed.util]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.notification.db :as notification.db]
   [metabase.notification.models :as models.notification]
   [metabase.notification.write :as notification.write]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(mr/def ::send-status
  [:enum :sent :skipped])

(mr/def ::SendNotificationResponse
  "Response schema for the `send/` and `:id/send/` endpoints"
  [:map {:closed true}
   [:status ::send-status]
   [:skip_reason {:optional true} [:maybe string?]]])

(defn- check-inline-channels!
  "Validate that an inline `:channel` or `:channel_id` handler requires the same permission as creating one."
  [handlers]
  (when (some #(or (:channel %) (:channel_id %)) handlers)
    (api/check-403 (mi/can-write? (t2/hydrate (t2/instance :model/Channel {}) :can_write)))))

(defn list-notifications
  "List notifications. See `GET /` for parameters."
  [{:keys [creator_id creator_or_recipient_id recipient_id card_id payload_type include_inactive legacy-active legacy-user-id]}]
  (->> (notification.db/notifications-matching
        {:creator-id               creator_id
         :creator-or-recipient-id  creator_or_recipient_id
         :recipient-id             recipient_id
         :card-id                  card_id
         :payload-type             payload_type
         :include-inactive?        include_inactive
         ;; legacy-active and legacy-user-id only used by alert api, will be removed soon
         :legacy-active            legacy-active
         :legacy-user-id           legacy-user-id})
       (into [] (map t2.realize/realize))
       mi/readable
       models.notification/hydrate-notification))

;; TODO (Cam 10/28/25) -- fix this endpoint so it uses kebab-case for query parameters for consistency with the rest
;; of the REST API
;;
;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-query-params-use-kebab-case
                      :metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/"
  "List notifications.
  - `creator_id`: if provided returns only notifications created by this user
  - `recipient_id`: if provided returns only notification that has recipient_id as a recipient
  - `creator_or_recipient_id`: if provided returns only notification that has user_id as creator or recipient
  - `card_id`: if provided returns only notification that has card_id as payload"
  [_route-params
   {:keys [creator_id creator_or_recipient_id recipient_id card_id include_inactive payload_type]} :-
   [:map {:closed true}
    [:creator_id              {:optional true} ms/PositiveInt]
    [:recipient_id            {:optional true} ms/PositiveInt]
    [:creator_or_recipient_id {:optional true} ms/PositiveInt]
    [:card_id                 {:optional true} ms/PositiveInt]
    [:include_inactive        {:optional true} ms/BooleanValue]
    [:payload_type            {:optional true} [:maybe (into [:enum] models.notification/notification-types)]]]]
  (list-notifications {:creator_id              creator_id
                       :recipient_id            recipient_id
                       :creator_or_recipient_id creator_or_recipient_id
                       :card_id                 card_id
                       :include_inactive        include_inactive
                       :payload_type            payload_type}))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Get a notification by id."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (-> (notification.write/get-notification id)
      api/read-check))

(api.macros/defendpoint :post "/" :- ::models.notification/FullyHydratedNotification
  "Create a new notification, return the created notification."
  [_route _query body :- ::notification.write/CreateNotificationParams request]
  (notification.write/check-handler-templates! (:handlers body))
  (notification.write/create-notification-with-perm-checks!
   (-> body
       (update :payload_type keyword)
       (assoc :creator_id api/*current-user-id*)
       (assoc-in [:payload :disable_links]
                 (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification.

  `creator_id` (owner) can be reassigned here only by superusers (e.g. the admin 'Edit alert'
  modal's owner picker). `mi/can-update?` rejects a non-superuser reassignment attempt with 403.
  Echoing back the unchanged value is fine."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query
   body :- ::notification.write/NotificationApiUpdateInput]
  (notification.write/update-notification-with-perm-checks! id body))

(api.macros/defendpoint :post "/:id/send" :- ::SendNotificationResponse
  "Send a notification by id."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]
   _query
   {:keys [handler_ids]} :- [:map {:closed true} [:handler_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (let [notification (cond-> (notification.write/get-notification id)
                       (seq handler_ids)
                       (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers))))]
    ;; sending runs the notification's payload as its creator, so gate on write access rather than read access
    (api/write-check notification)
    (notification/send-notification! notification :notification/sync? true)))

(defn- promote-to-t2-instance
  [notification]
  (->  (t2/instance :model/Notification notification)
       (m/update-existing :handlers #(map (fn [x]
                                            (-> (t2/instance :model/NotificationHandler x)
                                                (m/update-existing :channel (fn [c] (t2/instance :model/Channel) c))
                                                (m/update-existing :template (fn [t] (t2/instance :model/ChannelTemplate) t))
                                                (m/update-existing :recipients (fn [recipients] (map (fn [r] (t2/instance :model/NotificationRecipient r)) recipients)))))
                                          %))
       (m/update-existing :subscriptions #(map (fn [x] (t2/instance :model/NotificationSubscription x)) %))))

(api.macros/defendpoint :post "/send" :- ::SendNotificationResponse
  "Send an unsaved notification."
  [_route _query body :- ::notification.write/CreateNotificationParams request]
  (notification.write/check-no-resource-templates! (:handlers body))
  (check-inline-channels! (:handlers body))
  (api/create-check :model/Notification body)
  (models.notification/validate-email-handlers! (:handlers body))
  (let [notification (-> body
                         (assoc :creator_id api/*current-user-id*)
                         (assoc-in [:payload :disable_links]
                                   (embed.util/is-modular-embedding-or-modular-embedding-sdk-request? request))
                         promote-to-t2-instance)]
    (notification/send-notification! notification :notification/sync? true)))

(api.macros/defendpoint :post "/:id/unsubscribe" :- ::api/generic-204-no-content
  "Unsubscribe current user from a notification."
  [{:keys [id]} :- [:map {:closed true} [:id ms/PositiveInt]]]
  (notification.write/unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
