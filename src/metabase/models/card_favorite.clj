(ns metabase.models.card-favorite
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.util :refer [new-sql-date]]))

(defentity CardFavorite
  (table :report_cardfavorite))

(defmethod pre-insert CardFavorite [_ card-favorite]
  (let [defaults {:created_at (new-sql-date)
                  :updated_at (new-sql-date)}]
    (merge defaults card-favorite)))
