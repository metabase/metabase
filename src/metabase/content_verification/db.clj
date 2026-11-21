(ns metabase.content-verification.db
  "Application database queries for the content verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.content-verification.schema :as content-verification.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn moderation-reviews-for-items
  "The ModerationReviews of the items with `item-types` and `item-ids`, newest first."
  [item-types :- [:set :keyword]
   item-ids   :- [:sequential ms/PositiveInt]]
  (t2/select :model/ModerationReview
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             {:order-by [[:id :desc]]}))

(mu/defn users
  "The Users with `user-ids`."
  [user-ids :- [:maybe [:sequential [:maybe ::lib.schema.id/user]]]]
  (t2/select :model/User :id [:in user-ids]))

(mu/defn most-recent-moderation-review-statuses
  "The item id, item type, and status of the most recent ModerationReviews of the items with `item-types` and
  `item-ids`, newest first."
  [item-types :- [:set :keyword]
   item-ids   :- [:sequential ms/PositiveInt]]
  (t2/select [:model/ModerationReview :moderated_item_id :moderated_item_type :status]
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             :most_recent true
             {:order-by [[:id :desc]]}))

(mu/defn delete-moderation-reviews-beyond-newest!
  "Delete the ModerationReviews of the item with `item-id` and `item-type` beyond its newest `n`."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]
   n         :- ms/PositiveInt]
  (t2/delete! :model/ModerationReview
              {:where [:in :id
                       ^:allow-subquery
                       {:select [:id]
                        :from   [[^:allow-subquery
                                  {:select [:id
                                            [[:over [[:row_number]
                                                     ^:allow-subquery {:order-by [[:id :desc]]}]]
                                             :rn]]
                                   :from   [:moderation_review]
                                   :where  [:and
                                            [:= :moderated_item_id item-id]
                                            [:= :moderated_item_type (name item-type)]]}
                                  :ranked]]
                        :where  [:> :rn n]}]}))

(mu/defn unmark-most-recent-moderation-reviews!
  "Clear `most_recent` on the ModerationReviews of the item with `item-id` and `item-type` other than `review-id`."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]
   review-id :- ms/PositiveInt]
  (t2/update! :model/ModerationReview
              {:moderated_item_id item-id, :moderated_item_type item-type, :most_recent true, :id [:not= review-id]}
              {:most_recent false}))

(mu/defn insert-moderation-review!
  "Insert the ModerationReview `row` and return the inserted instance."
  [row :- (mut/select-keys ::content-verification.schema/moderation-review.update [:moderated_item_id :moderated_item_type :moderator_id :status :text :most_recent])]
  (t2/insert-returning-instance! :model/ModerationReview row))

(mu/defn delete-card-reviews!
  "Delete the ModerationReviews of the Cards with `card-ids`, returning the number deleted. By table name, so search's
  delete capture skips it: these reviews only feed the Cards being deleted."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/delete! (t2/table-name :model/ModerationReview) :moderated_item_type "card" :moderated_item_id [:in card-ids]))
