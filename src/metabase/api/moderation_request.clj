(ns metabase.api.moderation-request
  (:require [compojure.core :refer [GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.moderation-request :as moderation-request :refer [ModerationRequest]]
            [metabase.moderation :as moderation]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(api/defendpoint GET "/"
  "Fetch all moderation requests"
  []
  (db/select ModerationRequest))

(api/defendpoint POST "/"
  "Create a new `ModerationRequest`."
  [:as {{:keys [text type moderated_item_id moderated_item_type status]} :body}]
  {:text                    (s/maybe s/Str)
   :type                    moderation-request/types
   :moderated_item_id       su/IntGreaterThanZero
   :moderated_item_type     moderation/moderated-item-types
   (s/optional-key :status) moderation-request/statuses}
  (let [request-data (merge {:text                text
                             :type                type
                             :moderated_item_id   moderated_item_id
                             :moderated_item_type moderated_item_type
                             :requester_id        api/*current-user-id*}
                            (when status {:status status}))]
    ;;TODO permissions
    (api/check-500
     (moderation-request/create-request! request-data))))

(api/defendpoint PUT "/:id"
  [id :as {{:keys [text type moderated_item_id moderated_item_type status closed_by_id] :as request-updates} :body}]
  {(s/optional-key :text)                (s/maybe s/Str)
   (s/optional-key :type)                moderation-request/types
   (s/optional-key :moderated_item_id)   su/IntGreaterThanZero
   (s/optional-key :moderated_item_type) moderation/moderated-item-types
   (s/optional-key :status)              moderation-request/statuses
   (s/optional-key :closed_by_id)        su/IntGreaterThanZero}
  ;; TODO permissions
  (moderation-request/update-request!
   (assoc (select-keys request-updates [:text :type :moderated_item_id :moderated_item_type :status :closed_by_id])
          :id id)))

(api/define-routes)
