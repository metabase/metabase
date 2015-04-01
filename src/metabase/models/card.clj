(ns metabase.models.card
  (:require [cheshire.core :as cheshire]
            [korma.core :refer :all]
            [metabase.api.common :refer [*current-user-id* org-perms-case]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [hydrate :refer [realize-json]]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as util]))

(def ^:const display-types
  "Valid values of `Card.display_type`."
  #{:area
    :bar
    :country
    :line
    :pie
    :pin_map
    :scalar
    :state
    :table
    :timeseries})

(defentity Card
  (table :report_card)
  (assoc :hydration-keys #{:card}))

(defmethod pre-insert Card [_ {:keys [dataset_query visualization_settings display] :as card}]
  (assert (contains? display-types (keyword display)))
  (let [defaults {:created_at (util/new-sql-timestamp)
                  :updated_at (util/new-sql-timestamp)}]
    (-> (merge defaults card)
        (assoc :dataset_query          (cheshire/generate-string dataset_query)
               :display                (name display)
               :visualization_settings (cheshire/generate-string visualization_settings)))))

(defmethod pre-update Card [_ {:keys [dataset_query visualization_settings display] :as card}]
  (cond-> (assoc card
                 :updated_at             (util/new-sql-timestamp)
                 :dataset_query          (cheshire/generate-string dataset_query)
                 :visualization_settings (cheshire/generate-string visualization_settings))
    display (do (assert (contains? display-types (keyword display)))
                (assoc :display (name display)))))

(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> card
      (realize-json :dataset_query :visualization_settings)
      (assoc :creator      (delay (sel :one User :id creator_id))
             :organization (delay (sel :one Org :id organization_id)))
      assoc-permissions-sets))
