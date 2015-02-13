(ns metabase.models.query
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [hydrate :refer [realize-json]]
                             [user :refer [User]]
                             [database :refer [Database]])))


(defentity Query
  (table :query_query))


;; default fields to return for `sel Query
(defmethod default-fields Query [_]
  [:id
   :created_at
   :updated_at
   :name
   :type
   :details
   :version
   :public_perms
   :creator_id
   :database_id])


(defmethod post-select Query [_ {:keys [creator_id database_id] :as query}]
  (-> query
    (realize-json :details)
    (assoc :creator (sel-fn :one User :id creator_id)
           :database (sel-fn :one Database :id database_id))))