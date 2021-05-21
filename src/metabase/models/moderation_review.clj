(ns metabase.models.moderation-review
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
  (s/enum "verified" "misleading" "confusing" "not_misleading" "pending"))

(models/defmodel ModerationReview :moderation_review)

(u/strict-extend (class ModerationReview)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})})

  ;; Todo: this is wrong, but what should it be?
  i/IObjectPermissions
  perms/IObjectPermissionsForParentCollection)


(s/defn create-review!
  "Create a new ModerationReview"
  [params :-
   {:moderated_item_id       su/IntGreaterThanZero
    :moderated_item_type     moderation/moderated-item-types
    :moderator_id            su/IntGreaterThanZero
    (s/optional-key :status) statuses
    (s/optional-key :text)   (s/maybe s/Str)}]
  (db/insert! ModerationReview params))

(s/defn update-review!
  "Update the given keys for an existing ModerationReview with the given `:id`"
  [review :-
   {:id                                   su/IntGreaterThanZero
    (s/optional-key :moderated_item_id)   su/IntGreaterThanZero
    (s/optional-key :moderated_item_type) moderation/moderated-item-types
    (s/optional-key :status)              statuses
    (s/optional-key :text)                (s/maybe s/Str)}]
  (when (db/update! ModerationReview (u/the-id review) (dissoc review :id))
    (ModerationReview (u/the-id review))))
