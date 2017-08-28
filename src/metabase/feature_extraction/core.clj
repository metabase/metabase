(ns metabase.feature-extraction.core
  "Feature extraction for various models."
  (:require [clojure.walk :refer [postwalk]]
            [kixi.stats.math :as math]
            [medley.core :as m]
            [metabase.db.metadata-queries :as metadata]
            [metabase.feature-extraction
             [comparison :as comparison]
             [costs :as costs]
             [feature-extractors :as fe]
             [descriptions :refer [add-descriptions]]]
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
             (redux/fuse
              (into {}
                (for [[i field] (m/indexed cols)
                      :when (not (or (:remapped_to field)
                                     (= :type/PK (:special_type field))))]
                  [(:name field) (redux/pre-step
                                  (fe/feature-extractor opts field)
                                  #(nth % i))])))
             rows))

(defmulti
  ^{:doc "Given a model, fetch corresponding dataset and compute its features.

          Takes a map of options as first argument. Recognized options:
          * `:max-cost`   a map with keys `:computation` and `:query` which
                          limits maximal resource expenditure when computing
                          features.
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
                                          (metadata/db-id table)
                                          (merge (extract-query-opts opts)
                                                 {:source-table (:id table)})))
   :features     {:table table}})

(defmethod extract-features (type Card)
  [opts card]
  (let [query (-> card :dataset_query :query)
        {:keys [rows cols] :as dataset} (metadata/query-values
                                         (metadata/db-id card)
                                         (merge (extract-query-opts opts)
                                                query))
        {:keys [breakout aggregation]}  (group-by :source cols)
        fields                          [(first breakout)
                                         (or (first aggregation)
                                             (second breakout))]]
    {:constituents (dataset->features opts dataset)
     :features     (merge
                    (field->features (assoc opts :query query) fields rows)
                    {:card  card
                     :table (Table (:table_id card))})
     :dataset      dataset}))

(defmethod extract-features (type Segment)
  [opts segment]
  {:constituents (dataset->features opts (metadata/query-values
                                          (metadata/db-id segment)
                                          (merge (extract-query-opts opts)
                                                 (:definition segment))))
   :features     {:table   (Table (:table_id segment))
                  :segment segment}})

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
        (u/update-when :features prettify)
        (u/update-when :constituents (fn [constituents]
                                       (if (sequential? constituents)
                                         (map x-ray constituents)
                                         (m/map-vals prettify constituents)))))))

(defn- top-contributors
  [comparisons]
  (if (map? comparisons)
    (->> comparisons
         (comparison/head-tails-breaks (comp :distance val))
         (mapcat (fn [[field {:keys [top-contributors distance]}]]
                   (for [[feature difference] top-contributors]
                     {:feature      feature
                      :field        field
                      :contribution (* (math/sqrt distance) difference)})))
         (comparison/head-tails-breaks :contribution))
    (->> comparisons
         :top-contributors
         (map (fn [[feature difference]]
                {:feature    feature
                 :difference difference})))))

(defn compare-features
  "Compare feature vectors of two models."
  [opts a b]
  (let [[a b]       (map (partial extract-features opts) [a b])
        comparisons (if (:constituents a)
                      (into {}
                        (map (fn [[field a] [_ b]]
                               [field (comparison/features-distance a b)])
                             (:constituents a)
                             (:constituents b)))
                      (comparison/features-distance (:features a)
                                                    (:features b)))]
    {:constituents     [a b]
     :comparison       comparisons
     :top-contributors (top-contributors comparisons)}))
