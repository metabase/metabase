(ns metabase.content-verification.impl
  (:require
   [medley.core :as m]
   [metabase.content-verification.queries :as content-verification.queries]
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
    (let [items*      (keep identity items)
          item-ids    (not-empty (keep :id items*))
          ;; constrain on `:moderated_item_type` too so the `(moderated_item_type, moderated_item_id)` index is used
          item-types  (not-empty (into #{} (map (comp keyword object->type)) items*))
          all-reviews (when item-ids
                        (group-by (juxt :moderated_item_type :moderated_item_id)
                                  (content-verification.queries/moderation-reviews-for-items item-types item-ids)))]
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
                               (content-verification.queries/users (map :moderator_id moderation-reviews)))]
      (for [mr moderation-reviews]
        (assoc mr :user (get id->user (:moderator_id mr)))))))

(mi/define-batched-hydration-method moderation-status
  :moderation_status
  "Hydrate moderation status onto a seq of items"
  [items]
  (when (seq items)
    (let [items*     (keep identity items)
          item-ids   (seq (keep :id items*))
          ;; constrain on `:moderated_item_type` too so the `(moderated_item_type, moderated_item_id)` index is used
          item-types (not-empty (into #{} (map (comp keyword object->type)) items*))
          type+id->status (when item-ids
                            (->> (content-verification.queries/most-recent-moderation-review-statuses item-types item-ids)
                                 (group-by (juxt :moderated_item_type :moderated_item_id))
                                 (m/map-vals #(:status (first %)))))]
      (for [item items]
        (some-> item
                (assoc :moderation_status (get type+id->status [(keyword (object->type item))
                                                                (u/the-id item)])))))))
