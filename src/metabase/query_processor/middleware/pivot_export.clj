(ns metabase.query-processor.middleware.pivot-export
  (:require
   [clojure.math.combinatorics :as math.combo]))

(defn grouper
  "create the groupings for the measures, keyed on [[pivot-rows] [pivot-cols]"
  [rows {:keys [pivot-rows pivot-cols]}]
  (group-by (juxt
             (apply juxt (map (fn [k] #(get % k)) pivot-rows))
             (apply juxt (map (fn [k] #(get % k)) pivot-cols))) rows))

(defn all-values-for
  "Get all possible values for pivot-col/row 'k'."
  [rows k]
  (distinct (map #(get % k) rows)))

(defn- combos
  "Cartesian product of the values for supplied pivot-rows/cols keys."
  [entries keys]
  (mapv
   vec
   (apply math.combo/cartesian-product (mapv #(all-values-for entries %) keys))))

(defn- any-val?
  [coll]
  (boolean (some identity coll)))

(defn- row-builder
  [rows {:keys [pivot-rows pivot-cols measure-keys] :as pivot-spec}]
  (let [groups       (grouper rows pivot-spec)
        measure-keys (or measure-keys (remove (set (concat pivot-rows pivot-cols)) (range (count (first rows)))))]
    (for [rvs (combos rows pivot-rows)]
      (let [col-vals (map
                      (fn [cvs]
                        (-> groups
                            (get[rvs cvs])
                            first
                            (get (first measure-keys))))
                      (combos rows pivot-cols))]
        (when (any-val? col-vals)
          (into rvs col-vals))))))

(defn- header-builder
  [rows {:keys [pivot-rows pivot-cols]}]
  (let [cvs (combos rows pivot-cols)]
    (map-indexed
     (fn [idx _col-key]
       (into pivot-rows (map #(get % idx) cvs)))
     pivot-cols)))

(defn pivot-builder
  "Builds the 'visual pivot' table. These are the rows that correspond (as much as possible) to what the pivot table looks like in app."
  [rows pivot-spec]
  (vec
   (remove nil? (concat
                 (header-builder rows pivot-spec)
                 (row-builder rows pivot-spec)))))

#_(defn visual-pivot-rows
  "Middleware for creating the visual pivot rows for exports."
  [{{:keys [process-pivot?]} :middleware, :as query} rff]
  (if true #_process-pivot?
    (fn update-viz-settings-rff* [metadata]
      (rff (assoc metadata :visual-pivot-rows [[:a :b :c]])))
    rff))
