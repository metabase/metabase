(ns metabase.content-verification.models.moderation-review
  (:require
   [metabase.api.common :as api]
   [metabase.content-verification.db :as content-verification.db]
   [metabase.content-verification.impl :as moderation]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(def statuses
  "Schema enum of the acceptable values for the `status` column"
  #{"verified" nil})

(def Statuses
  "Schema of valid statuses"
  [:maybe (into [:enum] statuses)])

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
  (derive :hook/search-index))

(t2/deftransforms :model/ModerationReview
  {:moderated_item_type mi/transform-keyword})

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-status
  "Throws a 400 unless `status` is one of [[statuses]]."
  [status]
  (when-not (contains? statuses status)
    (throw (ex-info (tru "Invalid moderation review status.") {:status-code 400}))))

(defn- check-item-type
  "Throws a 400 unless `item-type` names a model that can be moderated."
  [item-type]
  (when-not (contains? moderation/moderated-item-type->model item-type)
    (throw (ex-info (tru "Invalid moderated item type.") {:status-code 400}))))

(defn- delete-extra-reviews!
  "Delete the reviews of the item with `item-id` and `item-type` beyond the newest `max-moderation-reviews`."
  [item-id item-type]
  (let [;; cannot put the offset in this query as mysql doesn't play nice. It requires a limit as well which we do
        ;; not want to give. The offset is only 10 though so its not a huge savings.
        ids (into #{} (comp (map :id)
                            (drop max-moderation-reviews))
                  (content-verification.db/moderation-review-ids-for-item item-id item-type))]
    (when (seq ids)
      (content-verification.db/delete-moderation-reviews! ids))))

(t2/define-before-insert :model/ModerationReview
  [review]
  (check-status (:status review))
  (check-item-type (:moderated_item_type review))
  (assoc review :most_recent true))

(t2/define-after-insert :model/ModerationReview
  [{:keys [id moderated_item_id moderated_item_type] :as review}]
  (content-verification.db/unmark-most-recent-moderation-reviews! moderated_item_id moderated_item_type id)
  (delete-extra-reviews! moderated_item_id (name moderated_item_type))
  review)

(t2/define-before-update :model/ModerationReview
  [review]
  (let [changes (t2/changes review)]
    (when (contains? changes :status)
      (check-status (:status review)))
    (when (contains? changes :moderated_item_type)
      (check-item-type (:moderated_item_type review))))
  review)

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

(mu/defn create-review!
  "Create a new ModerationReview, which its hooks mark as the most recent of its item."
  [params :-
   [:map {:closed true}
    [:moderated_item_id       ms/PositiveInt]
    [:moderated_item_type     moderation/moderated-item-types]
    [:moderator_id            ms/PositiveInt]
    [:status              {:optional true} Statuses]
    [:text                {:optional true} [:maybe :string]]]]
  (content-verification.db/insert-moderation-review! params))
