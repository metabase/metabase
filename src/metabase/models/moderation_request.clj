(ns metabase.models.moderation-request
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
            [metabase.moderation :as moderation]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.models :as models]))

(def statuses
  "Schema enum of the acceptable values for the `status` column"
  (s/enum "dismissed" "resolved" "open"))

(def types
  "Schema enum of the acceptable values for the `type` column"
  (s/enum "verification_request" "something_wrong" "confused"))

(models/defmodel ModerationRequest :moderation_request)
(u/strict-extend (class ModerationRequest)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)

(s/defn create-request!
  "Create a new ModerationRequest"
  [params :-
   {:moderated_item_id       su/IntGreaterThanZero
    :moderated_item_type     moderation/moderated-item-types
    :requester_id            su/IntGreaterThanZero
    :type                    types
    (s/optional-key :status) statuses
    (s/optional-key :text)   (s/maybe s/Str)}]
  (db/insert! ModerationRequest params))

(s/defn update-request!
  "Update the given keys for an existing ModerationRequest with the given `:id`"
  [request :-
   {:id                                   su/IntGreaterThanZero
    (s/optional-key :moderated_item_id)   su/IntGreaterThanZero
    (s/optional-key :moderated_item_type) moderation/moderated-item-types
    (s/optional-key :type)                types
    (s/optional-key :status)              statuses
    (s/optional-key :text)                (s/maybe s/Str)
    (s/optional-key :closed_by_id)   su/IntGreaterThanZero}]
  (when (db/update! ModerationRequest (u/the-id request) (dissoc request :id))
    (ModerationRequest (u/the-id request))))
