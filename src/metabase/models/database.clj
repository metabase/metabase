(ns metabase.models.database
  (:require [korma.core :refer :all]
            [metabase.db :refer :all]
            [metabase.models.hydrate :refer [realize-json]]
            [metabase.models.org :refer [Org]]))

(defentity Database
  (table :metabase_database))

(defmethod post-select Database [_ {:keys [organization_id] :as db}]
  (-> db
      (realize-json :details)
      (assoc :organization (sel-fn :one Org :id organization_id))))
