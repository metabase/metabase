(ns metabase.related
  "Related entities recommendations."
  (:require [clojure.data :refer [diff]]
            [kixi.stats.math :as math]
            [metabase.models
             [card :refer [Card]]
             [dashboard-card :refer [DashboardCard]]
             [field :refer [Field]]
             [interface :as mi]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [toucan.db :as db]))

(defn- similarity
  [a b]
  (let [[in-a in-b _] (diff a b)
        branch?       (some-fn sequential? map?)
        node-count    (comp count
                            (partial remove (some-fn branch? nil?))
                            (partial tree-seq branch? identity))]
    (- 1  (/ (+ (node-count in-a)
                (node-count in-b))
             (+ (node-count a)
                (node-count b))))))

(defn- similarity-by
  [keyfn a b]
  (similarity (keyfn a) (keyfn b)))

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

(defn- card-similarity
  "How similar are the two cards based on a structural comparison of the
   aggregation and breakout clauses.
   We take squares of similarity becouse a strong match in one facet is better
   than a mediocre match on both facets."
  [a b]
  (/ (+ (math/sq (similarity-by (comp :breakout :query :dataset_query) a b))
        (math/sq (similarity-by (comp :aggregation :query :dataset_query) a b)))
     2))

(defn- similar-questions
  [card]
  (->> (db/select Card
         :table_id (:table_id card))
       (map #(assoc % :similarity (card-similarity card %)))
       (filter (every-pred (comp pos? :similarity)
                           mi/can-read?))
       (sort-by :similarity >)))

(defmulti
  ^{:doc "Return related entities."
    :arglists '([entity])}
  related type)

(defmethod related (type Card)
  [card]
  (let [table (Table (:table_id card))]
    {:table             table
     :metrics           (metrics-for-table table)
     :segments          (segments-for-table table)
     :dashboard-mates   (cards-sharing-dashboard card)
     :similar-questions (similar-questions card)}))

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
