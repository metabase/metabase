(ns metabase.content-verification.write
  "The writes of ModerationReview."
  (:require
   [metabase.content-verification.db :as content-verification.db]
   [metabase.content-verification.impl :as moderation]
   [metabase.content-verification.models.moderation-review :as moderation-review]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(defn- delete-extra-reviews!
  "Delete the reviews of the item with `item-id` and `item-type` beyond the newest [[moderation-review/max-moderation-reviews]]."
  [item-id item-type]
  (let [;; cannot put the offset in this query as mysql doesn't play nice. It requires a limit as well which we do
        ;; not want to give. The offset is only 10 though so its not a huge savings.
        ids (into #{} (comp (map :id)
                            (drop moderation-review/max-moderation-reviews))
                  (content-verification.db/moderation-review-ids-for-item item-id item-type))]
    (when (seq ids)
      (content-verification.db/delete-moderation-reviews! ids))))

(mu/defn create-review!
  "Create a new ModerationReview as the most recent of its item: the item's other reviews lose the mark, and those
  beyond the newest [[moderation-review/max-moderation-reviews]] are deleted."
  [params :-
   [:map {:closed true}
    [:moderated_item_id       ms/PositiveInt]
    [:moderated_item_type     moderation/moderated-item-types]
    [:moderator_id            ms/PositiveInt]
    [:status              {:optional true} moderation-review/Statuses]
    [:text                {:optional true} [:maybe :string]]]]
  (t2/with-transaction [_conn]
    (let [{:keys [id moderated_item_id moderated_item_type] :as review}
          (content-verification.db/insert-moderation-review! params)]
      (content-verification.db/unmark-most-recent-moderation-reviews! moderated_item_id moderated_item_type id)
      (delete-extra-reviews! moderated_item_id (name moderated_item_type))
      review)))
