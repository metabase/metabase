(ns metabase.feature-extraction.core
  "Feature extraction for various models."
  (:require [clojure
             [set :refer [rename-keys]]
             [walk :refer [postwalk]]]
            [kixi.stats.math :as math]
            [medley.core :as m]
            [metabase.db.metadata-queries :as metadata]
            [metabase.feature-extraction
             [comparison :as comparison]
             [costs :as costs]
             [descriptions :refer [add-descriptions]]
             [feature-extractors :as fe]
             [values :as values]]
            [metabase.models
             [card :refer [Card] :as card]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor :as qp]
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
                          See `metabase.feature-extraction.costs` for details.

                          Note: `extract-features` for `Card`s does not support
                          sampling."
    :arglists '([opts model])}
  extract-features #(type %2))

(def ^:private ^:const ^Long max-sample-size 10000)

(defn- sampled?
  [{:keys [max-cost]} dataset]
  (and (not (costs/full-scan? max-cost))
       (= (count (:rows dataset dataset)) max-sample-size)))

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (not (costs/full-scan? max-cost)) (assoc :limit max-sample-size)))

(defmethod extract-features (type Field)
  [opts field]
  (let [{:keys [field row]} (values/field-values field (extract-query-opts opts))]
    {:features (->> row
                    (field->features opts field)
                    (merge {:table (Table (:table_id field))}))
     :sample?  (sampled? opts row)}))

(defmethod extract-features (type Table)
  [opts table]
  (let [dataset (values/query-values (metadata/db-id table)
                                     (merge (extract-query-opts opts)
                                            {:source-table (:id table)}))]
    {:constituents (dataset->features opts dataset)
     :features     {:table table}
     :sample?      (sampled? opts dataset)}))

(defn index-of
  "Return index of the first element in `coll` for which `pred` reutrns true."
  [pred coll]
  (first (keep-indexed (fn [i x]
                         (when (pred x) i))
                       coll)))

(defn- ensure-aligment
  [fields cols rows]
  (if (not= fields (take 2 cols))
    (eduction (map (apply juxt (for [field fields]
                                 (let [idx (index-of #{field} cols)]
                                   #(nth % idx)))))
              rows)
    rows))

(defmethod extract-features (type Card)
  [opts card]
  (let [{:keys [rows cols] :as dataset} (values/card-values card)
        {:keys [breakout aggregation]}  (group-by :source cols)
        fields                          [(first breakout)
                                         (or (first aggregation)
                                             (second breakout))]]
    {:constituents (dataset->features opts dataset)
     :features     (merge (field->features (->> card
                                                :dataset_query
                                                :query
                                                (assoc opts :query))
                                           fields
                                           (ensure-aligment fields cols rows))
                          {:card  card
                           :table (Table (:table_id card))})
     :dataset      dataset
     :sample?      (sampled? opts dataset)}))

(defmethod extract-features (type Segment)
  [opts segment]
  (let [dataset (values/query-values (metadata/db-id segment)
                                     (merge (extract-query-opts opts)
                                            (:definition segment)))]
    {:constituents (dataset->features opts dataset)
     :features     {:table   (Table (:table_id segment))
                    :segment segment}
     :sample?      (sampled? opts dataset)}))

(defn- dimension?
  [{:keys [base_type special_type name]}]
  (and (or (isa? base_type :type/Number)
           (isa? base_type :type/DateTime)
           (isa? special_type :type/Category))
       (not= name "ID")))

(defn- dimensions
  [{:keys [table_id]}]
  (->> (db/select Field :table_id table_id)
       (filter dimension?)))

(defn- field->breakout
  [{:keys [id base_type]}]
  (if (isa? base_type :type/DateTime)
    [:datetime-field [:field-id id] :day]
    [:binning-strategy [:field-id id] :default]))

(defmethod extract-features (type Metric)
  [opts {:keys [definition table_id name] :as metric}]
  (let [query        (card/map->CardInstance
                      {:dataset_query {:type     :query
                                       :database (metadata/db-id metric)
                                       :query    definition}
                       :table_id      table_id})
        aggregation  (-> definition :aggregation ffirst)
        fix-name     #(update % :constituents rename-keys {aggregation name})
        constituents (into {}
                       (for [field (dimensions metric)]
                         [(:name field)
                          (->> field
                               field->breakout
                               vector
                               (assoc-in query [:dataset_query :query :breakout])
                               (extract-features opts)
                               fix-name)]))]
    {:constituents constituents
     :features     {:metric metric
                    :table  (Table table_id)}
     :samlple?     (some (comp :sample? val) constituents)}))

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
                   (for [[feature {:keys [difference]}] top-contributors]
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
     :top-contributors (top-contributors comparisons)
     :sample?          (some :sample? [a b])
     :significant?     (if (:constituents a)
                         (some :significant? (vals comparisons))
                         (:significant? comparisons))}))
