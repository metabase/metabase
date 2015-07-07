(ns metabase.models.card
  (:require [korma.core :refer :all, :exclude [defentity]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            (metabase.models [common :refer :all]
                             [interface :refer :all]
                             [user :refer [User]])))

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
  [(table :report_card)
   (hydration-keys card)
   (types :dataset_query :json, :display :keyword, :visualization_settings :json)
   timestamped]

  (post-select [_ {:keys [creator_id] :as card}]
    (-> (assoc card
               :creator (delay (sel :one User :id creator_id)))
        assoc-permissions-sets))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete 'metabase.models.dashboard-card/DashboardCard :card_id id)
    (cascade-delete 'metabase.models.card-favorite/CardFavorite :card_id id)))
