(ns metabase.models.session
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
              [user :refer [User]])
            [metabase.util :as util]))

(defentity Session
  (table :core_session)
  (belongs-to User {:fk :user_id}))


(defmethod pre-insert Session [_ session]
  (let [defaults {:created_at (util/new-sql-timestamp)}]
    (merge defaults session)))
