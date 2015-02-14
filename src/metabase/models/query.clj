(ns metabase.models.query
  (:require [clojure.data.json :as json]
            [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [hydrate :refer [realize-json]]
                             [user :refer [User]]
                             [database :refer [Database]])
            [metabase.util :refer :all]))


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

(defn new-sql-date
  "`java.sql.Date` doesn't have an empty constructor so this is a convenience that lets you make one with the current date."
  []
  (-> (java.util.Date.)
      .getTime
      (java.sql.Date.)))

(defmethod default-ins-fields Query [_]
  {:created_at (new-sql-date)
   :updated_at (new-sql-date)
   :version 1})

(defmethod pre-insert2 Query [_ {:keys [details] :as query}]
  (assoc query :details (if (string? details) details
                            (json/write-str details))))

(defmethod post-select Query [_ {:keys [creator_id database_id] :as query}]
  (-> query
      (realize-json :details)
      (assoc* :creator (delay
                        (check creator_id 500 "Can't get creator: Query doesn't have a :creator_id.")
                        (sel :one User :id creator_id))
              :database (delay
                         (check database_id 500 "Can't get database: Query doesn't have a :database_id.")
                         (sel :one Database :id database_id))
              :organization_id (delay (:organization_id ((:database <>)))))
      assoc-permissions-sets))
