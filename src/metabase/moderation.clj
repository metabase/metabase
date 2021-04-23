(ns metabase.moderation
  (:require [metabase.models.card :refer [Card]]
            [metabase.models.dashboard :refer [Dashboard]]
            [toucan.db :as db]))

(def ^:const moderated-item-name->class
  "Map used to relate the type stored in the DB to the actual class of the moderated item (currently questions and
  dashboards)"
  {:card      Card
   :dashboard Dashboard})

(defn add-moderated-items
  "Efficiently add `moderated_item`s (Cards/Dashboards) to a collection of ModerationRequests or ModerationReviews"
  [requests-or-reviews]
  (when (seq requests-or-reviews)
    (let [item-id-map                    (group-by :moderated_item_type requests-or-reviews)
          moderated-items-by-type-and-id (group-by :item-type (map (fn [[item-type requests-or-reviews-for-type]]
                                                                     (let [item-class (get moderated-item-name->class item-type)
                                                                           item-ids (set (map :moderated_item_id requests-or-reviews-for-type))]
                                                                       {:item-type   item-type
                                                                        :items-by-id (group-by :id (db/select item-class :id item-ids))}))
                                                                   item-id-map))]
      (for [r requests-or-reviews]
        (assoc r :moderated_item
               (-> moderated-items-by-type-and-id
                   (get (:moderated_item_type r))
                   first
                   :items-by-id
                   (get (:moderated_item_id r))
                   first))))))
