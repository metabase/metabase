(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.models.notification :as models.notification]
   [metabase.notification.core :as notification]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- get-notification
  [id]
  (some-> (t2/select-one :model/Notification id)
          models.notification/hydrate-notification))

(api/defendpoint GET "/:id"
  "Get a notification by id."
  [id]
  {id  ms/PositiveInt}
  (api/check-404 (get-notification id)))

(mr/def ::FullyHydratedNotificationAPI
  (mut/dissoc ::models.notification/FullyHydratedNotification :creator_id))

(api/defendpoint POST "/"
  "Create a new notification, return the created notification."
  [:as {body :body}]
  {body ::FullyHydratedNotificationAPI}
  (and (:creator_id body)
       (not= api/*current-user-id* (:creator_id body))
       (throw (ex-info "Invalid creator_id" {:status-code 400})))
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
    (api/check-404 existing-notification)
    (models.notification/update-notification! existing-notification body)
    (get-notification id)))

(api/defendpoint POST "/:id/send"
  "Send a notification by id."
  [id :as {{:keys [handler_ids]} :body}]
  {id          ms/PositiveInt
   handler_ids [:maybe [:sequential ms/PositiveInt]]}
  (api/let-404 [existing-notification (get-notification id)]
    (cond-> existing-notification
      (seq handler_ids)
      (update :handlers (fn [handlers] (filter (comp (set handler_ids) :id) handlers)))

      true
      (notification/send-notification! :notification/sync? true))))

(api/defendpoint POST "/send"
  "Send an unsaved notification."
  [:as {body :body}]
  {body ::models.notification/FullyHydratedNotification}
  (notification/send-notification! body :notification/sync? true))

(api/define-routes)
