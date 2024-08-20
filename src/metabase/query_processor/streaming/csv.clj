(ns metabase.query-processor.streaming.csv
  (:require
   [clojure.data.csv :as csv]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.formatter :as formatter]
   [metabase.query-processor.pivot.postprocess :as qp.pivot.postprocess]
   [metabase.query-processor.streaming.common :as common]
   [metabase.query-processor.streaming.interface :as qp.si]
   [metabase.shared.models.visualization-settings :as mb.viz]
   [metabase.util.date-2 :as u.date])
  (:import
   (java.io BufferedWriter OutputStream OutputStreamWriter)
   (java.nio.charset StandardCharsets)))

(set! *warn-on-reflection* true)

(defmethod qp.si/stream-options :csv
  ([_]
   (qp.si/stream-options :csv "query_result"))
  ([_ filename-prefix]
   {:content-type              "text/csv"
    :status                    200
    :headers                   {"Content-Disposition" (format "attachment; filename=\"%s_%s.csv\""
                                                              (or filename-prefix "query_result")
                                                              (u.date/format (t/zoned-date-time)))}
    :write-keepalive-newlines? false}))

;; As a first step towards hollistically solving this issue: https://github.com/metabase/metabase/issues/44556
;; (which is basically that very large pivot tables can crash the export process),
;; The post processing is disabled completely.
;; This should remain `false` until it's fixed
;; TODO: rework this post-processing once there's a clear way in app to enable/disable it, or to select alternate download options
(def ^:dynamic *pivot-export-post-processing-enabled*
  "Flag to enable/disable export post-processing of pivot tables.
  Disabled by default and should remain disabled until Issue #44556 is resolved and a clear plan is made."
  true)



(defn init-pivot [config]
  (let [{:keys [pivot-rows pivot-cols pivot-measures]} config]
    {:config         config
     :data           {}
     :row-values     (zipmap pivot-rows (repeat (sorted-set)))
     :column-values  (zipmap pivot-cols (repeat (sorted-set)))
     :measure-values (zipmap pivot-measures (repeat (sorted-set)))}))

(defn update-set [m k v]
  (update m k conj v))

(defn deep-merge [v & vs]
  (if (map? v)
    (apply merge-with deep-merge v vs)
    (last vs)))

(defn- add-wrapped-numbers
  [a b]
  (let [new-value (apply + (map :metabase.formatter.NumericWrapper/num-value [a b]))]
    {:metabase.formatter.NumericWrapper/num-value new-value
     :metabase.formatter.NumericWrapper/num-string (str new-value)}))

(defn update-aggregate [measure-aggregations new-values agg-fns]
  (into {}
        (map
         (fn [[measure-key agg]]
           (let [agg-fn (get agg-fns measure-key (fn [a b] b) #_add-wrapped-numbers)
                 new-v  (get new-values measure-key)]
             [measure-key (agg-fn agg new-v)])))
        measure-aggregations))

(defn add-row [pivot row]
  (let [{:keys [pivot-rows pivot-cols pivot-measures measures]} (:config pivot)
        row-path (mapv row pivot-rows)
        col-path (mapv row pivot-cols)
        measure-vals (select-keys row pivot-measures)]
    (-> pivot
        (update :count (fn [v] (if v (inc v) 0)))
        (update :data update-in (concat row-path col-path)
                #(update-aggregate (or % (zipmap pivot-measures (repeat 0))) measure-vals measures))
        (update :row-values #(reduce-kv update-set % (select-keys row pivot-rows)))
        (update :column-values #(reduce-kv update-set % (select-keys row pivot-cols))))))

(defn cartesian-product [colls]
  (if (empty? colls)
    '(())
    (for [x (first colls)
          more (cartesian-product (rest colls))]
      (cons x more))))
#_
(defn build-pivot-output [pivot]
  (let [{:keys [config data
                row-values
                column-values]} pivot
        {:keys [pivot-rows
                pivot-cols
                pivot-measures
                column-titles]} config
        row-combos              (cartesian-product (map row-values pivot-rows))
        col-combos              (cartesian-product (map column-values pivot-cols))

        ;; Build the multi-level column headers
        column-headers (for [col-combo   col-combos
                             measure-key pivot-measures]
                         (conj (vec col-combo) (get column-titles measure-key)))

        ;; Combine row keys with the new column headers
        headers (map (fn [h]
                       (concat (map #(get column-titles %) pivot-rows) h))
                     (apply map vector column-headers))]

    (concat headers
            (for [row-combo row-combos]
              (let [row-path row-combo]
              (concat row-combo
                      (for [col-combo   col-combos
                            measure-key pivot-measures]
                        (get-in data (concat row-path col-combo [measure-key])))))))))

(defn build-pivot-output [pivot]
  (let [{:keys [config data
                row-values
                column-values]} pivot
        {:keys [pivot-rows
                pivot-cols
                pivot-measures
                column-titles]} config
        row-combos              (cartesian-product (map row-values pivot-rows))
        col-combos              (cartesian-product (map column-values pivot-cols))
        ;; Build the multi-level column headers
        column-headers (for [col-combo   col-combos
                             measure-key pivot-measures]
                         (conj (vec col-combo) (get column-titles measure-key)))
        ;; Add "Row Total" to column headers
        column-headers-with-total (concat column-headers [(repeat (count pivot-measures) "Row Total")])
        ;; Combine row keys with the new column headers
        headers (map (fn [h]
                       (concat (map #(get column-titles %) pivot-rows) h))
                     (apply map vector column-headers-with-total))
        ;; Function to calculate row total
        calculate-row-total (fn [row-data]
                              (let [groups (partition (count pivot-measures) (mapv (fn [v] (or v 0)) row-data))]
                                (reduce (fn [a b]
                                          (mapv + (or a 0) (or b 0))) (repeat (count pivot-measures) 0) groups))
                              #_
                              (reduce (fn [totals v]
                                        (merge-with + totals v))
                                      {}
                                      (remove nil? row-data)))]
    (concat headers
            (for [row-combo row-combos]
              (let [row-path row-combo
                    row-data (for [col-combo   col-combos
                                   measure-key pivot-measures]
                               (get-in data (concat row-path col-combo [measure-key])))
                    row-total (calculate-row-total row-data)]
                (concat row-combo
                        row-data
                        row-total))))))

(defmethod qp.si/streaming-results-writer :csv
  [_ ^OutputStream os]
  (let [writer             (BufferedWriter. (OutputStreamWriter. os StandardCharsets/UTF_8))
        ordered-formatters (volatile! nil)
        pivot-data         (atom nil)]
    (reify qp.si/StreamingResultsWriter
      (begin! [_ {{:keys [ordered-cols results_timezone format-rows? pivot-export-options]
                   :or   {format-rows? true}} :data} viz-settings]
        (let [opts      (when (and *pivot-export-post-processing-enabled* pivot-export-options)
                          (-> (merge {:pivot-rows []
                                      :pivot-cols []}
                                     pivot-export-options)
                              (assoc :column-titles (mapv :display_name ordered-cols))
                              qp.pivot.postprocess/add-pivot-measures))
              ;; col-names are created later when exporting a pivot table, so only create them if there are no pivot options
              col-names (when-not opts (common/column-titles ordered-cols (::mb.viz/column-settings viz-settings) format-rows?))]

          ;; when pivot options exist, we want to save them to access later when processing the complete set of results for export.
          (when opts
            (reset! pivot-data (init-pivot opts)))
          (vreset! ordered-formatters
                   (if format-rows?
                     (mapv #(formatter/create-formatter results_timezone % viz-settings) ordered-cols)
                     (vec (repeat (count ordered-cols) identity))))
          ;; write the column names for non-pivot tables
          (when col-names
            (csv/write-csv writer [col-names])
            (.flush writer))))

      (write-row! [_ row _row-num _ {:keys [output-order]}]
        (let [ordered-row   (if output-order
                              (let [row-v (into [] row)]
                                (into [] (for [i output-order] (row-v i))))
                              row)
              formatted-row (mapv (fn [formatter r]
                                    (formatter (common/format-value r)))
                                  @ordered-formatters ordered-row)]

          (if @pivot-data
            ;; if we're processing a pivot result, we don't write it out yet, just store it
            ;; so that we can post process the full set of results in finish!
            (when (= 0 (nth ordered-row (get-in @pivot-data [:config :pivot-grouping])))
              (swap! pivot-data (fn [a] (add-row a ordered-row))))
            (do
              (csv/write-csv writer [formatted-row])
              (.flush writer)))))

      (finish! [_ _]
        ;; TODO -- not sure we need to flush both
        (def asdf @pivot-data)
        (when @pivot-data
          (let [pivot-table-rows (build-pivot-output @pivot-data)]
            (doseq [xf-row pivot-table-rows]
              (csv/write-csv writer [xf-row]))))
        (.flush writer)
        (.flush os)
        (.close writer)))))
