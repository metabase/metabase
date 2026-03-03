(ns metabase-enterprise.metabot-v3.stats.outliers
  "Modified Z-score based outlier detection for chart analysis.

  Uses the Modified Z-score method which is more robust than standard Z-scores
  because it uses median and MAD (Median Absolute Deviation) instead of mean
  and standard deviation, making it resistant to outliers in the calculation itself."
  (:require
   [tech.v3.datatype.argops :as argops]
   [tech.v3.datatype.functional :as dfn]))

(set! *warn-on-reflection* true)

(def ^:private modified-z-threshold
  "Threshold for modified Z-score. Values with |modified_z| > 3.0 are considered outliers.
  This matches the AI service implementation and is a commonly used threshold."
  3.0)

(def ^:private mad-normalization-constant
  "Constant used to normalize MAD to be comparable with standard deviation.
  For normally distributed data, MAD ≈ 0.6745 * σ, so we multiply by 0.6745
  to get a scale comparable to standard Z-scores."
  0.6745)

(defn- compute-mad
  "Compute the Median Absolute Deviation (MAD) of values.
  MAD = median(|xi - median(x)|)"
  [values median-val]
  (let [deviations (dfn/- values median-val)
        abs-deviations (dfn/abs deviations)]
    (dfn/median abs-deviations)))

(defn- compute-modified-z-scores
  "Compute modified Z-scores for all values.
  modified_z = 0.6745 * (xi - median) / MAD

  Returns nil if MAD is zero (all values are identical)."
  [values]
  (let [med (dfn/median values)
        mad (compute-mad values med)]
    (when (pos? mad)
      (let [centered (dfn/- values med)
            scaled (dfn// centered mad)]
        (dfn/* scaled mad-normalization-constant)))))

(defn find-outlier-indices
  "Find indices of outlier values using the Modified Z-score method.

  Returns a vector of indices where |modified_z| > 3.5.
  Returns empty vector if no outliers found or if MAD is zero."
  [values]
  (if-let [z-scores (compute-modified-z-scores values)]
    (vec (argops/argfilter #(> (Math/abs (double %)) modified-z-threshold) z-scores))
    []))

(defn find-outliers
  "Find outliers in a dataset with their details.

  Arguments:
    values     - sequence of numeric values
    dates      - sequence of date/dimension values (same length as values)

  Returns a sequence of outlier maps with:
    :index           - position in the original sequence
    :date            - the date/dimension value at that position
    :value           - the numeric value
    :modified_z_score - the modified Z-score"
  [values dates]
  (when-let [z-scores (compute-modified-z-scores values)]
    (let [indices (vec (argops/argfilter #(> (Math/abs (double %)) modified-z-threshold) z-scores))
          values-vec (vec values)
          dates-vec (vec dates)
          z-scores-vec (vec z-scores)]
      (mapv (fn [idx]
              {:index idx
               :date (nth dates-vec idx)
               :value (nth values-vec idx)
               :modified_z_score (nth z-scores-vec idx)})
            indices))))

(defn find-outliers-cumulative
  "Find outliers in cumulative data by analyzing period-over-period diffs.

  For cumulative (monotonically increasing) data, outliers are detected in the
  diffs rather than raw values. When a diff is flagged as an outlier, we report
  the destination point (i.e., the point that received the unusual increase).

  Arguments:
    values     - sequence of numeric values (cumulative data)
    dates      - sequence of date/dimension values (same length as values)

  Returns a sequence of outlier maps with:
    :index           - position in the original sequence
    :date            - the date/dimension value at that position
    :value           - the numeric value at that position
    :diff            - the period-over-period change that was flagged
    :modified_z_score - the modified Z-score of the diff"
  [values dates]
  (let [values-vec (vec values)
        dates-vec (vec dates)
        diffs (mapv - (rest values-vec) values-vec)]
    (when-let [z-scores (compute-modified-z-scores diffs)]
      (let [outlier-diff-indices (vec (argops/argfilter #(> (Math/abs (double %)) modified-z-threshold) z-scores))
            z-scores-vec (vec z-scores)]
        (mapv (fn [diff-idx]
                (let [point-idx (inc diff-idx)]
                  {:index point-idx
                   :date (nth dates-vec point-idx)
                   :value (nth values-vec point-idx)
                   :diff (nth diffs diff-idx)
                   :modified_z_score (nth z-scores-vec diff-idx)}))
              outlier-diff-indices)))))
