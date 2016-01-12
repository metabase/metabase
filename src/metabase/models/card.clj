(ns metabase.models.card
  (:require [korma.core :as k]
            [medley.core :as m]
            [metabase.db :refer [cascade-delete]]
            (metabase.models [interface :as i]
                             [revision :as revision]
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

(i/defentity Card :report_card)

(defn- populate-query-fields [card]
  (let [{query :query, database-id :database, query-type :type} (:dataset_query card)
        table-id (or (:source_table query)  ; legacy (MBQL '95)
                     (:source-table query))
        defaults {:database_id database-id
                  :table_id    table-id
                  :query_type  (keyword query-type)}]
    (if query-type
      (merge defaults card)
      card)))

(defn- post-select [{:keys [creator_id] :as card}]
  (assoc card
         :creator         (delay (User creator_id))
         :dashboard_count (delay (-> (k/select @(ns-resolve 'metabase.models.dashboard-card 'DashboardCard)
                                               (k/aggregate (count :*) :dashboards)
                                               (k/where {:card_id (:id card)}))
                                     first
                                     :dashboards))))

(defn- pre-cascade-delete [{:keys [id]}]
  (cascade-delete 'PulseCard :card_id id)
  (cascade-delete 'Revision :model "Card" :model_id id)
  (cascade-delete 'DashboardCard :card_id id)
  (cascade-delete 'CardFavorite :card_id id))

(defn- serialize-instance [_ _ instance]
  (->> (dissoc instance :created_at :updated_at)
       (into {})                                 ; if it's a record type like CardInstance we need to convert it to a regular map or filter-vals won't work
       (m/filter-vals (complement delay?))))

(extend (class Card)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:card])
          :types              (constantly {:display :keyword, :query_type :keyword, :dataset_query :json, :visualization_settings :json})
          :timestamped?       (constantly true)
          :can-read?          i/publicly-readable?
          :can-write?         i/publicly-writeable?
          :pre-update         populate-query-fields
          :pre-insert         populate-query-fields
          :post-select        post-select
          :pre-cascade-delete pre-cascade-delete})

  revision/IRevisioned
  {:serialize-instance serialize-instance
   :revert-to-revision revision/default-revert-to-revision
   :describe-diff      revision/default-describe-diff})


(u/require-dox-in-this-namespace)
