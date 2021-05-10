(ns metabase.api.moderation-request
  (:require [compojure.core :refer [POST]]
            [metabase.api.common :as api]
            [metabase.models.moderation-request :as moderation-request]
            [metabase.moderation :as moderation]
            [metabase.util.schema :as su]
            [schema.core :as s]))

(api/defendpoint POST "/"
  "Create a new `ModerationRequest`."
  [:as {{:keys [text type moderated_item_id moderated_item_type status]} :body}]
  {text                    (s/maybe s/Str)
   type                    moderation-request/types
   moderated_item_id       su/IntGreaterThanZero
   moderated_item_type     moderation/moderated-item-types
   (s/optional-key status) moderation-request/statuses}
  (let [request-data (merge {:text                text
                             :type                type
                             :moderated_item_id   moderated_item_id
                             :moderated_item_type moderated_item_type
                             :requester_id        api/*current-user-id*}
                            (when status {:status status}))]
    ;;TODO permissions
    (api/check-500
     (moderation-request/create-request! request-data))))

(api/define-routes)
