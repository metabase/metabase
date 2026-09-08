(ns metabase.content-verification.db
  "Application database queries for the content verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [metabase.app-db.core :as app-db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn moderation-reviews-for-items :- [:sequential (ms/InstanceOf :model/ModerationReview)]
  "The ModerationReviews of the items with `item-types` and `item-ids`, newest first."
  [item-types :- [:seqable :keyword]
   item-ids   :- [:seqable ms/PositiveInt]]
  (t2/select :model/ModerationReview
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             {:order-by [[:id :desc]]}))

(mu/defn users :- [:sequential (ms/InstanceOf :model/User)]
  "The Users with `user-ids`."
  [user-ids :- [:seqable ms/PositiveInt]]
  (t2/select :model/User :id [:in user-ids]))

(mu/defn moderation-review-ids-for-item :- [:sequential [:map {:closed true} [:id ms/PositiveInt]]]
  "The ids of the ModerationReviews of the item with `item-id` and `item-type`, newest first."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]]
  (app-db/query {:select   [:id]
                 :from     [:moderation_review]
                 :where    [:and
                            [:= :moderated_item_id item-id]
                            [:= :moderated_item_type item-type]]
                 :order-by [[:id :desc]]}))

(mu/defn most-recent-moderation-review-statuses :- [:sequential (ms/InstanceOf :model/ModerationReview)]
  "The item id, item type, and status of the most recent ModerationReviews of the items with `item-types` and
  `item-ids`, newest first."
  [item-types :- [:seqable :keyword]
   item-ids   :- [:seqable ms/PositiveInt]]
  (t2/select [:model/ModerationReview :moderated_item_id :moderated_item_type :status]
             :moderated_item_type [:in item-types]
             :moderated_item_id [:in item-ids]
             :most_recent true
             {:order-by [[:id :desc]]}))

(mu/defn delete-moderation-reviews! :- :int
  "Delete the ModerationReviews with `ids`."
  [ids :- [:seqable ms/PositiveInt]]
  (t2/delete! :model/ModerationReview :id [:in ids]))

(mu/defn unmark-most-recent-moderation-reviews! :- :int
  "Clear `most_recent` on the ModerationReviews of the item with `item-id` and `item-type`."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]]
  (t2/update! :model/ModerationReview
              {:moderated_item_id item-id, :moderated_item_type item-type}
              {:most_recent false}))

(mu/defn insert-moderation-review! :- (ms/InstanceOf :model/ModerationReview)
  "Insert the ModerationReview `row` and return the inserted instance."
  [row :- [:map {:closed true}
           [:moderated_item_id                 {:optional true} :any]
           [:moderated_item_type               {:optional true} :any]
           [:moderator_id                      {:optional true} :any]
           [:status                            {:optional true} :any]
           [:text                              {:optional true} :any]
           [:most_recent                       {:optional true} :any]]]
  (t2/insert-returning-instance! :model/ModerationReview row))
