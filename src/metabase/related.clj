(ns metabase.related
  "Related entities recommendations."
  (:require [clojure.set :as set]
            [clojure.string :as str]
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

(def ^:private ^Integer max-best-matches        3)
(def ^:private ^Integer max-serendipity-matches 2)
(def ^:private ^Integer max-matches             (+ max-best-matches
                                                   max-serendipity-matches))

(defn- context-bearing-form?
  [form]
  (and (vector? form)
       ((some-fn string? keyword?) (first form))
       (-> form first name str/lower-case (#{"field-id" "metric" "segment"}))))

(defn- collect-context-bearing-forms
  [form]
  (into #{}
    (filter context-bearing-form?)
    (tree-seq sequential? identity form)))

(defmulti
  ^{:doc "Return the relevant parts of a given entity's definition.
          Relevant parts are those that carry semantic meaning, and especially
          context-bearing forms."
    :arglists '([entity])}
  definition type)

(defmethod definition (type Card)
  [card]
  (-> card
      :dataset_query
      :query
      ((juxt :breakout :aggregation :expressions :fields))))

(defmethod definition (type Metric)
  [metric]
  (-> metric :definition :aggregation))

(defmethod definition (type Segment)
  [segment]
  (-> segment :definition :filter))

(defn similarity
  "How similar are entities `a` and `b` based on a structural comparison of their
   definition (MBQL).
   For the purposes of finding related entites we are only interested in
   context-bearing subforms (field, segment, and metric references). We also
   don't care about generalizations (less context-bearing forms) and refinements
   (more context-bearing forms), so we just check if the less specifc form is a
   subset of the more specific one."
  [a b]
  (let [context-a (collect-context-bearing-forms (definition a))
        context-b (collect-context-bearing-forms (definition b))]
    (if (= context-a context-b)
      1
      (max (/ (count (set/difference context-a context-b))
              (max (count context-a) 1))
           (/ (count (set/difference context-b context-a))
              (max (count context-b) 1))))))

(defn- interesting-mix
  [reference matches]
  (let [[best rest] (->> matches
                         (remove #{reference})
                         (map #(assoc % :similarity (similarity reference %)))
                         (filter mi/can-read?)
                         (sort-by :similarity >)
                         (split-at max-best-matches))]
    (concat best (->> rest shuffle (take max-serendipity-matches)))))

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
       (filter mi/can-read?)
       (take max-matches)))

(defn- linked-from
  [table]
  (let [fields (db/select-field :id Field :table_id (:id table))]
    (->> (db/select-field :table_id Field
           :fk_target_field_id [:in fields])
         (map Table)
         (filter mi/can-read?)
         (take max-matches))))

(defn- cards-sharing-dashboard
  [card]
  (let [dashboards (db/select-field :dashboard_id DashboardCard
                     :card_id (:id card))]
    (->> (db/select-field :card_id DashboardCard
           :dashboard_id [:in dashboards]
           :card_id [:not= (:id card)])
         (map Card)
         (filter mi/can-read?)
         (take max-matches))))

(defn- similar-questions
  [card]
  (interesting-mix card (db/select Card :table_id (:table_id card))))

(defmulti
  ^{:doc "Return related entities."
    :arglists '([entity])}
  related type)

(defmethod related (type Card)
  [card]
  (let [table (Table (:table_id card))]
    {:table             table
     :metrics           (->> table
                             metrics-for-table
                             (interesting-mix card))
     :segments          (->> table
                             segments-for-table
                             (interesting-mix card))
     :dashboard-mates   (cards-sharing-dashboard card)
     :similar-questions (similar-questions card)}))

(defmethod related (type Metric)
  [metric]
  (let [table (Table (:table_id metric))]
    {:table    table
     :metrics  (->> table
                    metrics-for-table
                    (interesting-mix metric))
     :segments (->> table
                    segments-for-table
                    (interesting-mix metric))}))

(defmethod related (type Segment)
  [segment]
  (let [table (Table (:table_id segment))]
    {:table     table
     :metrics   (->> table
                     metrics-for-table
                     (interesting-mix segment))
     :segments  (->> table
                     segments-for-table
                     (interesting-mix segment))
    :linking-to (linking-to table)}))

(defmethod related (type Table)
  [table]
  {:segments    (segments-for-table table)
   :metrics     (metrics-for-table table)
   :linking-to  (linking-to table)
   :linked-from (linked-from table)})
