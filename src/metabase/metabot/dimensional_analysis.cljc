(ns metabase.metabot.dimensional-analysis
  "Perform analysis on metadata using measures and dimensions from metadata.
  Can eventually be used for a variety of purposes, but currently is used to select the 'best'
  visualization for metabot."
  (:require
    [clojure.set :refer [rename-keys]]
    [clojure.string :as str]
    #?(:clj [metabase.query-processor :as qp])
    [metabase.util :as u]))

(defn- classify-type
  "Take an element from the columns of the results metadata and return one of:
  - :measure - An OLAP cube measured item (Typically the Y-axis of a graph)
  - :dimension - An OLAP cube dimension (Typically the X-axis of a graph)
  - nil - It wouldn't be displayed on either axis (column ids and FKs are good examples)"
  [{:keys [semantic_type effective_type] :as _metadata}]
  (cond
    (isa? semantic_type :Relation/*) nil
    (or
      (isa? effective_type :type/Text)
      (isa? effective_type :type/Temporal)) :dimension
    (isa? effective_type :type/Number) :measure
    :else nil))

(defn to-measures-and-dimensions
  "Partition results metadata into measures and dimensions."
  [results_metadata]
  (-> (group-by classify-type results_metadata)
      (rename-keys {:measure   :measures
                    :dimension :dimensions})))

(defn viz-type
  "Determine the viz type from the provided measures and dimensions."
  [{:keys [measures dimensions]}]
  (let [[_first-measure] measures
        [first-dim] dimensions]
    (cond
      (and
        (zero? (count dimensions))
        (= 1 (count measures))
        (-> measures first :effective_type (isa? :type/Integer))
        (-> measures first :fingerprint :global :distinct-count (= 1))) :scalar
      ;; Note that ATM we aren't handling compound dimensions like lon/lat for pins where dim count is 2
      (or
        (zero? (count dimensions))
        (< 1 (count dimensions))) :table
      (and
        ;; Maps can only display one measure
        (= 1 (count measures))
        (isa? (:effective_type first-dim) :type/Text)
        (str/includes? (u/lower-case-en (:name first-dim)) "state")
        (-> first-dim :fingerprint :type :type/Text :average-length (== 2))) :state-map
      (or
        (isa? (:effective_type first-dim) :type/Temporal)
        (str/includes? (u/lower-case-en (:name first-dim)) "time")) :line
      :else :bar)))

(defmulti create-viz
          "Compute the visualization data structure for the provided measures and dimensions."
          viz-type)

(defmethod create-viz :scalar [{[{measure_name :name :keys [display_name]}] :measures}]
  {:display                :scalar
   :name                   display_name
   :visualization_settings {:graph.metrics    measure_name
                            :graph.dimensions []}})

#?(:clj
   (defn native-query->result-metadata
     "Retrieve metadata from a native query by first running the query with
     no more than 100 returned rows then get the metadata columns."
     [query]
     (let [limit-query (fn [sql] (format "WITH X AS (%s) SELECT * FROM X LIMIT 100" sql))]
       (-> (update-in query [:native :query] limit-query)
           qp/process-query
           (get-in [:data :results_metadata :columns])))))

(defmethod create-viz :state-map [{[{dimension_name :name}] :dimensions}]
  ;; TODO - we need refinement on other geographic region types
  {:display                :map
   :name                   (str dimension_name " by State")
   :visualization_settings {:map.region    "us_states"
                            :map.dimension dimension_name}})

(defmethod create-viz :line [{measures                 :measures
                              [{dimension_name :name}] :dimensions}]
  {:display                :line
   :name                   (str
                             (str/join ", " (mapv :name measures))
                             " over "
                             dimension_name)
   :visualization_settings {:graph.dimensions [dimension_name]
                            :graph.metrics    (mapv :name measures)}})

(defmethod create-viz :bar [{measures                 :measures
                             [{dimension_name :name}] :dimensions}]
  ;; TODO - we need refinement on other geographic region types
  {:display                :bar
   :name                   (str
                             (str/join ", " (mapv :name measures))
                             " over "
                             dimension_name)
   :visualization_settings {:graph.dimensions [dimension_name]
                            :graph.metrics    (mapv :name measures)}})

(defmethod create-viz :default [_]
  {:display :table})

(def select-viz
  "Select the appropriate visualization from the provided measures and dimensions."
  (comp create-viz to-measures-and-dimensions))


