(ns metabase.related
  "Related entities recommendations."
  (:require [metabase.models
             [card :refer [Card]]
             [dashboard-card :refer [DashboardCard]]
             [field :refer [Field]]
             [interface :as mi]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [toucan.db :as db]))

(defn- metrics-for-table
  [table]
  (filter mi/can-read? (db/select Metric :table_id (:id table))))

(defn- segments-for-table
  [table]
  (filter mi/can-read? (db/select Segment :table_id (:id table))))

(defn- linking-to
  [table]
  (->> (db/select-field :fk_target_field_id Field
         :table_id (:id table)
         :fk_target_field_id [:not= nil])
       (map (comp Table :table_id Field))
       distinct
       (filter mi/can-read?)))

(defn- linked-from
  [table]
  (let [fields (db/select-field :id Field :table_id (:id table))]
    (->> (db/select-field :table_id Field
           :fk_target_field_id [:in fields])
         (map Table)
         (filter mi/can-read?))))

(defn- cards-sharing-dashboard
  [card]
  (let [dashboards (db/select-field :dashboard_id DashboardCard
                     :card_id (:id card))]
    (->> (db/select-field :card_id DashboardCard
           :dashboard_id [:in dashboards]
           :card_id [:not= (:id card)])
         (map Card)
         (filter mi/can-read?))))

(defmulti
  ^{:doc "Return related entities."
    :arglists '([entity])}
  related type)

(defmethod related (type Card)
  [card]
  (let [table (Table (:table_id card))]
    {:table     table
     :metrics   (metrics-for-table table)
     :segments  (segments-for-table table)
     :questions (cards-sharing-dashboard card)}))

(defmethod related (type Metric)
  [metric]
  (let [table (Table (:table_id metric))]
    {:table          table
     :metrics        (remove #{metric} (metrics-for-table table))
     :segments       (segments-for-table table)}))

(defmethod related (type Segment)
  [segment]
  (let [table (Table (:table_id segment))]
   {:table      table
    :metrics    (metrics-for-table table)
    :segments   (remove #{segment} (segments-for-table table))
    :linking-to (linking-to table)}))

(defmethod related (type Table)
  [table]
  {:segments    (segments-for-table table)
   :metrics     (metrics-for-table table)
   :linking-to  (linking-to table)
   :linked-from (linked-from table)})
