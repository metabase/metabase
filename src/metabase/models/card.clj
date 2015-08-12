(ns metabase.models.card
  (:require [korma.core :refer :all, :exclude [defentity update]]
            [metabase.api.common :refer [*current-user-id*]]
            [metabase.db :refer :all]
            (metabase.models [interface :refer :all]
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

(defrecord CardInstance []
  clojure.lang.IFn
  (invoke [this k]
    (get this k)))

(extend-ICanReadWrite CardInstance :read :public-perms, :write :public-perms)


(defentity Card
  [(table :report_card)
   (hydration-keys card)
   (types :dataset_query :json, :display :keyword, :visualization_settings :json)
   timestamped]

  (post-select [_ {:keys [creator_id] :as card}]
    (map->CardInstance (assoc card :creator (delay (User creator_id)))))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete 'metabase.models.dashboard-card/DashboardCard :card_id id)
    (cascade-delete 'metabase.models.card-favorite/CardFavorite :card_id id)))

(extend-ICanReadWrite CardEntity :read :public-perms, :write :public-perms)
