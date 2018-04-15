(ns metabase.feature-extraction.core
  "Feature extraction for various models."
  (:require [clojure
             [walk :refer [postwalk]]
             [string :as s]]
            [medley.core :as m]
            [metabase.db.metadata-queries :as metadata]
            [metabase.feature-extraction
             [comparison :as comparison]
             [costs :as costs]
             [descriptions :refer [add-descriptions]]
             [feature-extractors :as fe]
             [math :as math]
             [values :as values]]
            [metabase.models
             [card :refer [Card]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [query :refer [Query] :as query]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.query-processor :as qp]
            [metabase.util :as u]
            [redux.core :as redux]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

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
  [{:keys [max-cost]} dataset]
  (and (not (costs/full-scan? max-cost))
       (= (count (:rows dataset dataset)) max-sample-size)))

(defn- extract-query-opts
  [{:keys [max-cost]}]
  (cond-> {}
    (not (costs/full-scan? max-cost)) (assoc :limit max-sample-size)))

(defmethod extract-features (type Field)
  [opts field]
  (let [{:keys [col row]} (values/field-values field (extract-query-opts opts))]
    {:features    (merge (fe/field->features opts col row)
                         {:model col})
     :sample?     (sampled? opts row)
     :comparables (comparables field)}))

(defmethod extract-features (type Table)
  [opts table]
  (let [dataset (values/query-values (metadata/db-id table)
                                     (merge (extract-query-opts opts)
                                            {:source-table (:id table)}))]
    {:constituents (fe/dataset->features opts dataset)
     :features     {:model table}
     :sample?      (sampled? opts dataset)
     :comparables  (comparables table)}))

(defn- ensure-aligment
  [fields cols rows]
  (if (not= fields (take 2 cols))
    (eduction (map (apply juxt (for [field fields]
                                 (let [idx (u/index-of #{field} cols)]
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
    {:constituents (fe/dataset->features opts dataset)
     :features     (merge (when (every? some? fields)
                            (fe/field->features
                             (->> card
                                  :dataset_query
                                  :query
                                  (assoc opts :query))
                             fields
                             (ensure-aligment fields cols rows)))
                          {:model card
                           :table (Table (:table_id card))})
     :sample?      (sampled? opts dataset)
     :comparables  (comparables card)}))

(defmethod extract-features (type Query)
  [opts query]
  (extract-features opts (with-meta query {:type (type Card)})))

(defmethod extract-features (type Segment)
  [opts segment]
  (let [dataset (values/query-values (metadata/db-id segment)
                                     (merge (extract-query-opts opts)
                                            (:definition segment)))]
    {:constituents (fe/dataset->features opts dataset)
     :features     {:table (Table (:table_id segment))
                    :model segment}
     :sample?      (sampled? opts dataset)
     :comparables  (comparables segment)}))

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
  (let [definition   (-> definition
                         (update-in [:aggregation 0] #(vector :named % name)))
        query        (query/map->QueryInstance
                      {:dataset_query {:type     :query
                                       :database (metadata/db-id metric)
                                       :query    definition}
                       :table_id      table_id})
        constituents (into {}
                       (for [field (dimensions metric)]
                         [(:name field)
                          (->> field
                               field->breakout
                               vector
                               (assoc-in query [:dataset_query :query :breakout])
                               (extract-features opts))]))]
    {:constituents constituents
     :features     {:metric metric
                    :table  (Table table_id)}
     :sample?      (some (comp :sample? val) constituents)}))

(defn- trim-decimals
  [decimal-places x]
  (u/round-to-decimals (- decimal-places (min (u/order-of-magnitude x) 0)) x))

(defn- model-type
  [x]
  (let [t (-> x type str)]
    (if (s/starts-with? t "class metabase.models.")
      (-> t
          (subs 22)
          (s/split #"\." 2)
          first)
      t)))

(defn- humanize-values
  [features]
  (postwalk
   (fn [x]
     (cond
       (float? x)                         (trim-decimals 2 x)
       (instance? clojure.lang.IRecord x) (assoc x :type-tag (model-type x))
       :else                              x))
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
  (if (:top-contributors comparisons)
    (->> comparisons
         :top-contributors
         (map (fn [[feature difference]]
                {:feature    feature
                 :difference difference})))
    (->> comparisons
         (math/head-tails-breaks (comp :distance val))
         (mapcat (fn [[field {:keys [top-contributors distance]}]]
                   (for [[feature {:keys [difference]}] top-contributors]
                     {:feature      feature
                      :field        field
                      :contribution (* (Math/sqrt distance) difference)})))
         (math/head-tails-breaks :contribution))))

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
     :comparables      (map :comparables [a b])
     :top-contributors (top-contributors comparisons)
     :sample?          (some :sample? [a b])
     :significant?     (if (:constituents a)
                         (some :significant? (vals comparisons))
                         (:significant? comparisons))}))
