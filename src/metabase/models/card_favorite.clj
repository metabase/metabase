(ns metabase.models.card-favorite
  (:require (metabase.models [card :refer [Card]]
                             [interface :as i]
                             [user :refer [User]])))

(i/defentity CardFavorite :report_cardfavorite)

(defn- ^:hydrate owner [{:keys [card_id]}]
  (Card card_id))

(extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)
          :card         (comp Card :card_id)}))
