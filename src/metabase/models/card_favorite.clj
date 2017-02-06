(ns metabase.models.card-favorite
  (:require [toucan.models :as models]
            [metabase.util :as u]))

(models/defmodel CardFavorite :report_cardfavorite)

(u/strict-extend (class CardFavorite)
  models/IModel
  (merge models/IModelDefaults
         {:properties   (constantly {:timestamped? true})}))
