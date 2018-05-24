(ns metabase.models.session
  (:require [metabase.util :as u]
            [metabase.util.date :as du]
            [toucan
             [db :as db]
             [models :as models]]))

(models/defmodel Session :core_session)

(defn- pre-insert [session]
  (assoc session :created_at (du/new-sql-timestamp)))

(u/strict-extend (class Session)
  models/IModel
  (merge models/IModelDefaults
         {:pre-insert pre-insert}))

;; Persistence Functions

(defn first-session-for-user
  "Retrieves the first Session `:id` for a given user (if available), or nil otherwise."
  ^String [user-id]
  {:pre [(integer? user-id)]}
  (db/select-one-id Session, :user_id user-id, {:order-by [[:created_at :asc]]}))
