(ns metabase.notification.api.notification
  "/api/notification endpoints"
  (:require
   [clojure.data :refer [diff]]
   [honey.sql.helpers :as sql.helpers]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.settings :as channel.settings]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.notification.core :as notification]
   [metabase.notification.models :as models.notification]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.realize :as t2.realize]))

(set! *warn-on-reflection* true)

(defn get-notification
  "Get a notification by id."
  [id]
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

(defn- card-notification?
  [notification]
  (= :notification/card (:payload_type notification)))

(defn list-notifications
  "List notifications. See `GET /` for parameters."
  [{:keys [creator_id creator_or_recipient_id recipient_id card_id payload_type include_inactive legacy-active legacy-user-id]}]
  (->> (t2/reducible-select :model/Notification
                            (cond-> {:select-distinct [:notification.*]}
                              creator_id
                              (sql.helpers/where [:= :notification.creator_id creator_id])

                              recipient_id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:= :notification_recipient.user_id recipient_id]))

                              creator_or_recipient_id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:or [:= :notification_recipient.user_id creator_or_recipient_id]
                                                      [:= :notification.creator_id creator_or_recipient_id]]))

                              card_id
                              (-> (sql.helpers/left-join
                                   :notification_card
                                   [:and
                                    [:= :notification_card.id :notification.payload_id]
                                    [:= :notification.payload_type "notification/card"]])
                                  (sql.helpers/where [:= :notification_card.card_id card_id]))

                              (and (nil? legacy-active) (not (true? include_inactive)))
                              (sql.helpers/where [:= :notification.active true])

                              payload_type
                              (sql.helpers/where [:= :notification.payload_type (u/qualified-name payload_type)])

                              ;; legacy-active and legacy-user-id only used by alert api, will be removed soon
                              (some? legacy-active)
                              (sql.helpers/where [:= :notification.active legacy-active])

                              legacy-user-id
                              (-> (sql.helpers/left-join
                                   :notification_handler [:= :notification_handler.notification_id :notification.id])
                                  (sql.helpers/left-join
                                   :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                                  (sql.helpers/where [:or
                                                      [:= :notification_recipient.user_id legacy-user-id]
                                                      [:= :notification.creator_id legacy-user-id]]))))

       (into [] (comp
                 (map t2.realize/realize)
                 (filter mi/can-read?)))
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
   [:map
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
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (-> (get-notification id)
      api/read-check))

(defn- all-email-recipients [notification]
  (->> (:handlers notification)
       (filter #(= :channel/email ((comp keyword :channel_type) %)))
       (mapcat :recipients)
       (filter #(#{:notification-recipient/user :notification-recipient/raw-value} ((comp keyword :type) %)))
       (map (fn [recipient]
              (if (= :notification-recipient/user ((comp keyword :type) recipient))
                (or (-> recipient :user :email) (t2/select-one-fn :email :model/User (:user_id recipient)))
                (-> recipient :details :value))))
       (remove nil?)
       set))

(defn- send-you-were-added-card-notification-email! [notification]
  (when (channel.settings/email-configured?)
    (let [current-user? #{(:email @api/*current-user*)}]
      (when-let [recipients-except-creator (->> (all-email-recipients notification)
                                                (remove current-user?)
                                                seq)]
        (messages/send-you-were-added-card-notification-email!
         (update notification :payload t2/hydrate :card) recipients-except-creator @api/*current-user*)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new notification, return the created notification."
  [_route _query body :- ::models.notification/FullyHydratedNotification]
  (api/create-check :model/Notification body)
  (let [notification (models.notification/hydrate-notification
                      (models.notification/create-notification!
                       (-> body
                           (update :payload_type keyword)
                           (assoc :creator_id api/*current-user-id*)
                           (dissoc :handlers :subscriptions))
                       (:subscriptions body)
                       (:handlers body)))]
    (when (card-notification? notification)
      (send-you-were-added-card-notification-email! notification))
    (events/publish-event! :event/notification-create {:object notification :user-id api/*current-user-id*})
    notification))

(defn- notify-notification-updates!
  "Send notification emails based on changes between updated and existing notification"
  [updated-notification existing-notification]
  (when (channel.settings/email-configured?)
    (let [was-active?  (:active existing-notification)
          is-active?   (:active updated-notification)
          current-user @api/*current-user*
          old-emails   (all-email-recipients existing-notification)
          new-emails   (all-email-recipients updated-notification)
          notification (update existing-notification :payload t2/hydrate :card)]
      (cond
        ;; Notification was just archived - notify all users they were unsubscribed
        (and was-active? (not is-active?))
        (messages/send-you-were-removed-notification-card-email! notification old-emails current-user)

        ;; Notification was just unarchived - notify all users they were added
        (and (not was-active?) is-active?)
        (messages/send-you-were-added-card-notification-email! notification new-emails @api/*current-user*)

        (not= old-emails new-emails)
        (let [[removed-recipients added-recipients _] (diff old-emails new-emails)]
          (when (seq removed-recipients)
            (messages/send-you-were-removed-notification-card-email! notification removed-recipients current-user))
          (when (seq added-recipients)
            (messages/send-you-were-added-card-notification-email! notification added-recipients @api/*current-user*)))))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   body :- ::models.notification/FullyHydratedNotification]
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (models.notification/update-notification! existing-notification body)
    (when (card-notification? existing-notification)
      (notify-notification-updates! body existing-notification))
    (u/prog1 (get-notification id)
      (events/publish-event! :event/notification-update {:object          <>
                                                         :previous-object existing-notification
                                                         :user-id         api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/send"
  "Send a notification by id."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query
   {:keys [handler_ids]} :- [:map [:handler_ids {:optional true} [:sequential ms/PositiveInt]]]]
  (let [notification (cond-> (get-notification id)
                       (seq handler_ids)
                       (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers))))]
    (api/read-check notification)
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

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/send"
  "Send an unsaved notification."
  [_route _query body :- ::models.notification/FullyHydratedNotification]
  (api/create-check :model/Notification body)
  (models.notification/validate-email-handlers! (:handlers body))
  (let [notification (-> body
                         (assoc :creator_id api/*current-user-id*)
                         promote-to-t2-instance)]
    (notification/send-notification! notification :notification/sync? true)))

(defn unsubscribe-user!
  "Unsubscribe a user from a notification."
  [notification-id user-id]
  (let [notification (get-notification notification-id)]
    (api/check-403 (models.notification/current-user-is-recipient? notification))
    (models.notification/unsubscribe-user! notification-id user-id)
    (u/prog1 (get-notification notification-id)
      (when (card-notification? <>)
        (u/ignore-exceptions
          (messages/send-you-unsubscribed-notification-card-email!
           (update <> :payload t2/hydrate :card)
           [(:email @api/*current-user*)])))
      (events/publish-event! :event/notification-unsubscribe {:object {:id notification-id}
                                                              :user-id api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/:id/unsubscribe"
  "Unsubscribe current user from a notification."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (unsubscribe-user! id api/*current-user-id*)
  api/generic-204-no-content)
