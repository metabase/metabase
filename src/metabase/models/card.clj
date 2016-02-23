(ns metabase.models.card
  (:require [clojure.core.match :refer [match]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.db :as db]
            (metabase.models [dependency :as dependency]
                             [interface :as i]
                             [revision :as revision]
                             [user :refer [User]])
            [metabase.query :as q]
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

(defn dashboard-count
  "Return the number of Dashboards this Card is in."
  {:hydrate :dashboard_count}
  [{:keys [id]}]
  (-> (k/select @(ns-resolve 'metabase.models.dashboard-card 'DashboardCard)
                (k/aggregate (count :*) :dashboards)
                (k/where {:card_id id}))
      first
      :dashboards))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete 'PulseCard :card_id id)
  (db/cascade-delete 'Revision :model "Card" :model_id id)
  (db/cascade-delete 'DashboardCardSeries :card_id id)
  (db/cascade-delete 'DashboardCard :card_id id)
  (db/cascade-delete 'CardFavorite :card_id id))


;;; ## ---------------------------------------- REVISIONS ----------------------------------------


(defn serialize-instance
  "Serialize a `Card` for use in a `Revision`."
  [_ _ instance]
  (->> (dissoc instance :created_at :updated_at)
       (into {})                                 ; if it's a record type like CardInstance we need to convert it to a regular map or filter-vals won't work
       (m/filter-vals (complement delay?))))


;;; ## ---------------------------------------- DEPENDENCIES ----------------------------------------

(defn card-dependencies
  "Calculate any dependent objects for a given `Card`."
  [this id {:keys [dataset_query] :as instance}]
  (when (and dataset_query
             (= :query (keyword (:type dataset_query))))
    {:Metric  (q/extract-metric-ids (:query dataset_query))
     :Segment (q/extract-segment-ids (:query dataset_query))}))


(extend (class Card)
  i/IEntity
  (merge i/IEntityDefaults
         {:hydration-keys     (constantly [:card])
          :types              (constantly {:display :keyword, :query_type :keyword, :dataset_query :json, :visualization_settings :json, :description :clob})
          :timestamped?       (constantly true)
          :can-read?          i/publicly-readable?
          :can-write?         i/publicly-writeable?
          :pre-update         populate-query-fields
          :pre-insert         populate-query-fields
          :pre-cascade-delete pre-cascade-delete})

  revision/IRevisioned
  {:serialize-instance serialize-instance
   :revert-to-revision revision/default-revert-to-revision
   :diff-map           revision/default-diff-map
   :diff-str           revision/default-diff-str}

  dependency/IDependent
  {:dependencies card-dependencies})


(u/require-dox-in-this-namespace)
