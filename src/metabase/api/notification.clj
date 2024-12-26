(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [honey.sql.helpers :as sql.helpers]
   [metabase.api.common :as api]
   [metabase.models.interface :as mi]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-notification
  [id]
  (-> (t2/select-one :model/Notification id)
      api/check-404
      models.notification/hydrate-notification))

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

(api/defendpoint POST "/"
  "Create a new notification, return the created notification."
  [:as {body :body}]
  {body ::models.notification/FullyHydratedNotification}
  (api/create-check :model/Notification body)
  (models.notification/hydrate-notification
   (models.notification/create-notification!
    (dissoc body :handlers :subscriptions)
    (:subscriptions body)
    (:handlers body))))

(api/defendpoint PUT "/:id"
  "Update a notification, can also update its subscriptions, handlers.
  Return the updated notification."
  [id :as {body :body}]
  {id   ms/PositiveInt
   body ::models.notification/FullyHydratedNotification}
  (let [existing-notification (get-notification id)]
    (api/update-check existing-notification body)
    (models.notification/update-notification! existing-notification body)
    (get-notification id)))

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
    (models.notification/unsubscribe-user! id api/*current-user-id*)
    (get-notification id)))

(api/define-routes)
