(ns metabase.models.session
  (:require [metabase.db :as db]
            (metabase.models [interface :as i]
                             [user :refer [User]])
            [metabase.util :as u]))

(i/defentity Session :core_session)

(defn- pre-insert [session]
  (assoc session :created_at (u/new-sql-timestamp)))

(u/strict-extend (class Session)
  i/IEntity
  (merge i/IEntityDefaults
         {:pre-insert pre-insert}))

;; Persistence Functions

(defn first-session-for-user
  "Retrieves the first Session `:id` for a given user (if available), or nil otherwise."
  ^String [user-id]
  {:pre [(integer? user-id)]}
  (db/select-one-id Session, :user_id user-id, {:order-by [[:created_at :asc]]}))
