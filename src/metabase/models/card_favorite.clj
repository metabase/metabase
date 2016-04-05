(ns metabase.models.card-favorite
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CardFavorite :report_cardfavorite)

(u/strict-extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)}))
