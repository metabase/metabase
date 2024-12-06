(ns metabase.api.notification
  "/api/notification endpoints"
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.notification :as models.notification]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn get-notification
  [id]
  (models.notification/hydrate-notification
     (t2/select-one :model/Notification id)))

(api/defendpoint GET "/:id"
  "Get a notification by id."
  [id]
  {id  ms/PositiveInt}
  (api/check-404 (get-notification id)))


(api/defendpoint POST "/"
  "Create a new notification, return the created notification."
  [:as {body :body}]
  {body models.notification/FullyHydratedNotification}
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
   body models.notification/FullyHydratedNotification}
  (let [existing-notification (get-notification id)]
    (api/check-404 existing-notification)
    (models.notification/update-notification! existing-notification body)
    (get-notification id)))

(api/define-routes)
