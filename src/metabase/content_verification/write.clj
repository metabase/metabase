(ns metabase.content-verification.write
  "The write functions of ModerationReviews, through which every writer creates, updates and deletes them."
  (:require
   [metabase.content-verification.db :as content-verification.db]
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def max-moderation-reviews
  "The amount of moderation reviews we will keep on hand."
  10)

(mu/defn update-reviews! :- :int
  "Apply `changes` to `reviews`, ModerationReviews the caller already loaded, in one statement for those the changes
  update alike, and publish their update events, returning the number of reviews updated; for `create-review!` and
  generic writers."
  [reviews :- [:sequential :map]
   changes :- ::content-verification.schema/moderation-review.update
   _opts   :- ::content-verification.schema/write-opts]
  (let [now   (mi/now)
        plans (into [] (keep (fn [review]
                               (when-let [changes (not-empty (into {} (remove (fn [[k v]] (= v (get review k)))) changes))]
                                 [review (cond-> changes
                                           (not (contains? changes :updated_at)) (assoc :updated_at now))])))
                    reviews)]
    (when (seq plans)
      (events/with-batched-events
        (doseq [[final group] (group-by second plans)]
          (content-verification.db/update-moderation-reviews! (mapv (comp :id first) group) final)
          (doseq [[review _] group]
            (events/updated! :model/ModerationReview (merge review final) review)))))
    (count plans)))

(mu/defn update-review! :- :int
  "Apply `changes` to `review-or-id`, a ModerationReview the caller already loaded or the id of one, as
  [[update-reviews!]] does, returning the number of reviews updated; for generic writers."
  [review-or-id :- [:or ms/PositiveInt :map]
   changes      :- ::content-verification.schema/moderation-review.update
   opts         :- ::content-verification.schema/write-opts]
  (if-let [review (if (map? review-or-id) review-or-id (content-verification.db/moderation-review review-or-id))]
    (update-reviews! [review] changes opts)
    0))

(mu/defn delete-reviews! :- :int
  "Delete the ModerationReviews with `ids` and publish their delete events, returning the number deleted; for
  `create-review!` and generic writers."
  [ids   :- [:maybe [:sequential ms/PositiveInt]]
   _opts :- ::content-verification.schema/write-opts]
  (let [reviews (when (seq ids) (content-verification.db/moderation-reviews ids))]
    (if (empty? reviews)
      0
      (events/with-batched-events
        (events/deleting! :model/ModerationReview reviews
                          #(content-verification.db/delete-moderation-reviews! (mapv :id reviews)))))))

(defn- delete-extra-reviews!
  "Delete the reviews of the item with `item-id` and `item-type` beyond the newest `max-moderation-reviews`."
  [item-id item-type]
  (let [ids (into [] (comp (map :id) (drop max-moderation-reviews))
                  (content-verification.db/moderation-review-ids-for-item item-id item-type))]
    (delete-reviews! ids {})))

(defn supersede-older-reviews!
  "Unmark the reviews of the item of `review`, a new ModerationReview, other than it as the most recent, and delete
  the reviews of the item beyond the newest `max-moderation-reviews`; for the after-insert hook of ModerationReview,
  which every insert runs, as master's did."
  [{:keys [id moderated_item_id moderated_item_type]}]
  (let [item-type (name moderated_item_type)]
    (update-reviews! (content-verification.db/other-most-recent-moderation-reviews moderated_item_id item-type id)
                     {:most_recent false}
                     {})
    (delete-extra-reviews! moderated_item_id item-type)))

(mu/defn create-review!
  "Create a new ModerationReview, whose before-insert hook marks it the most recent of its item and whose after-insert
  hook supersedes the older ones; for the REST API."
  [params :- ::content-verification.schema/moderation-review.create]
  (events/with-batched-events
    (content-verification.db/insert-moderation-review! params)))

(defmethod mi/write-fns :model/ModerationReview
  [_model]
  {:update!     update-review!
   :update-all! update-reviews!
   :delete!     delete-reviews!})
