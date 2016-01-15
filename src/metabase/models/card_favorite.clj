(ns metabase.models.card-favorite
  (:require (metabase.models [card :refer [Card]]
                             [interface :as i]
                             [user :refer [User]])))

(i/defentity CardFavorite :report_cardfavorite)

(defn- post-select [{:keys [card_id owner_id] :as card-favorite}]
  (assoc card-favorite
         :owner (delay (User owner_id))
         :card  (delay (Card card_id))))

(extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)
          :post-select  post-select}))
