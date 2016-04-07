(ns metabase.models.card
  (:require [korma.core :as k]
            [medley.core :as m]
            [metabase.db :as db]
            (metabase.models [card-topic :refer [CardTopic]]
                             [card-label :refer [CardLabel]]
                             [dependency :as dependency]
                             [interface :as i]
                             [label :refer [Label]]
                             [revision :as revision]
                             [topic :refer [Topic]])
            (metabase [query :as q]
                      [util :as u])))

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

(defn topics
  "Return `Topics` for CARD."
  {:hydrate :topics}
  [{:keys [id]}]
  (if-let [topic-ids (seq (db/sel :many :field [CardTopic :topic_id] :card_id id))]
    (db/sel :many Topic
            (k/where {:id [in topic-ids]})
            (k/order (k/sqlfn :LOWER :name)))
    []))

(defn labels
  "Return `Labels` for CARD."
  {:hydrate :labels}
  [{:keys [id]}]
  (if-let [label-ids (seq (db/sel :many :field [CardLabel :label_id] :card_id id))]
    (db/sel :many Label
            (k/where {:id [in label-ids]})
            (k/order (k/sqlfn :LOWER :name)))
    []))

(defn- pre-cascade-delete [{:keys [id]}]
  (db/cascade-delete 'PulseCard :card_id id)
  (db/cascade-delete 'Revision :model "Card" :model_id id)
  (db/cascade-delete 'DashboardCardSeries :card_id id)
  (db/cascade-delete 'DashboardCard :card_id id)
  (db/cascade-delete 'CardFavorite :card_id id)
  (db/cascade-delete 'CardLabel :card_id id)
  (db/cascade-delete 'CardTopic :card_id id))


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
  [this id {:keys [dataset_query]}]
  (when (and dataset_query
             (= :query (keyword (:type dataset_query))))
    {:Metric  (q/extract-metric-ids (:query dataset_query))
     :Segment (q/extract-segment-ids (:query dataset_query))}))


(u/strict-extend (class Card)
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
  (assoc revision/IRevisionedDefaults
         :serialize-instance serialize-instance)

  dependency/IDependent
  {:dependencies card-dependencies})
