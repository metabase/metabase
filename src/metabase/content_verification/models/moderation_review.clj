(ns metabase.content-verification.models.moderation-review
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.content-verification.db :as content-verification.db]
   [metabase.content-verification.impl :as moderation]
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.malli :as mu]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def Statuses
  "Schema of valid statuses"
  ::content-verification.schema/moderation-review.status)

;;; currently unused, but I'm leaving this in commented out because it serves as documentation
(comment
  (def ReviewChanges
    "Schema for a ModerationReview that's being updated (so most keys are optional)"
    [:map
     [:id                  {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_id   {:optional true} mu/IntGreaterThanZero]
     [:moderated_item_type {:optional true} moderation/moderated-item-types]
     [:status              {:optional true} Statuses]
     [:text                {:optional true} [:maybe :string]]]))

(def max-moderation-reviews
  "The amount of moderation reviews we will keep on hand."
  10)

(methodical/defmethod t2/table-name :model/ModerationReview [_model] :moderation_review)

(doto :model/ModerationReview
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/events)
  (derive :search/indexed))

(t2/deftransforms :model/ModerationReview
  {:moderated_item_type mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(t2/define-before-insert :model/ModerationReview
  [review]
  (cond-> review
    (nil? (:most_recent review)) (assoc :most_recent true)))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- root-collection-permission-at-least?
  "Whether the current user has `permission` or more on the default root Collection, which a ModerationReview, having
  no Collection of its own, is checked against."
  [permission]
  (perms/collection-permission-at-least?
   (get (perms/collection-permissions-for-user (api/current-user-info) [nil] {:root-namespace nil}) nil)
   permission))

(methodical/defmethod t2/batched-hydrate [:model/ModerationReview :can_read]
  [_model _k reviews]
  (let [can-read (root-collection-permission-at-least? :read)]
    (for [review reviews]
      (when review
        (vary-meta review assoc :can_read can-read)))))

(methodical/defmethod t2/batched-hydrate [:model/ModerationReview :can_write]
  [_model _k reviews]
  (let [can-write (root-collection-permission-at-least? :read-and-write)]
    (for [review reviews]
      (when review
        (assoc review :can_write can-write)))))

(defmethod mi/can-create? :model/ModerationReview
  [_model _review]
  (root-collection-permission-at-least? :read-and-write))

;;; ---------------------------------------------------- Writes ------------------------------------------------------

(mu/defn create-moderation-review! :- ::content-verification.schema/moderation-review
  "Create a new ModerationReview from `row` as the most recent of its item: the item's other reviews lose the mark, and
  those beyond the newest [[max-moderation-reviews]] are deleted."
  [row :- ::content-verification.schema/moderation-review.create]
  (t2/with-transaction [_conn]
    (let [{:keys [id moderated_item_id moderated_item_type] :as review}
          (content-verification.db/insert-moderation-review! row)]
      (content-verification.db/unmark-most-recent-moderation-reviews! moderated_item_id moderated_item_type id)
      (content-verification.db/delete-moderation-reviews-beyond-newest! moderated_item_id moderated_item_type
                                                                        max-moderation-reviews)
      review)))

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod events/spec :model/ModerationReview
  [_model]
  {:create :event/moderation-review-create
   :update :event/moderation-review-update
   :delete :event/moderation-review-delete})

(defmethod app-db-copy/spec :model/ModerationReview [_model]
  {:skip? false})
