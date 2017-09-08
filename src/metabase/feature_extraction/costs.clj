(ns metabase.feature-extraction.costs
  "Predicates for limiting resource expanditure during feature extraction."
  (:require [metabase.models
             [card :refer [Card]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.sync.fetch-metadata :as fetch-metadata]
            [schema.core :as s]))

(def MaxCost
  "Schema for max-cost parameter."
  {:computation (s/enum :linear :unbounded :yolo)
   :query       (s/enum :cache :sample :full-scan :joins)})

(def ^{:arglists '([max-cost])} linear-computation?
  "Limit computation to O(n) or better."
  (comp #{:linear} :computation))

(def ^{:arglists '([max-cost])} unbounded-computation?
  "Alow unbounded but always convergent computation.
   Default if no cost limit is specified."
  (comp (partial contains? #{:unbounded :yolo nil}) :computation))

(def ^{:arglists '([max-cost])} yolo-computation?
  "Alow any computation including full blown machine learning."
  (comp #{:yolo} :computation))

(def ^{:arglists '([max-cost])} cache-only?
  "Use cached data only."
  (comp #{:cache} :query))

(def ^{:arglists '([max-cost])} sample-only?
  "Only sample data."
  (comp #{:sample} :query))

(def ^{:arglists '([max-cost])} full-scan?
  "Alow full table scans.
   Default if no cost limit is specified."
  (comp (partial contains? #{:full-scan :joins nil}) :query))

(def ^{:arglists '([max-cost])} alow-joins?
  "Alow bringing in data from other tables if needed."
  (comp #{:joins} :query))

(defmulti
  ^{:doc "Estimate cost of feature extraction for given model.
          Cost is equal to the number of values in the corresponding dataset
          (ie. rows * fields). If cost cannot be estimated (eg. for Cards
          employing aggregation or defined in SQL), returns -1."
    :arglists '([model])}
  estimate-cost type)

(defmethod estimate-cost (type Field)
  [field]
  (or (:rows (Table (:table_id field))) -1))

(defmethod estimate-cost (type Card)
  [card]
  (if (or (-> card :dataset_query :native)
          (-> card :dataset_query :query :aggregation)
          (nil? (:rows (Table (:table_id card)))))
    -1
    (* 2 (:rows (Table (:table_id card))))))cc

(defmethod estimate-cost (type Segment)
  [segment]
  (estimate-cost (Table (:table_id segment))))

(defmethod estimate-cost (type Table)
  [table]
  (if (:rows table)
    (->> table
         (fetch-metadata/table-metadata (Database (:db_id table)))
         :fields
         count
         (* (:rows table)))
    -1))
