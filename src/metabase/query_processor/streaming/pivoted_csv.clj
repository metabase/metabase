(ns metabase.query-processor.streaming.pivoted-csv
  (:require [clojure.data.csv :as csv]
            [clojure.core.async :as a]
            [metabase.models.card :refer [Card]]
            [metabase.query-processor.pivot :as qp.pivot]
            [metabase.query-processor.streaming.common :as common]
            [metabase.query-processor.streaming.csv :as qp.csv]
            [metabase.query-processor.streaming.interface :as qp.si]
            [toucan.db :as db])
  (:import [java.io BufferedWriter OutputStream OutputStreamWriter]
           java.nio.charset.StandardCharsets))

(defn- nil-compare
  [a b]
  (cond
    (and (nil? a) (nil? b)) 0
    (nil? a)                1
    (nil? b)                -1
    :else                   (compare a b)))

(defn- compare-vectors
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

(defn- row-count
  [viz-settings]
  (viz-count :rows viz-settings))

(defn- column-count
  [viz-settings]
  (viz-count :columns viz-settings))

(defn- aggregate-count
  [viz-settings]
  (viz-count :values viz-settings))

(defn- row-indices
  [viz-settings]
  (range (row-count viz-settings)))

(defn- column-indices
  [viz-settings]
  (let [nrows (row-count viz-settings)]
    (range nrows (+ nrows (column-count viz-settings)))))

(defn- aggregate-indices
  [viz-settings]
  (let [other-fields-count (+ (row-count viz-settings)
                              (column-count viz-settings)
                              1)]  ;; the pivot-grouping
    (range other-fields-count (+ other-fields-count (aggregate-count viz-settings)))))

(defn- sorted-rows
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

(defn- columnize-rows
  "Go from one total per row in `presorted-rows` to fewer, fatter rows with totals spread over multiple columns. As the
  name implies, `presorted-rows` must have been sorted, likely by the `sorted-rows` function."
  [presorted-rows breakout-rows breakout-columns aggregates]
  (->> presorted-rows
       (remove (partial is-unnecessary-column-total? breakout-columns))
       (partition-by (fn [row] (every? #(nil? (nth row %)) breakout-columns)))
       (partition 2)
       (map (partial apply concat))
       (map (partial combine-rows breakout-rows aggregates))))

(defn- pivot-results->formatted-rows
  [card-id pivoted-rows]
  (def cid card-id)
  (def prs pivoted-rows)
  (let [viz-settings     (db/select-one-field :visualization_settings Card :id card-id)
        breakout-rows    (row-indices viz-settings)
        breakout-columns (column-indices viz-settings)
        aggregates       (aggregate-indices viz-settings)]
    (-> pivoted-rows
        (sorted-rows breakout-rows breakout-columns)
        (columnize-rows breakout-rows breakout-columns aggregates))))

(defmethod qp.si/stream-options :pivoted.csv
  ([_]
   (qp.si/stream-options :pivoted.csv "query_result"))
  ([_ filename-prefix]
   (qp.csv/csv-stream-options "pivoted.csv" filename-prefix)))

(defmethod qp.si/streaming-results-writer :pivoted.csv
  [_ ^OutputStream os]
  (let [writer (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))]
    (reify qp.si/StreamingResultsWriter
      (begin! [_this _initial-metadata _viz-settings]
        ;; No-op: Headers are included in the result set
        )

      (write-row! [_ row _row-num _col _viz-settings]
        (println "OFF WE GO")
        (println row)
        (csv/write-csv writer row)
        (.flush writer))

      (finish! [_ _]
         ;; TODO -- not sure we need to flush both
        (.flush writer)
        (.flush os)
        (.close writer)))))

(defmethod qp.si/streaming-results-query-processor :pivoted.csv
  [_export-format]
  qp.pivot/run-pivot-query)

(defmethod qp.si/streaming-results-post-processor :pivoted.csv
  [_export-format card-id]
  (partial pivot-results->formatted-rows card-id))
