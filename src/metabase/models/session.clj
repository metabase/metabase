(ns metabase.models.session
  (:require [korma.core :as k]
            (metabase.models [interface :as i]
                             [user :refer [User]])
            [metabase.util :as u]))

(i/defentity Session :core_session
  (k/belongs-to User {:fk :user_id}))

(defn- pre-insert [session]
  (assoc session :created_at (u/new-sql-timestamp)))

(extend (class Session)
  i/IEntity
  (merge i/IEntityDefaults
         {:pre-insert pre-insert}))

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


(u/require-dox-in-this-namespace)
