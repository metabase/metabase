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

(defn databases-for-org
  "Selects the ID and NAME for all databases available to the given org-id."
  [org-id]
  (let [org (sel :one Org :id org-id)]
    (when org
      (if (:inherits org)
        ;; inheriting orgs see ALL databases
        (sel :many [Database :id :name] (order :name :ASC))
        ;; otherwise filter by org-id
        (sel :many [Database :id :name] :organization_id org-id (order :name :ASC))))))