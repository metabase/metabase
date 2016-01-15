(ns metabase.models.card-favorite
  (:require (metabase.models [card :refer [Card]]
                             [interface :as i]
                             [user :refer [User]])
            [metabase.util :as u]))

(i/defentity CardFavorite :report_cardfavorite)

(extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)}))

(u/require-dox-in-this-namespace)
