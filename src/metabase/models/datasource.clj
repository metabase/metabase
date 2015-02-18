(ns metabase.models.datasource
  (:require [korma.core :refer :all]
            [medley.core :as m]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [hydrate :as h]
                             [database :refer [Database]])))

(defentity DataSource
  (table :datasource_datasource))

(defmethod post-select DataSource [_ {:keys [database_id] :as ds}]
  (-> ds
      (h/realize-json :parameters)
      (m/dissoc-in [:parameters :aws_secret])
      (assoc :database (sel-fn :one Database :id database_id))))
