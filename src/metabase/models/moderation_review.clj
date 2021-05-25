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

(s/defn ^:private newly-reviewed?
  [old-status :- (s/maybe statuses)
   new-status :- (s/maybe statuses)]
  (and
   (not= old-status new-status)
   (#{"misleading" "confusing" "verified"} new-status)))

(defn- resolve-requests!
  "Close all open requests for verification connected to the same question/dashboard"
  [{:keys [moderated_item_id moderated_item_type]}]
  (db/update-where! 'ModerationRequest {:moderated_item_id   moderated_item_id
                                        :moderated_item_type (name moderated_item_type)
                                        :type                "verification_request"
                                        :status              "open"}
    :status "resolved"))

(defn- pre-insert-or-update
  [maybe-old-review new-review]
  (u/prog1 new-review
    (when (newly-reviewed? (:status maybe-old-review) (:status new-review))
      (resolve-requests! (merge maybe-old-review new-review)))))

(defn- pre-insert
  [new-review]
  (pre-insert-or-update nil new-review))

(defn- pre-update
  [new-review]
  (pre-insert-or-update (ModerationReview (u/the-id new-review)) new-review))

(u/strict-extend (class ModerationReview)
  models/IModel
  (merge models/IModelDefaults
         {:properties (constantly {:timestamped? true})
          :types      (constantly {:moderated_item_type :keyword})
          :pre-insert pre-insert
          :pre-update pre-update})

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
  [review :- ReviewChanges]
  (let [id (u/the-id review)]
    (and (db/update! ModerationReview id review)
         (ModerationReview id))))
