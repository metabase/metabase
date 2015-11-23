(ns metabase.models.session
  (:require [korma.core :as k]
            (metabase.models [common :refer :all]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defentity Session
  [(k/table :core_session)
   (k/belongs-to User {:fk :user_id})]

  (pre-insert [_ session]
    (let [defaults {:created_at (u/new-sql-timestamp)}]
      (merge defaults session))))


;; Persistence Functions

(defn first-session-for-user
  "Retrieves the first Session `:id` for a given user (if available), or nil otherwise."
  [user-id]
  {:pre [(integer? user-id)]}
  (-> (k/select Session
        (k/fields :id)
        (k/where {:user_id user-id})
        (k/order :created_at :ASC)
        (k/limit 1))
      first
      :id))
