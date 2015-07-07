(ns metabase.models.session
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [interface :refer :all]
                             [user :refer [User]])
            [metabase.util :as u]))

(defentity Session
  [(table :core_session)
   (belongs-to User {:fk :user_id})]

  (pre-insert [_ session]
    (let [defaults {:created_at (u/new-sql-timestamp)}]
      (merge defaults session))))
