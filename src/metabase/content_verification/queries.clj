(ns metabase.content-verification.queries
  "Application database queries for the content verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [toucan2.core :as t2]))

(defn moderation-reviews-for-items
  "The ModerationReviews of the items with `item-types` and `item-ids`, newest first."
  [item-types item-ids]
  (t2/select :model/ModerationReview
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             {:order-by [[:id :desc]]}))

(defn users
  "The Users with `user-ids`."
  [user-ids]
  (t2/select :model/User :id [:in user-ids]))

(defn most-recent-moderation-review-statuses
  "The item id, item type, and status of the most recent ModerationReviews of the items with `item-types` and
  `item-ids`, newest first."
  [item-types item-ids]
  (t2/select [:model/ModerationReview :moderated_item_id :moderated_item_type :status]
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             :most_recent true
             {:order-by [[:id :desc]]}))

(defn delete-moderation-reviews!
  "Delete the ModerationReviews with `ids`."
  [ids]
  (t2/delete! :model/ModerationReview :id [:in ids]))

(defn unmark-most-recent-moderation-reviews!
  "Clear `most_recent` on the ModerationReviews of the item with `item-id` and `item-type`."
  [item-id item-type]
  (t2/update! :model/ModerationReview
              {:moderated_item_id item-id, :moderated_item_type item-type}
              {:most_recent false}))

(defn insert-moderation-review!
  "Insert the ModerationReview `row` and return the inserted instance."
  [row]
  (t2/insert-returning-instance! :model/ModerationReview row))
