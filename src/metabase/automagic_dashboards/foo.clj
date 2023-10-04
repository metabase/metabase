(ns metabase.automagic-dashboards.foo
  (:require
    [clojure.math.combinatorics :as math.combo]
    [clojure.walk :as walk]
    [metabase.automagic-dashboards.foo-dashboard-generator :as dash-gen]
    [toucan2.core :as t2]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Global affinity definitions

(defn affinity-set-interestingness [affinity-set]
  (reduce + (map (fn [a] (count (ancestors a))) affinity-set)))

(def affinity-specs
  (mapv
    (fn [{:keys [affinity-set] :as m}]
      (assoc m :affinity-interestingness (affinity-set-interestingness affinity-set)))
    [{:affinity-set #{:type/Longitude :type/Latitude} :charts [:map :binned-map]}
     {:affinity-set #{:type/Country} :charts [:map]}
     ;; How does this look?
     {:affinity-set #{:type/State} :charts [:map]}
     ;{:affinity-set #{:type/ZipCode} :charts [:map]}
     {:affinity-set #{:type/Source} :charts [:bar]}
     {:affinity-set #{:type/Category} :charts [:bar]}
     {:affinity-set #{:type/CreationTimestamp} :charts [:line]}
     {:affinity-set #{:type/Quantity} :charts [:line]}
     {:affinity-set #{:type/Discount} :charts [:line]}]))

;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;
;; Code for creation of instantiated affinities

(defn find-field-ids
  "A utility function for pulling field definitions from mbql queries and return their IDs.
   Does something like this already exist in our utils? I was unable to find anything like it."
  [m]
  (let [fields (atom #{})]
    (walk/prewalk
      (fn [v]
        (when (vector? v)
          (let [[f id] v]
            (when (and id (= :field f))
              (swap! fields conj id))))
        v)
      m)
    @fields))

(defn semantic-groups
  "From a :model/Metric, construct a mapping of semantic types of linked fields to
   sets of fields that can satisfy that type. A linked field is one that is in the
   source table for the metric contribute to the metric itself, is not a PK, and
   has a semantic_type (we assume nil semantic_type fields are boring)."
  [{:keys [table_id definition]}]
  (let [field-ids            (find-field-ids definition)
        potential-dimensions (t2/select :model/Field
                               :id [:not-in field-ids]
                               :table_id table_id
                               :semantic_type [:not-in [:type/PK]])]
    (update-vals
      (->> potential-dimensions
           (group-by :semantic_type))
      set)))

(defn instantiate-affinities
  "For a given metric, determine adjacent fields and return a map of them by
  semantic type grouping."
  [metric]
  (let [semantic-groups      (semantic-groups metric)]
    (for [{:keys [affinity-set] :as affinity-spec} affinity-specs
          :when (every? semantic-groups affinity-set)
          :let [bindings (map semantic-groups affinity-set)]
          dimensions (apply math.combo/cartesian-product bindings)]
      (assoc affinity-spec
        :metric       metric
        :dimensions   dimensions))))

;; This is SUPER important
;; It can be sourced internally or from other data
(defn identify-metrics [thing]
  ;;Can come from linked entities or templates
  ;; Maybe will be returned as queries, as is done with linked metrics above
  )

;; Here we add in breakouts. Or should this be identify dimensions.
(defn associate-affinities [thing]
  )

;; Make the cards or whatever
(defn do-stuff [thing])

(comment

  (let [{table-id :id :as table} (t2/select-one :model/Table :name "ORDERS")]
    (map (juxt :id :name :semantic_type) (t2/select :model/Field :table_id table-id)))

  (map (juxt :name :id) (t2/select :model/Metric))
  ;(["Churn" 785] ["gmail" 909] ["Weird Thing" 910] ["Multitable Metric" 920])
  (->> (t2/select :model/Metric)
       (map (fn [{:keys [name id] :as metric}]
              [name id (keys (semantic-groups metric))])))

  (semantic-groups
    (t2/select-one :model/Metric :name "Churn"))

  (let [{metric-name :name :as metric} (t2/select-one :model/Metric :name "Churn")]
    (->> metric
         instantiate-affinities
         (dash-gen/create-dashboard {:dashboard-name metric-name})))

  (->> (t2/select-one :model/Metric :name "Churn")
       instantiate-affinities
       (mapv (fn [affinity]
               (-> affinity
                   (update :dimensions #(mapv :name %))
                   (update :metric :name)))))

  (->> (t2/select-one :model/Metric :name "Weird Thing")
       instantiate-affinities)


  (->> (instantiate-affinities (t2/select-one :model/Metric :name "Churn"))
       (map :card)
       dash-gen/do-layout)
  )

(defn find-metrics
  ;; what should this return?

  ;; the metric should include the aggregation clause grounded on a field id.
  ;;
  [])

(defn find-dimensions
  [])
