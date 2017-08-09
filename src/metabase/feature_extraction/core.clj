(ns metabase.feature-extraction.core
  "Feature extraction for various models."
  (:require [clojure.walk :refer [postwalk]]
            [metabase.db.metadata-queries :as metadata]
            [metabase.feature-extraction
             [comparison :as comparison]
             [costs :as costs]
             [feature-extractors :as fe]
             [descriptions :refer [add-descriptions]]]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [redux.core :as redux]))

(defn- field->features
  "Transduce given column with corresponding feature extractor."
  [opts field data]
  (transduce identity (fe/feature-extractor opts field) data))

(defn- dataset->features
  "Transuce each column in given dataset with corresponding feature extractor."
  [opts {:keys [rows cols]}]
  (transduce identity
             (apply redux/juxt
                    (for [[i field] (m/indexed cols)
                          :when (not (or (:remapped_to field)
                                         (= :type/PK (:special_type field))))]
                      (redux/pre-step (fe/feature-extractor opts field)
                                      #(nth % i))))
             rows))

(defmulti
  ^{:doc "Given a model, fetch corresponding dataset and compute its features.

          Takes a map of options as first argument. Recognized options:
          * `:max-cost`   a map with keys `:computation` and `:query` which
                          limits maximal resource expenditure when computing
                          the features.
                          See `metabase.feature-extraction.costs` for details."
    :arglists '([opts field])}
  extract-features #(type %2))

(def ^:private ^:const ^Long max-sample-size 10000)

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (costs/sample-only? max-cost) (assoc :limit max-sample-size)))

(defmethod extract-features (type Field)
  [opts field]
  {:features (->> (metadata/field-values field (extract-query-opts opts))
                  (field->features opts field)
                  (merge {:table (Table (:table_id field))}))})

(defmethod extract-features (type Table)
  [opts table]
  {:constituents (dataset->features opts (metadata/query-values
                                        (:db_id table)
                                        (merge (extract-query-opts opts)
                                               {:source-table (:id table)})))
   :features     {:table table}})

(defmethod extract-features (type Card)
  [opts card]
  (let [query (-> card :dataset_query :query)
        {:keys [rows cols]} (->> query
                                 (merge (extract-query-opts opts))
                                 (metadata/query-values (:database_id card)))
        {:keys [breakout aggregation]} (group-by :source cols)
        fields [(first breakout)
                (or (first aggregation) (second breakout))]]
    {:constituents [(field->features opts (first fields) (map first rows))
                    (field->features opts (second fields) (map second rows))]
     :features     (merge
                    (field->features (assoc opts :query query) fields rows)
                    {:card  card
                     :table (Table (:table_id card))})}))

(defmethod extract-features (type Segment)
  [opts segment]
  {:constituents (dataset->features opts (metadata/query-values
                                        (metadata/db-id segment)
                                        (merge (extract-query-opts opts)
                                               (:definition segment))))
   :features     {:table   (Table (:table_id segment))
                  :segment segment}})

;; (defmethod extract-features (type Metric)
;;   [_ metric]
;;   {:metric metric})

(defn- trim-decimals
  [decimal-places features]
  (postwalk
   (fn [x]
     (if (float? x)
       (u/round-to-decimals (+ (- (min (u/order-of-magnitude x) 0))
                               decimal-places)
                            x)
       x))
   features))

(defn x-ray
  "Turn feature vector into an x-ray."
  [features]
  (let [prettify (comp add-descriptions (partial trim-decimals 2) fe/x-ray)]
    (-> features
        (update :features prettify)
                                        ;        (update :comparison  (partial map x-ray))
        (update :constituents (partial map x-ray)))))

(defn compare-features
  "Compare feature vectors of two models."
  [opts a b]
  (let [[a b] (map (partial extract-features opts) [a b])]
    {:constituents [a b]
     :comparison   (if (:constituents a)
                     (map comparison/features-distance
                          (:constituents a)
                          (:constituents b))
                     (comparison/features-distance (:features a)
                                                   (:features b)))}))
