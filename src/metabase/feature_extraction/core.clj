(ns metabase.feature-extraction.core
  "Feature extraction for various models."
  (:require [clojure.walk :refer [postwalk]]
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
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [redux.core :as redux]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

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
  ^{:doc "Given a model, return a list of models it can be compared to."
    :arglists '([model])}
  comparables type)

(defn- field-fingerprint
  [table]
  (->> (hydrate table :fields)
       :fields
       (map (juxt :name :basic_type :special_type))))

(defn- shards
  [{:keys [db_id id] :as table}]
  (filter (comp #{(field-fingerprint table)} field-fingerprint)
          (db/select Table :db_id db_id)))

(defn- full-listing?
  [{{:keys [query type]} :dataset_query}]
  (and (= type "query")
       (not-any? #{:breakout :aggregation} (keys query))))

(defmethod comparables (type Table)
  [table]
  (let [shards (shards table)]
    (concat
     (remove #{table} shards)
     (db/select Segment :table_id [:in (map :id shards)])
     (->> (db/select Card :table_id [:in (map :id shards)])
          (filter full-listing?)))))

(defmethod comparables (type Segment)
  [{:keys [table_id id] :as segment}]
  (remove #{segment} (let [table (Table table_id)]
                       (conj (comparables table) table))))

(def ^:private ^{:arglists '([card])} breakout-fingerprint
  (comp :breakout :query :dataset_query))

(defmethod comparables (type Card)
  [{:keys [table_id id] :as card}]
  (->> (concat
        (->> (db/select Card :table_id table_id)
             (filter (comp #{(breakout-fingerprint card)} breakout-fingerprint)))
        (when (full-listing? card)
          (let [table (Table table_id)]
            (conj (comparables table) table))))
       (remove #{card})))

(defmethod comparables (type Field)
  [{:keys [id base_type special_type table_id]}]
  (db/select Field
    :table_id     [:in (->> table_id Table shards (map :id))]
    :base_type    (u/keyword->qualified-name base_type)
    :special_type (u/keyword->qualified-name special_type)
    :id           [:not= id]))

(defmulti
  ^{:doc "Given a model, fetch the corresponding dataset and compute its features.

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
  [{:keys [max-cost] :as opts} dataset]
  (and (not (costs/full-scan? max-cost))
       (= (count (:rows dataset dataset)) max-sample-size)))

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (not (costs/full-scan? max-cost)) (assoc :limit max-sample-size)))

(defmethod extract-features (type Field)
  [opts field]
  (let [{:keys [col row]} (values/field-values field (extract-query-opts opts))]
    {:features    (->> row
                       (field->features opts col)
                       (merge {:table (Table (:table_id col))}))
     :sample?     (sampled? opts row)
     :comparables (comparables field)}))

(defmethod extract-features (type Table)
  [opts table]
  (let [dataset (values/query-values (metadata/db-id table)
                                     (merge (extract-query-opts opts)
                                            {:source-table (:id table)}))]
    {:constituents (dataset->features opts dataset)
     :features     {:model table}
     :sample?      (sampled? opts dataset)
     :comparables  (comparables table)}))

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
     :features     (merge (when (every? some? fields)
                            (field->features (->> card
                                                  :dataset_query
                                                  :query
                                                  (assoc opts :query))
                                             fields
                                             (ensure-aligment fields cols rows)))
                          {:model card
                           :table (Table (:table_id card))})
     :dataset      dataset
     :sample?      (sampled? opts dataset)
     :comparables  (comparables card)}))

(defmethod extract-features (type Segment)
  [opts segment]
  (let [dataset (values/query-values (metadata/db-id segment)
                                     (merge (extract-query-opts opts)
                                            (:definition segment)))]
    {:constituents (dataset->features opts dataset)
     :features     {:table (Table (:table_id segment))
                    :model segment}
     :sample?      (sampled? opts dataset)
     :comparables  (comparables segment)}))

(defn- trim-decimals
  [decimal-places x]
  (u/round-to-decimals (- decimal-places (min (u/order-of-magnitude x) 0)) x))

(defn- humanize-values
  [features]
  (postwalk
   (fn [x]
     (condp instance? x
       Float                (trim-decimals 2 x)
       clojure.lang.IRecord (assoc x :type-tag (type x))
       x))
   features))

(defn x-ray
  "Turn feature vector into an x-ray."
  [features]
  (let [prettify (comp add-descriptions humanize-values fe/x-ray)]
    (-> features
        (update :features prettify)
        (update :comparables humanize-values)
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
