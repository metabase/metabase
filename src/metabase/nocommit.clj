(ns metabase.nocommit
  (:require [clojure.data.csv :as csv]
            [clojure.java.io :as io]
            [clojure.java.shell :as sh]
            [clojure.tools.trace :as tr]
            [hiccup.core :as hiccup :refer [html]]
            [medley.core :as m]
            [metabase.models.card :refer [Card]]
            [metabase.pulse.render.style :as style]
            [metabase.query-processor :as qp]
            [metabase.query-processor.pivot :as qp.pivot]
            [toucan.db :as db]))

(defn write! [pivoted-rows]
  (with-open [writer (io/writer "pivoted-magic.csv")]
    (csv/write-csv writer pivoted-rows)))

  ;; --------------------------------

  (defn nil-compare
    [a b]
    (cond
      (and (nil? a) (nil? b)) 0
      (nil? a)                1
      (nil? b)                -1
      :else                   (compare a b)))

  (defn compare-vectors
    [as bs]
    (let [max-index (min (count as) (count bs))]
      (loop [i 0]
        (if (= i max-index)
          0
          (let [comparison (nil-compare (nth as i) (nth bs i))]
            (if (zero? comparison)
              (recur (inc i))
              comparison))))))

(defn- viz-count
  [k viz-settings]
    (-> viz-settings
      :pivot_table.column_split
      k
      count))

(defn row-count
  [viz-settings]
  (viz-count :rows viz-settings))

(defn column-count
  [viz-settings]
  (viz-count :columns viz-settings))

(defn aggregate-count
  [viz-settings]
  (viz-count :values viz-settings))

(defn row-indices
  [viz-settings]
  (range (row-count viz-settings)))

(defn column-indices
  [viz-settings]
  (let [nrows (row-count viz-settings)]
    (range nrows (+ nrows (column-count viz-settings)))))

(defn aggregate-indices
  [viz-settings]
  (let [other-fields-count (+ (row-count viz-settings)
                              (column-count viz-settings)
                              1)]  ;; the pivot-grouping
    (range other-fields-count (+ other-fields-count (aggregate-count viz-settings)))))

(defn sorted-rows
  [res breakout-row-indices breakout-column-indices]
  (let [indices       (concat breakout-row-indices breakout-column-indices)
        index-fn      (fn [i] #(nth % i))
        index-getters (map index-fn indices)]
    (->> res
         :data
         :rows
         (sort-by (apply juxt index-getters) compare-vectors))))

(defn- combine-rows
  "Puts many skinny rows into one wide one"
  [breakout-rows aggregates [first-row :as rows]]
  (concat (map #(nth first-row %) breakout-rows)
          (mapcat (fn [row] (map (partial nth row) aggregates)) rows)))

(defn- is-unnecessary-column-total?
  [breakout-columns row]
  (let [col-vals (map (partial nth row) breakout-columns)]
    (< 0 (count (remove nil? col-vals)) (count col-vals))))

(defn columnize-rows
  "Go from one total per row in `rows` to  fewer, fatter rows with totals spread over multiple columns."
  [rows breakout-rows breakout-columns aggregates] ;; must be sorted
  (->> rows
       (remove (partial is-unnecessary-column-total? breakout-columns))
       (partition-by (fn [row] (every? #(nil? (nth row %)) breakout-columns)))
       (partition 2)
       (map (partial apply concat))
       (map (partial combine-rows breakout-rows aggregates))))

(defn pivot-results->formatted-rows
  [card-id]
  (let [{query        :dataset_query
         viz-settings :visualization_settings} (db/select-one [Card :dataset_query :visualization_settings]
                                                 :id card-id)
        breakout-rows                          (row-indices viz-settings)
        breakout-columns                       (column-indices viz-settings)
        aggregates                             (aggregate-indices viz-settings)]
    (-> query
        qp.pivot/run-pivot-query
        (sorted-rows breakout-rows breakout-columns)
        (columnize-rows breakout-rows breakout-columns aggregates))))
