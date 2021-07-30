(ns metabase.moderation
  (:require [clojure.string :as str]
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
  {:batched-hydrate :moderation_reviews}
  [items]
  (when (seq items)
    (let [all-reviews (group-by (juxt :moderated_item_type :moderated_item_id)
                                (db/select 'ModerationReview
                                           :moderated_item_type "card"
                                           :moderated_item_id [:in (map :id items)]
                                           {:order-by [[:id :desc]]}))]
      (tap> all-reviews)
      (for [item items]
        (let [k ((juxt (comp keyword object->type) u/the-id) item)]
          (assoc item :moderation_reviews (get all-reviews k ())))))))

(defn moderated-item
  "The moderated item for a given request or review"
  {:hydrate :moderated_item}
  [{:keys [moderated_item_id moderated_item_type]}]
  (when (and moderated_item_type moderated_item_id)
    (db/select-one (moderated-item-type->model moderated_item_type) :id moderated_item_id)))
