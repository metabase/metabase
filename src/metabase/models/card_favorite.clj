(ns metabase.models.card-favorite
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.db :refer :all]
            (metabase.models [card :refer [Card]]
                             [interface :refer :all]
                             [user :refer [User]])))

(defentity CardFavorite
  [(table :report_cardfavorite)
   timestamped]

  (post-select [_ {:keys [card_id owner_id] :as card-favorite}]
    (assoc card-favorite
           :owner (delay (User owner_id))
           :card  (delay (Card card_id)))))
