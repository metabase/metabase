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

(defn- items-clause
  "The clause over the ModerationReview table for the reviews of `items`, `[item-type item-id]` pairs."
  [items]
  (into [:or]
        (map (fn [[item-type group]]
               [:and
                [:= :moderated_item_type [:auto/param (name item-type)]]
                [:in :moderated_item_id [:auto/param (mapv second group)]]]))
        (group-by first items)))

(mu/defn moderation-reviews-beyond-newest
  "The ModerationReviews of each of `items`, `[item-type item-id]` pairs, beyond its newest `n`."
  [items :- [:sequential {:min 1} [:tuple [:or :string :keyword] ms/PositiveInt]]
   n     :- ms/PositiveInt]
  (t2/select :model/ModerationReview
             {:where [:in :id
                      ^:allow-subquery
                      {:select [:id]
                       :from   [[^:allow-subquery
                                 {:select [:id
                                           [[:over [[:row_number]
                                                    ^:allow-subquery {:partition-by [:moderated_item_type :moderated_item_id]
                                                                      :order-by     [[:id :desc]]}]]
                                            :rn]]
                                  :from   [:moderation_review]
                                  :where  (items-clause items)}
                                 :ranked]]
                       :where  [:> :rn n]}]}))

(mu/defn delete-moderation-reviews!
  "Delete the ModerationReviews with `ids`, returning the number deleted."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/ModerationReview :id [:in ids]))

(mu/defn most-recent-moderation-reviews-except
  "The ModerationReviews of each of `items`, `[item-type item-id]` pairs, marked `most_recent` other than those with
  `review-ids`."
  [items      :- [:sequential {:min 1} [:tuple [:or :string :keyword] ms/PositiveInt]]
   review-ids :- [:sequential ms/PositiveInt]]
  (t2/select :model/ModerationReview
             {:where [:and
                      (items-clause items)
                      [:= :most_recent true]
                      [:not-in :id [:auto/param review-ids]]]}))

(mu/defn unmark-moderation-reviews!
  "Clear `most_recent` on the ModerationReviews with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (t2/update! :model/ModerationReview :id [:in ids] {:most_recent false}))

(mu/defn insert-moderation-reviews!
  "Insert the ModerationReview `rows` and return the inserted instances, in the order of `rows`."
  [rows :- [:sequential (mut/select-keys ::content-verification.schema/moderation-review.update
                                         [:moderated_item_id :moderated_item_type :moderator_id :status :text :most_recent])]]
  (app-db/insert-returning-instances! :model/ModerationReview rows))

(mu/defn moderation-review-ids-of-cards :- [:vector ms/PositiveInt]
  "The ids of the ModerationReviews of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (vec (t2/select-pks-vec :model/ModerationReview :moderated_item_type "card" :moderated_item_id [:in card-ids])))

(mu/defn moderation-reviews-by-ids
  "The ModerationReviews with `ids`."
  [ids :- [:sequential ms/PositiveInt]]
  (vec (t2/select :model/ModerationReview :id [:in ids])))
