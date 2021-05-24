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

(def ReviewChanges
  "Schema for a ModerationReview that's being updated (so most keys are optional)"
  {(s/optional-key :id)                  su/IntGreaterThanZero
   (s/optional-key :moderated_item_id)   su/IntGreaterThanZero
   (s/optional-key :moderated_item_type) moderation/moderated-item-types
   (s/optional-key :status)              statuses
   (s/optional-key :text)                (s/maybe s/Str)
   s/Any                                 s/Any})

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

(defn- newly-verified?
  [old-status new-status]
  (and
   (not= "verified" old-status)
   (= "verified" new-status)))

(defn- resolve-requests!
  "All open moderation requests for verification connected to the same question/dashboard should be closed"
  [{:keys [moderated_item_id moderated_item_type]}]
  (db/update-where! 'ModerationRequest {:moderated_item_id   moderated_item_id
                                        :moderated_item_type (name moderated_item_type)
                                        :type                "verification_request"
                                        :status              "open"}
    :status "resolved"))

(s/defn post-update
  [old-review :- ReviewChanges, new-review :- ReviewChanges]
  (when (newly-verified? (:status old-review) (:status new-review))
    (resolve-requests! new-review)))

(s/defn update-review!
  "Update the given keys for an existing ModerationReview with the given `:id`"
  [review :- ReviewChanges]
  (let [id         (u/the-id review)
        old-review (ModerationReview id)]
    (when-let [new-review (and (db/update! ModerationReview id review)
                               (ModerationReview id))]
      (post-update old-review new-review)
      new-review)))
