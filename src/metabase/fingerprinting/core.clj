(ns metabase.fingerprinting.core
  "Fingerprinting (feature extraction) for various models."
  (:require [clojure.walk :refer [postwalk]]
            [metabase.db.metadata-queries :as metadata]
            [metabase.fingerprinting
             [comparison :as comparison]
             [costs :as costs]
             [fingerprinters :as f]
             [feature-descriptions :refer [add-descriptions]]]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.util :as u]
            [redux.core :as redux]))

(defn- fingerprint-field
  "Transduce given column with corresponding fingerprinter."
  [opts field data]
  (transduce identity (f/fingerprinter opts field) data))

(defn- fingerprint-query
  "Transuce each column in given dataset with corresponding fingerprinter."
  [opts {:keys [rows cols]}]
  (transduce identity
             (->> cols
                  (remove :remapped_to)
                  (map-indexed (fn [i field]
                                 (redux/pre-step (f/fingerprinter opts field)
                                                 #(nth % i))))
                  (apply redux/juxt))
             rows))

(defmulti
  ^{:doc "Given a model, fetch corresponding dataset and compute its fingerprint.

          Takes a map of options as first argument. Recognized options:
          * `:max-cost`   a map with keys `:computation` and `:query` which
                          limits maximal resource expenditure when computing
                          the fingerprint.
                          See `metabase.fingerprinting.costs` for details."
    :arglists '([opts field])}
  fingerprint #(type %2))

(def ^:private ^:const ^Long max-sample-size 10000)

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (costs/sample-only? max-cost) (assoc :limit max-sample-size)))

(defmethod fingerprint (type Field)
  [opts field]
  {:fingerprint (->> (metadata/field-values field (extract-query-opts opts))
                     (fingerprint-field opts field)
                     (merge {:table (Table (:table_id field))}))})

(defmethod fingerprint (type Table)
  [opts table]
  {:constituents (fingerprint-query opts (metadata/query-values
                                          (:db_id table)
                                          (merge (extract-query-opts opts)
                                                 {:source-table (:id table)})))
   :fingerprint  {:table table}})

(defmethod fingerprint (type Card)
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
    {:constituents [(fingerprint-field opts (first fields) (map first rows))
                    (fingerprint-field opts (second fields) (map second rows))]
     :fingerprint  (merge
                    (fingerprint-field (assoc opts :resolution resolution)
                                       fields rows)
                    {:card  card
                     :table (Table (:table_id card))})}))

(defmethod fingerprint (type Segment)
  [opts segment]
  {:constituents (fingerprint-query opts (metadata/query-values
                                          (metadata/db-id segment)
                                          (merge (extract-query-opts opts)
                                                 (:definition segment))))
   :fingerprint  {:table   (Table (:table_id segment))
                  :segment segment}})

(defmethod fingerprint (type Metric)
  [_ metric]
  {:metric metric})

(defn compare-fingerprints
  "Compare fingerprints of two models."
  [opts a b]
  (let [[a b] (map (partial fingerprint opts) [a b])]
    {:constituents [a b]
     :comparison   (into {}
                     (map (fn [[k a] [_ b]]
                            [k (if (sequential? a)
                                 (map comparison/fingerprint-distance a b)
                                 (comparison/fingerprint-distance a b))])
                          a b))}))

(defn- trim-decimals
  [decimal-places fingerprint]
  (postwalk
   (fn [x]
     (if (float? x)
       (u/round-to-decimals (+ (- (min (long (f/order-of-magnitude x)) 0))
                               decimal-places)
                            x)
       x))
   fingerprint))

(defn x-ray
  "Turn the fingerprint structure into an x-ray."
  [fingerprint]
  (let [x-ray (comp add-descriptions (partial trim-decimals 2) f/x-ray)]
    (-> fingerprint
        (update :fingerprint  x-ray)
        (update :constituents (partial map x-ray)))))
