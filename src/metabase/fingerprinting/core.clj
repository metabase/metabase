(ns metabase.fingerprinting.core
  "Fingerprinting (feature extraction) for various models."
  (:require [metabase.db.metadata-queries :as metadata]
            [metabase.fingerprinting
             [comparison :as comparison]
             [costs :as costs]
             [fingerprinters :as f]]
            [medley.core :as m]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [redux.core :as redux]))

(defn- fingerprint-field
  "Transduce given column with corresponding fingerprinter."
  [opts field data]
  (-> (transduce identity (f/fingerprinter opts field) data)
      (assoc :field field)))

(defn- fingerprint-query
  "Transuce each column in given dataset with corresponding fingerprinter."
  [opts {:keys [rows cols]}]
  (transduce identity
             (apply redux/juxt (map-indexed (fn [i field]
                                              (redux/post-complete
                                               (redux/pre-step
                                                (f/fingerprinter opts field)
                                                #(nth % i))
                                               #(assoc % :field field)))
                                            cols))
             rows))

(defmulti fingerprint
  "Given a model, fetch corresponding dataset and compute its fingerprint.

   Takes a map of options as first argument. Recognized options:
   * `:max-cost`         a map with keys `:computation` and `:query` which
                         limits maximal resource expenditure when computing the
                         fingerprint. See `metabase.fingerprinting.costs` for
                         details.

   * `:scale`            controls pre-aggregation by time. Can be one of `:day`,
                         `week`, `:month`, or `:raw`."
  #(type %2))

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
  (let [{:keys [rows cols]} (metadata/query-values
                             (:database_id card)
                             (merge (extract-query-opts opts)
                                    (-> card :dataset_query :query)))
        {:keys [breakout aggregation]} (group-by :source cols)
        fields [(first breakout) (or (first aggregation) (second breakout))]]
    {:constituents [(fingerprint-field opts (first fields) (map first rows))
                    (fingerprint-field opts (second fields) (map second rows))]
     :fingerprint  (merge (fingerprint-field opts fields rows)
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

(defn- build-query
  [{:keys [scale] :as opts} a b]
  (merge (extract-query-opts opts)
         (cond
           (and (isa? (f/field-type a) f/DateTime)
                (not= scale :raw)
                (instance? (type Metric) b))
           (merge (:definition b)
                  {:breakout [[:datetime-field [:field-id (:id a)] scale]]})

           (and (isa? (f/field-type a) f/DateTime)
                (not= scale :raw)
                (isa? (f/field-type b) f/Num))
           {:source-table (:table_id a)
            :breakout     [[:datetime-field [:field-id (:id a)] scale]]
            :aggregation  [:sum [:field-id (:id b)]]}

           :else
           {:source-table (:table_id a)
            :fields       [[:field-id (:id a)]
                           [:field-id (:id b)]]})))

(defn multifield-fingerprint
  "Holistically fingerprint dataset with multiple columns.
   Takes and additional option `:scale` which controls how timeseries data
   is aggregated. Possible values: `:month`, `week`, `:day`, `:raw`."
  [opts a b]
  (assert (= (:table_id a) (:table_id b)))
  {:fingerprint  (->> (metadata/query-values (metadata/db-id a)
                                             (build-query opts a b))
                     :rows
                     (fingerprint-field opts [a b]))
   :constituents (map (partial fingerprint opts) [a b])})

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

(defn prettify
  "Walk the fingerprint structure and prettify all fingerprints within."
  [fingerprint]
  (-> fingerprint
      (update :fingerprint  f/prettify)
      (update :constituents (partial map f/prettify))))
