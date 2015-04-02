(ns metabase.models.card
  (:require [cheshire.core :as cheshire]
            [korma.core :refer :all]
            [metabase.api.common :refer [*current-user-id* org-perms-case]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [org :refer [Org]]
                             [user :refer [User]])
            [metabase.util :as u]))

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
  (types {:dataset_query          :json
          :display                :keyword
          :visualization_settings :json})
  timestamped
  (assoc :hydration-keys #{:card}))

(defmethod post-select Card [_ {:keys [organization_id creator_id] :as card}]
  (-> (assoc card
             :creator      (delay (sel :one User :id creator_id))
             :organization (delay (sel :one Org :id organization_id)))
      assoc-permissions-sets))
