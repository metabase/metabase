(ns metabase.models.moderation-request
  (:require [metabase.models.interface :as i]
            [metabase.models.permissions :as perms]
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
    :moderated_item_type     (s/enum "card" "dashboard")
    :requester_id            su/IntGreaterThanZero
    :type                    types
    (s/optional-key :status) statuses
    (s/optional-key :text)   (s/maybe s/Str)}]
  (db/insert! ModerationRequest params))
