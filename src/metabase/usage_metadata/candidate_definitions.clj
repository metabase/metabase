(ns metabase.usage-metadata.candidate-definitions
  "Pure semantic operations shared by candidate mining and Library reconciliation."
  (:require
   [clojure.set :as set]
   [metabase.lib.core :as lib]
   [metabase.usage-metadata.candidate-mining :as candidate-mining]))

(set! *warn-on-reflection* true)

(def ^:private reconciliation-segment-atoms ::reconciliation-segment-atoms)
(def ^:private reconciliation-measure-base ::reconciliation-measure-base)

(defn aggregation-clause
  "Return the first normalized aggregation clause in a persisted definition."
  [definition]
  (first (lib/aggregations (lib/normalize definition) 0)))

(defn- field-id
  [clause]
  (when (lib/clause-of-type? clause :field)
    (nth clause 2 nil)))

(defn- measure-base-from-aggregation
  [[tag _opts & args]]
  (case tag
    :count-where    [:count nil]
    :distinct-where [:distinct (field-id (first args))]
    :sum-where      [:sum (field-id (first args))]
    [tag (field-id (first args))]))

(defn measure-base
  "Return the base operation and field that identify a Measure family."
  [definition]
  (some-> (aggregation-clause definition) measure-base-from-aggregation))

(defn segment-atoms
  "Return canonical signatures for the atomic predicates in a Segment definition."
  [definition]
  (into #{}
        (map candidate-mining/canonical-signature)
        (lib/atomic-filters (lib/normalize definition) 0)))

(defn measure-condition-atoms
  "Return canonical predicate signatures from a conditional Measure."
  [definition]
  (when-let [[tag _opts & args] (aggregation-clause definition)]
    (when-let [condition (case tag
                           :count-where    (first args)
                           :distinct-where (second args)
                           :sum-where      (second args)
                           nil)]
      (letfn [(flatten-and [[clause-tag _opts & clause-args :as clause]]
                (if (= clause-tag :and)
                  (mapcat flatten-and clause-args)
                  [clause]))]
        (into #{}
              (map candidate-mining/canonical-signature)
              (flatten-and condition))))))

(defn relation-for-segment
  "Classify the structural relationship between a candidate and existing Segment."
  [candidate existing]
  (let [candidate-atoms (or (get candidate reconciliation-segment-atoms)
                            (segment-atoms (:definition candidate)))
        existing-atoms  (or (get existing reconciliation-segment-atoms)
                            (segment-atoms (:definition existing)))
        overlap         (set/intersection candidate-atoms existing-atoms)]
    (cond
      (= (:signature candidate) (:signature existing)) :exact
      (empty? overlap)                                  nil
      (set/subset? existing-atoms candidate-atoms)      :subset
      (set/subset? candidate-atoms existing-atoms)      :superset
      :else                                             :overlap)))

(defn relation-for-measure
  "Classify the structural relationship between a candidate and existing Measure."
  [candidate existing]
  (let [candidate-base (or (get candidate reconciliation-measure-base)
                           (measure-base (:definition candidate)))
        existing-base  (or (get existing reconciliation-measure-base)
                           (measure-base (:definition existing)))]
    (cond
      (= (:signature candidate) (:signature existing))       :exact
      (and candidate-base (= candidate-base existing-base))  :same-base
      :else                                                   nil)))

(defn existing-signature
  "Build the mining-compatible signature for an existing Library entity."
  [type table-id definition]
  (case type
    :measure
    (when-let [aggregation (aggregation-clause definition)]
      (candidate-mining/canonical-signature
       [table-id (candidate-mining/canonical-signature aggregation)]))

    :segment
    (let [atoms (segment-atoms definition)]
      (when (seq atoms)
        (candidate-mining/canonical-signature [table-id (vec (sort atoms))])))))

(defn reconciliation-entity
  "Attach canonical identity and structural data used while reconciling an entity.

  Preparing candidates and existing Library entities once prevents Lib normalization from being repeated for every
  candidate/entity comparison."
  [type table-id entity]
  (case type
    :measure
    (let [aggregation (aggregation-clause (:definition entity))]
      (cond-> (assoc entity reconciliation-measure-base
                     (some-> aggregation measure-base-from-aggregation))
        (not (contains? entity :signature))
        (assoc :signature
               (when aggregation
                 (candidate-mining/canonical-signature
                  [table-id (candidate-mining/canonical-signature aggregation)])))))

    :segment
    (let [atoms (segment-atoms (:definition entity))]
      (cond-> (assoc entity reconciliation-segment-atoms atoms)
        (not (contains? entity :signature))
        (assoc :signature
               (when (seq atoms)
                 (candidate-mining/canonical-signature [table-id (vec (sort atoms))])))))

    entity))

(defn candidate-row->observation
  "Normalize a database-shaped candidate row for shared mining rules."
  [{:keys [candidate_type semantic_details complexity verified_source_count official_source_count
           popular_source_count distinct_source_count recent_view_count signature]}]
  {:candidate-type candidate_type
   :aggregation    (when (= candidate_type :measure)
                     (update semantic_details :type #(some-> % keyword)))
   :atom-count     (when (= candidate_type :segment) complexity)
   :evidence       {:verified-source-count verified_source_count
                    :official-source-count official_source_count
                    :popular-source-count  popular_source_count
                    :distinct-source-count distinct_source_count
                    :total-view-count      recent_view_count}
   :signature      signature})

(defn candidate-priority-key
  "Return the deterministic mining priority key for a persisted candidate."
  [candidate]
  (candidate-mining/candidate-sort-key (candidate-row->observation candidate)))
