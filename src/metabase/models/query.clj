(ns metabase.models.query
  (:require [korma.core :refer :all]
            [metabase.api.common :refer [check]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [user :refer [User]]
                             [database :refer [Database]])
            [metabase.util :as u]))


(defentity Query
  (table :query_query)
  (types {:details :json})
  timestamped
  (assoc :hydration-keys #{:query}))


;; default fields to return for `sel` Query
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

(defmethod pre-insert Query [_ query]
  (let [defaults {:version 1}]
    (merge defaults query)))

(defmethod pre-update Query [_ {:keys [version] :as query}]
  (-> query
      (u/select-non-nil-keys :name :database_id :public_perms :details)
      (assoc :version (+ 1 version))))

(defmethod post-select Query [_ {:keys [creator_id database_id] :as query}]
  (-> query
      (u/assoc* :creator         (delay (check creator_id 500 "Can't get creator: Query doesn't have a :creator_id.")
                                        (sel :one User :id creator_id))
                :database        (delay (check database_id 500 "Can't get database: Query doesn't have a :database_id.")
                                        (sel :one Database :id database_id))
                :organization_id (delay (:organization_id @(:database <>))))
      assoc-permissions-sets))

(defmethod pre-cascade-delete Query [_ {:keys [id]}]
  (cascade-delete 'metabase.models.query-execution/QueryExecution :query_id id))
