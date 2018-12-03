(ns metabase.models.card-favorite
  (:require [metabase.util :as u]
            [toucan.models :as models]))

(models/defmodel CardFavorite :report_cardfavorite)

(u/strict-extend (class CardFavorite)
  models/IModel
  (merge models/IModelDefaults
         {:properties   (constantly {:timestamped? true})}))
