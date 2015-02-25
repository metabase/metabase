(ns metabase.models.session
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.common :refer :all]
            [metabase.util :as util]))

(defentity Session
  (table :core_session))


(defmethod pre-insert Session [_ session]
  (let [defaults {:created_at (util/new-sql-date)}]
    (merge defaults session)))
