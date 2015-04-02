(ns metabase.models.session
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defentity Session
  (table :core_session)
  (belongs-to User {:fk :user_id}))

(defmethod pre-insert Session [_ session]
  (let [defaults {:created_at (u/new-sql-timestamp)}]
    (merge defaults session)))
