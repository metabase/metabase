(ns metabase.xray.core
  "Thumbprinting (feature extraction) for various models."
  (:require [clojure.walk :refer [postwalk]]
            [metabase.db.metadata-queries :as metadata]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [metabase.xray
             [comparison :as comparison]
             [costs :as costs]
             [feature-descriptions :refer [add-descriptions]]
             [thumbprinters :as tp]]
            [redux.core :as redux]))

(defn- thumbprint-field
  "Transduce given column with corresponding thumbprinter."
  [opts field data]
  (transduce identity (tp/thumbprinter opts field) data))

(defn- thumbprint-query
  "Transuce each column in given dataset with corresponding thumbprinter."
  [opts {:keys [rows cols]}]
  (transduce identity
             (->> cols
                  (remove :remapped_to)
                  (map-indexed (fn [i field]
                                 (redux/pre-step (tp/thumbprinter opts field)
                                                 #(nth % i))))
                  (apply redux/juxt))
             rows))

(defmulti
  ^{:doc "Given a model, fetch corresponding dataset and compute its thumbprint.

          Takes a map of options as first argument. Recognized options:
          * `:max-cost`   a map with keys `:computation` and `:query` which
                          limits maximal resource expenditure when computing
                          the thumbprint.
                          See `metabase.xray.costs` for details."
    :arglists '([opts field])}
  thumbprint #(type %2))

(def ^:private ^:const ^Long max-sample-size 10000)

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (costs/sample-only? max-cost) (assoc :limit max-sample-size)))

(defmethod thumbprint (type Field)
  [opts field]
  {:thumbprint (->> (metadata/field-values field (extract-query-opts opts))
                     (thumbprint-field opts field)
                     (merge {:table (Table (:table_id field))}))})

(defmethod thumbprint (type Table)
  [opts table]
  {:constituents (thumbprint-query opts (metadata/query-values
                                          (:db_id table)
                                          (merge (extract-query-opts opts)
                                                 {:source-table (:id table)})))
   :thumbprint  {:table table}})

(defmethod thumbprint (type Card)
  [opts card]
  (let [resolution (let [[head _ resolution] (-> card
                                                 :dataset_query
                                                 :query
                                                 :breakout
                                                 first)]
                     (when (= head :datetime-field)
                       resolution))
        query (-> card :dataset_query :query)
        {:keys [rows cols]} (->> query
                                 (merge (extract-query-opts opts))
                                 (metadata/query-values (:database_id card)))
        {:keys [breakout aggregation]} (group-by :source cols)
        fields [(first breakout)
                (or (first aggregation) (second breakout))]]
    {:constituents [(thumbprint-field opts (first fields) (map first rows))
                    (thumbprint-field opts (second fields) (map second rows))]
     :thumbprint  (merge
                    (thumbprint-field (assoc opts :resolution resolution)
                                       fields rows)
                    {:card  card
                     :table (Table (:table_id card))})}))

(defmethod thumbprint (type Segment)
  [opts segment]
  {:constituents (thumbprint-query opts (metadata/query-values
                                         (metadata/db-id segment)
                                         (merge (extract-query-opts opts)
                                                (:definition segment))))
   :thumbprint  {:table   (Table (:table_id segment))
                 :segment segment}})

(defmethod thumbprint (type Metric)
  [_ metric]
  {:metric metric})

(defn compare-thumbprints
  "Compare thumbprints of two models."
  [opts a b]
  (let [[a b] (map (partial thumbprint opts) [a b])]
    {:constituents [a b]
     :comparison   (into {}
                     (map (fn [[k a] [_ b]]
                            [k (if (sequential? a)
                                 (map comparison/thumbprint-distance a b)
                                 (comparison/thumbprint-distance a b))])
                          a b))}))

(defn- trim-decimals
  [decimal-places thumbprint]
  (postwalk
   (fn [x]
     (if (float? x)
       (u/round-to-decimals (+ (- (min (long (tp/order-of-magnitude x)) 0))
                               decimal-places)
                            x)
       x))
   thumbprint))

(defn x-ray
  "Turn the thumbprint structure into an x-ray."
  [thumbprint]
  (let [x-ray (comp add-descriptions (partial trim-decimals 2) tp/x-ray)]
    (-> thumbprint
        (update :thumbprint x-ray)
        (update :constituents (partial map x-ray)))))
