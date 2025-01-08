(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [clojure.data :refer [diff]]
   [compojure.core :refer [DELETE GET POST PUT]]
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.events :as events]
   [metabase.models.interface :as mi]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-notification
  [id]
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

(defn- card-notification?
  [notification]
  (= :notification/card (:payload_type notification)))

(api/defendpoint GET "/"
  "List notifications.
  - `creator_id`: if provided returns only notifications created by this user
  - `recipient_id`: if provided returns only notification that has recipient_id as a recipient
  - `card_id`: if provided returns only notification that has card_id as payload"
  [creator_id recipient_id card_id include_inactive]
  {creator_id       [:maybe ms/PositiveInt]
   recipient_id     [:maybe ms/PositiveInt]
   card_id          [:maybe ms/PositiveInt]
   include_inactive [:maybe ms/BooleanValue]}
  (->> (t2/select :model/Notification
                  (cond-> {}
                    creator_id
                    (sql.helpers/where [:= :notification.creator_id creator_id])

                    card_id
                    (-> (sql.helpers/left-join
                         :notification_card
                         [:and
                          [:= :notification_card.id :notification.payload_id]
                          [:= :notification.payload_type "notification/card"]])
                        (sql.helpers/where [:= :notification_card.card_id card_id]))

                    recipient_id
                    (-> (sql.helpers/left-join
                         :notification_handler [:= :notification_handler.notification_id :notification.id])
                        (sql.helpers/left-join
                         :notification_recipient [:= :notification_recipient.notification_handler_id :notification_handler.id])
                        (sql.helpers/where [:= :notification_recipient.user_id recipient_id]))

                    (not (true? include_inactive))
                    (sql.helpers/where [:= :notification.active true])))
       (filter mi/can-read?)
       (map models.notification/hydrate-notification)))

(api/defendpoint GET "/:id"
  "Get a notification by id."
  [id]
  {id ms/PositiveInt}
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
  (when (email/email-configured?)
    (messages/send-you-were-added-card-notification-email!
     (update notification :payload t2/hydrate :card) (all-email-recipients notification) @api/*current-user*)))

(api/defendpoint POST "/"
  "Create a new notification, return the created notification."
  [:as {body :body}]
  {body ::models.notification/FullyHydratedNotification}
  (api/create-check :model/Notification body)
  (let [notification (models.notification/hydrate-notification
                      (models.notification/create-notification!
                       (-> body
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
  (when (email/email-configured?)
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

(api/defendpoint PUT "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification."
  [id :as {body :body}]
  {id   ms/PositiveInt
   body ::models.notification/FullyHydratedNotification}
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (models.notification/update-notification! existing-notification body)
    (when (card-notification? existing-notification)
      (notify-notification-updates! body existing-notification))
    (u/prog1 (get-notification id)
      (events/publish-event! :event/notification-update {:object          <>
                                                         :previous-object existing-notification
                                                         :user-id         api/*current-user-id*}))))

(api/defendpoint POST "/:id/send"
  "Send a notification by id."
  [id :as {{:keys [handler_ids]} :body}]
  {id          ms/PositiveInt
   handler_ids [:maybe [:sequential ms/PositiveInt]]}
  (let [notification (get-notification id)]
    (api/read-check notification)
    (cond-> notification
      (seq handler_ids)
      (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers)))

      true
      (notification/send-notification! :notification/sync? true))))

(api/defendpoint POST "/send"
  "Send an unsaved notification."
  [:as {body :body}]
  {body ::models.notification/FullyHydratedNotification}
  (api/create-check :model/Notification body)
  (notification/send-notification! body :notification/sync? true))

(api/defendpoint POST "/:id/unsubscribe"
  "Unsubscribe current user from a notification."
  [id]
  {id ms/PositiveInt}
  (let [notification (get-notification id)]
    (api/check-403 (models.notification/can-unsubscribe? notification))
    (when (pos? (models.notification/unsubscribe-user! id api/*current-user-id*))
      (let [user-email   (:email @api/*current-user*)
            notification (get-notification id)]
        (when (card-notification? notification)
          (u/ignore-exceptions
            (messages/send-you-unsubscribed-notification-card-email!
             (update notification :payload t2/hydrate :card)
             [user-email])))
        (events/publish-event! :event/notification-unsubscribe {:object {:id id}
                                                                :user-id api/*current-user-id*})
        nil))))

(api/define-routes)
