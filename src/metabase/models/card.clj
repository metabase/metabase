(ns metabase.models.card
  (:require [korma.core :refer :all, :exclude [defentity update]]
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


(defn- populate-query-fields [card]
  (let [{{table-id :source_table} :query database-id :database query-type :type} (:dataset_query card)
        defaults {:database_id database-id
                  :table_id    table-id
                  :query_type  (keyword query-type)}]
    (if query-type
      (merge defaults card)
      card)))

(defentity Card
  [(table :report_card)
   (hydration-keys card)
   (types :display :keyword, :query_type :keyword, :dataset_query :json, :visualization_settings :json)
   timestamped]

   (pre-insert [_ card]
     (populate-query-fields card))

   (pre-update [_ card]
     (populate-query-fields card))

  (post-select [_ {:keys [creator_id] :as card}]
    (map->CardInstance (assoc card
                              :creator         (delay (User creator_id))
                              :dashboard_count (delay (-> (select @(ns-resolve 'metabase.models.dashboard-card 'DashboardCard)
                                                                  (aggregate (count :*) :dashboards)
                                                                  (where {:card_id (:id card)}))
                                                          first
                                                          :dashboards)))))

  (pre-cascade-delete [_ {:keys [id]}]
    (cascade-delete 'DashboardCard :card_id id)
    (cascade-delete 'CardFavorite :card_id id)))

(extend-ICanReadWrite CardEntity :read :public-perms, :write :public-perms)
