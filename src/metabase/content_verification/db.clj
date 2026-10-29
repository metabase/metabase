(ns metabase.content-verification.db
  "Application database queries for the content verification module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself (model definitions still use `toucan2.core`)."
  (:require
   [malli.util :as mut]
   [metabase.app-db.core :as app-db]
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

(mu/defn moderation-review-ids-for-item
  "The ids of the ModerationReviews of the item with `item-id` and `item-type`, newest first."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]]
  (app-db/query {:select   [:id]
                 :from     [:moderation_review]
                 :where    [:and
                            [:= :moderated_item_id item-id]
                            [:= :moderated_item_type item-type]]
                 :order-by [[:id :desc]]}))

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

(mu/defn delete-moderation-reviews!
  "Delete the ModerationReviews with `ids`."
  [ids :- [:set ms/PositiveInt]]
  (t2/delete! :model/ModerationReview :id [:in ids]))

(mu/defn unmark-most-recent-moderation-reviews!
  "Clear `most_recent` on the ModerationReviews of the item with `item-id` and `item-type`."
  [item-id   :- ms/PositiveInt
   item-type :- [:or :string :keyword]]
  (t2/update! :model/ModerationReview
              {:moderated_item_id item-id, :moderated_item_type item-type}
              {:most_recent false}))

(mu/defn insert-moderation-review!
  "Insert the ModerationReview `row` and return the inserted instance."
  [row :- (mut/select-keys ::content-verification.schema/moderation-review.update [:moderated_item_id :moderated_item_type :moderator_id :status :text :most_recent])]
  (t2/insert-returning-instance! :model/ModerationReview row))

(mu/defn verified-item-ids
  "The IDs of the items of `item-type` (among `item-ids` when given) whose most recent moderation review is verified."
  [{:keys [item-ids item-type]}
   :- [:map {:closed true}
       [:item-type :string]
       [:item-ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]]]
  (apply t2/select-fn-set :moderated_item_id :model/ModerationReview
         (cond-> [:moderated_item_type [:auto/param item-type]
                  :most_recent         true
                  :status              "verified"]
           (some? item-ids) (conj :moderated_item_id [:in item-ids]))))

(mu/defn latest-moderation-review-status-row
  "The `:status` row of the most recent moderation review of the item with `item-id` of `item-type`, or nil."
  [{:keys [item-id item-type]} :- [:map {:closed true} [:item-id ms/PositiveInt] [:item-type :string]]]
  (t2/select-one [:model/ModerationReview :status]
                 :moderated_item_id [:auto/param item-id]
                 :moderated_item_type [:auto/param item-type]
                 :most_recent true
                 {:order-by [[:id :desc]]}))

(mu/defn moderation-review-exists?
  "Whether any ModerationReview exists."
  []
  (t2/exists? :model/ModerationReview))

(mu/defn users
  "The Users with `user-ids`."
  [user-ids :- [:maybe [:sequential [:maybe ::lib.schema.id/user]]]]
  (t2/select :model/User :id [:in user-ids]))
