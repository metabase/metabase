(ns metabase.automagic-dashboards.foo
  (:require
    [clojure.math.combinatorics :as math.combo]
    [clojure.walk :as walk]
    [metabase.automagic-dashboards.dashboard-templates :as dashboard-templates]
    [metabase.automagic-dashboards.foo-dashboard-generator :as dash-gen]
    [metabase.models.interface :as mi]
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
  (let [semantic-groups (semantic-groups metric)]
    (for [{:keys [affinity-set] :as affinity-spec} affinity-specs
          :when (every? semantic-groups affinity-set)
          :let [bindings (map semantic-groups affinity-set)]
          dimensions (apply math.combo/cartesian-product bindings)]
      (assoc affinity-spec
        :metric metric
        :dimensions dimensions))))

;; This is SUPER important
;; It can be sourced internally or from other data
(defn find-metrics [thing]
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

(defmulti linked-metrics mi/model)

(defmethod linked-metrics :model/Metric [{metric-name :name :keys [definition] :as metric}]
  [{:metric-name            metric-name
    :metric-title           metric-name
    :metric-definition      definition
    :metric-interestingness :???}])

(defmethod linked-metrics :model/Table [{table-id :id :keys [definition] :as table}]
  (mapcat
    linked-metrics
    (t2/select :model/Metric :table_id table-id)))

(defmethod linked-metrics :default [_] [])

(defmulti potential-dimensions mi/model)

(defmethod potential-dimensions :model/Metric [{table-id :table_id}]
  (group-by
    (fn [{:keys [semantic_type effective_type]}]
      (or semantic_type effective_type))
    (t2/select :model/Field :table_id table-id)))

(defmethod potential-dimensions :model/Table [{table-id :id}]
  (group-by
    (fn [{:keys [semantic_type effective_type]}]
      (or semantic_type effective_type))
    (t2/select :model/Field :table_id table-id)))

(defmethod potential-dimensions :default [_] {})

(comment
  (potential-dimensions (t2/select-one :model/Table :name "ORDERS"))
  (potential-dimensions (t2/select-one :model/Metric :name "Churn"))
  )

(defn transform-metric-aggregate
  "Map a metric aggregate definition from nominal types to semantic types."
  [m decoder]
  (walk/prewalk
    (fn [v]
      (if (vector? v)
        (let [[d n] v]
          (if (= "dimension" d)
            (decoder n)
            v))
        v))
    m))

(defn generate-metric-definitions
  "Given a set of metrics and dimensions, produce a sequence of metric definitions containing semantic information
  such that it can be easily bound to real dimensions/fields."
  [{:keys [dimensions metrics]}
   semantic-type->fields]
  (let [nominal-dims->semantic-types
        (->> dimensions
             (map first)
             (map (fn [[dimension-name {:keys [field_type]}]]
                    [dimension-name (peek field_type)]))
             (reduce
               (fn [acc [dimension-name semantic-type]]
                 (update acc dimension-name (fnil conj #{}) semantic-type))
               {}))]
    (->> metrics
         (map first)
         (mapcat (fn [[metric-name {metric-title :name metric-definition :metric}]]
                   (let [dims (dashboard-templates/collect-dimensions metric-definition)]
                     (->> (map nominal-dims->semantic-types dims)
                          (apply math.combo/cartesian-product)
                          (map (partial zipmap dims))
                          (mapcat (fn [nm->st]
                                 (->> (map semantic-type->fields (vals nm->st))
                                      (apply math.combo/cartesian-product)
                                      (map (partial zipmap (keys nm->st))))))
                          (map (fn [nm->field]
                                 (let [xform (update-vals nm->field (fn [{field-id :id}]
                                                                      [:field field-id nil]))
                                       interestingness (->> nm->field
                                                            vals
                                                            (map :semantic_type)
                                                            affinity-set-interestingness)]
                                   {:metric-name                 metric-name
                                    :metric-title                metric-title
                                    :metric-interestingness      interestingness
                                    ;:nominal-query               metric-definition
                                    :metric-definition           {:aggregation
                                                                  (transform-metric-aggregate metric-definition xform)}
                                    ;:nominal-type->field nm->field
                                    }))))))))
    ))

(defn generate-metrics
  "Given a thing to create metrics for and some template containing metric definitions, create a sequence of
   \"grounded\" metrics, each of which contains a partial query defining the metric bound to actual fields.

   Note that we currently take the dashboard-template as an argument because we need both the metric and dimension
   definitions from this template. We could, in the future, provide only metrics defined semantically to eliminate the
   larger data structure from being passed.
   "
  [thing dashboard-template]
  (let [semantic-type->fields (potential-dimensions thing)]
    (generate-metric-definitions
      dashboard-template
      semantic-type->fields)))

(defn find-metrics
  "Create a sequence of metrics, each of which follows the shape of this fragment:

   {:metric-name \"MinJoinDate\"
    :metric-title \"Earliest Joint Date\"
    :metric-interestingness 5
    :metric-definition {:aggregation [\"min\" [:field 13 nil]]}}
  "
  [thing dashboard-template]
  (let [linked-metrics    (linked-metrics thing)
        generated-metrics (generate-metrics thing dashboard-template)]
    (into
      linked-metrics
      generated-metrics)))

(defn find-dimensions
  [_])

(comment
  (find-metrics
    (t2/select-one :model/Metric :name "Churn")
    (dashboard-templates/get-dashboard-template ["table" "UserTable"]))

  (find-metrics
    (t2/select-one :model/Table :name "ACCOUNTS")
    nil)

  (find-metrics
    (t2/select-one :model/Table :name "ORDERS")
    nil)
  )