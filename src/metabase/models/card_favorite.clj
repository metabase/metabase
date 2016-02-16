(ns metabase.models.card-favorite
  (:require [metabase.models.interface :as i]
            [metabase.util :as u]))

(i/defentity CardFavorite :report_cardfavorite)

(extend (class CardFavorite)
  i/IEntity
  (merge i/IEntityDefaults
         {:timestamped? (constantly true)}))

(u/require-dox-in-this-namespace)
