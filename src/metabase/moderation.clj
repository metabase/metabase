(ns metabase.moderation
  (:require [clojure.string :as str]
            [medley.core :as m]
            [metabase.util :as u]
            [schema.core :as s]
            [toucan.db :as db]))

(def moderated-item-types
  "Schema enum of the acceptable values for the `moderated_item_type` column"
  (s/enum "card" "dashboard" :card :dashboard))

(def moderated-item-type->model
  "Maps DB name of the moderated item type to the model symbol (used for db/select and such)"
  {"card"      'Card
   :card       'Card
   "dashboard" 'Dashboard
   :dashboard  'Dashboard})

(defn- object->type
  "Convert a moderated item instance to the keyword stored in the database"
  [moderated-item]
  (str/lower-case (name moderated-item)))

(defn moderation-reviews-for-items
  "Hydrate moderation reviews onto a seq of items. All are cards or the nils that end up here on text dashboard
  cards. In the future could have dashboards here as well."
  {:batched-hydrate :moderation_reviews}
  [items]
  ;; no need to do work on empty items. Also, can have nil here due to text cards. I think this is a bug in toucan. To
  ;; get here we are `(hydrate dashboard [:ordered_cards [:card :moderation_reviews] :series] ...)` But ordered_cards
  ;; dont have to have cards. but the hydration will pass the nil card id into here.  NOTE: it is important that each
  ;; item that comes into this comes out. The nested hydration is positional, not by an id so everything that comes in
  ;; must go out in the same order
  (when (seq items)
    (let [item-ids    (not-empty (keep :id items))
          all-reviews (when item-ids
                        (group-by (juxt :moderated_item_type :moderated_item_id)
                                  (db/select 'ModerationReview
                                             :moderated_item_type "card"
                                             :moderated_item_id [:in item-ids]
                                             {:order-by [[:id :desc]]})))]
      (for [item items]
        (if (nil? item)
          nil
          (let [k ((juxt (comp keyword object->type) u/the-id) item)]
            (assoc item :moderation_reviews (get all-reviews k ()))))))))

(defn moderation-user-details
  "User details on moderation reviews"
  {:batched-hydrate :moderator_details}
  [moderation-reviews]
  (when (seq moderation-reviews)
    (let [id->user (m/index-by :id
                               (db/select 'User :id [:in (map :moderator_id moderation-reviews)]))]
      (for [mr moderation-reviews]
        (assoc mr :user (get id->user (:moderator_id mr)))))))

(defn moderated-item
  "The moderated item for a given request or review"
  {:hydrate :moderated_item}
  [{:keys [moderated_item_id moderated_item_type]}]
  (when (and moderated_item_type moderated_item_id)
    (db/select-one (moderated-item-type->model moderated_item_type) :id moderated_item_id)))
