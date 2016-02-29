(ns metabase.models.card-favorite
  (:require [metabase.models.interface :as i]))

(i/defentity CardFavorite :report_cardfavorite)

(extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)}))
