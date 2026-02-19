(ns metabase-enterprise.metabot-v3.tools.find-outliers
  "Find outliers in time-series data using the modified Z-score method.
  Ports the ai-service's Python outlier detection algorithm to Clojure,
  removing the dependency on the ai-service `/v1/find-outliers` endpoint."
  (:require
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.tools.util :as metabot-v3.tools.u]
   [metabase.api.common :as api]
   [metabase.lib.types.isa :as lib.types.isa]
   [metabase.query-processor :as qp]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Outlier Detection ------------------------------------------------

(def ^:private min-values
  "Minimum number of data points needed for reliable outlier detection."
  5)

(def ^:private max-values
  "Safety limit to avoid processing too many values."
  500000)

(def ^:private z-score-threshold
  "Modified Z-score threshold for outlier detection."
  3.0)

(def ^:private cumulative-threshold
  "Proportion of positive diffs that indicates cumulative data."
  0.8)

(defn- exact-median
  "Compute the exact median of a sequence of numbers.
  Uses sort-based approach for accuracy (vs histogram approximation)."
  [xs]
  (let [sorted (double-array (sort xs))
        n      (alength sorted)]
    (if (odd? n)
      (aget sorted (quot n 2))
      (/ (+ (aget sorted (dec (quot n 2)))
            (aget sorted (quot n 2)))
         2.0))))

(defn- modified-z-score-outliers
  "Detect outliers using the modified Z-score method with median and MAD.
  Returns a vector of booleans parallel to `values` indicating which are outliers."
  [values]
  (let [med    (exact-median values)
        deviations (mapv #(Math/abs (double (- (double %) (double med)))) values)
        mad    (exact-median deviations)]
    (if (zero? (double mad))
      ;; MAD=0 means majority of values equal median; anything else is an outlier
      (mapv #(not (== (double %) (double med))) values)
      (let [med-d (double med)
            mad-d (double mad)]
        (mapv (fn [v]
                (> (Math/abs (* 0.6745 (/ (- (double v) med-d) mad-d)))
                   (double z-score-threshold)))
              values)))))

(defn- cumulative-data?
  "Detect cumulative data by checking if a high percentage of consecutive diffs are positive."
  [values]
  (let [diffs     (map (fn [a b] (- (double b) (double a))) values (rest values))
        n         (count diffs)
        positives (count (filter pos? diffs))]
    (when (pos? n)
      (>= (/ (double positives) (double n)) (double cumulative-threshold)))))

(defn- consecutive-diffs
  "Compute consecutive differences of a sequence of numbers.
  Returns a seq of (values[i+1] - values[i])."
  [values]
  (map (fn [a b] (- (double b) (double a))) values (rest values)))

(defn- detect-outliers
  "Detect outliers in dimension/value pairs.
  Mirrors the Python ai-service algorithm:
  1. Sort by dimension
  2. If data is cumulative, detect outliers in the diffs
  3. Otherwise detect outliers in the raw values
  Returns the subset of pairs that are outliers."
  [pairs]
  (let [n (count pairs)]
    (cond
      (> n max-values)
      (throw (ex-info (str "Too many values to process: " n) {:agent-error? true}))

      (< n min-values)
      []

      :else
      (let [sorted (sort-by :dimension pairs)
            values (mapv :value sorted)]
        (if (cumulative-data? values)
          ;; For cumulative data, outliers are detected on the diffs.
          ;; The first element has no diff (NaN in pandas), so it's never an outlier.
          (let [diffs    (consecutive-diffs values)
                outlier? (modified-z-score-outliers diffs)]
            ;; outlier? has n-1 elements, aligned with sorted[1..n-1]
            (into []
                  (keep-indexed (fn [i pair]
                                  (when (nth outlier? i) pair)))
                  (rest sorted)))
          ;; For non-cumulative data, detect directly
          (let [outlier? (modified-z-score-outliers values)]
            (into []
                  (keep-indexed (fn [i pair]
                                  (when (nth outlier? i) pair)))
                  sorted)))))))

;;; ------------------------------------------------- Query Helpers ---------------------------------------------------

(defn- checked-card-dataset-query
  [card-id]
  (-> (t2/select-one [:model/Card :collection_id :dataset_query] card-id)
      api/read-check
      :dataset_query))

(defn- find-dataset-query
  [{:keys [query report-id metric-id] :as data-source}]
  (cond
    metric-id (if (int? metric-id)
                (checked-card-dataset-query metric-id)
                (throw (ex-info "Invalid metric_id as data_source" {:agent-error? true
                                                                    :data-source data-source})))
    report-id (if (int? report-id)
                (checked-card-dataset-query report-id)
                (throw (ex-info "Invalid report_id as data_source" {:agent-error? true
                                                                    :data-source data-source})))
    query     (do (api/read-check :model/Database (:database query))
                  query)
    :else     (throw (ex-info "Invalid data_source" {:agent-error? true
                                                     :data-source data-source}))))

;;; -------------------------------------------------- Tool Entry -----------------------------------------------------

(defn find-outliers
  "Find outliers in the values provided by `data-source` for a given column.
  Runs the query, extracts dimension/value pairs, and performs modified Z-score
  outlier detection in-process (no ai-service dependency)."
  [{:keys [data-source]}]
  (let [{:keys [metric-id result-field-id]} data-source]
    (try
      (let [dataset-query (find-dataset-query data-source)
            {:keys [data]} (u/prog1 (-> dataset-query
                                        (qp/userland-query-with-default-constraints {:context :ad-hoc})
                                        qp/process-query)
                             (when-not (= :completed (:status <>))
                               (throw (ex-info "Unexpected error running query" {:agent-error? true
                                                                                 :status (:status <>)}))))
            dimension-col-idx (or (->> data
                                       :cols
                                       (map-indexed vector)
                                       (m/find-first (fn [[_i col]]
                                                       (lib.types.isa/temporal? (u/normalize-map col))))
                                       first)
                                  (throw (ex-info "No temporal dimension found. Outliers can only be detected when a temporal dimension is available."
                                                  {:agent-error? true})))
            value-col-idx (if metric-id
                            (or (->> data
                                     :cols
                                     (map-indexed vector)
                                     (m/find-first (fn [[_i col]]
                                                     (lib.types.isa/numeric? (u/normalize-map col))))
                                     first)
                                (throw (ex-info "Could not determine result field."
                                                {:agent-error? true})))
                            ;; Parse field-id and extract the numeric index
                            (if-let [{:keys [field-index]} (metabot-v3.tools.u/parse-field-id result-field-id)]
                              field-index
                              (throw (ex-info (str "Invalid result_field_id format: " result-field-id)
                                              {:agent-error? true
                                               :result-field-id result-field-id}))))]
        (when-not (< -1 value-col-idx (-> data :rows first count))
          (throw (ex-info (str "Invalid result_field_id " result-field-id)
                          {:agent-error? true})))
        {:structured-output (detect-outliers
                             (mapv (fn [row]
                                     {:dimension (nth row dimension-col-idx)
                                      :value (nth row value-col-idx)})
                                   (:rows data)))})
      (catch Exception e
        (metabot-v3.tools.u/handle-agent-error e)))))
