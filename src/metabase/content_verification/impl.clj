(ns metabase.content-verification.impl
  (:require
   [medley.core :as m]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(def moderated-item-types
  "Schema enum of the acceptable values for the `moderated_item_type` column"
  [:enum "card" :card "dashboard" :dashboard])

(def moderated-item-type->model
  "Maps DB name of the moderated item type to the model symbol (used for t2/select and such)"
  {"card" :model/Card
   :card  :model/Card
   "dashboard" :model/Dashboard
   :dashboard :model/Dashboard})

(defn- object->type
  "Convert a moderated item instance to the keyword stored in the database"
  [instance]
  (u/lower-case-en (name (t2/model instance))))

(mi/define-batched-hydration-method moderation-reviews-for-items
  :moderation_reviews
  "Hydrate moderation reviews onto a seq of items."
  [items]
  ;; no need to do work on empty items. Also, can have nil here due to text cards. I think this is a bug in toucan. To
  ;; get here we are `(t2/hydrate dashboard [:dashcards [:card :moderation_reviews] :series] ...)` But dashcards
  ;; dont have to have cards. but the hydration will pass the nil card id into here.  NOTE: it is important that each
  ;; item that comes into this comes out. The nested hydration is positional, not by an id so everything that comes in
  ;; must go out in the same order
  (when (seq items)
    (let [item-ids    (not-empty (keep :id items))
          all-reviews (when item-ids
                        (group-by (juxt :moderated_item_type :moderated_item_id)
                                  (t2/select :model/ModerationReview
                                             :moderated_item_id [:in item-ids]
                                             {:order-by [[:id :desc]]})))]
      (for [item items]
        (if (nil? item)
          nil
          (let [k ((juxt (comp keyword object->type) u/the-id) item)]
            (assoc item :moderation_reviews (get all-reviews k ()))))))))

(mi/define-batched-hydration-method moderation-user-details
  :moderator_details
  "User details on moderation reviews"
  [moderation-reviews]
  (when (seq moderation-reviews)
    (let [id->user (m/index-by :id
                               (t2/select 'User :id [:in (map :moderator_id moderation-reviews)]))]
      (for [mr moderation-reviews]
        (assoc mr :user (get id->user (:moderator_id mr)))))))

(mi/define-batched-hydration-method moderation-status
  :moderation_status
  "Hydrate moderation status onto a seq of items"
  [items]
  (when (seq items)
    (let [item-ids (seq (keep :id items))
          type+id->status (when item-ids
                            (->> (t2/select [:model/ModerationReview :moderated_item_id :moderated_item_type :status]
                                            :moderated_item_id [:in item-ids]
                                            :most_recent true
                                            {:order-by [[:id :desc]]})
                                 (group-by (juxt :moderated_item_type :moderated_item_id))
                                 (m/map-vals #(:status (first %)))))]
      (for [item items]
        (some-> item
                (assoc :moderation_status (get type+id->status [(keyword (object->type item))
                                                                (u/the-id item)])))))))
