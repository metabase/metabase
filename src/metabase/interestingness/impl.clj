(ns metabase.interestingness.impl
  "Shared composition machinery and role-independent scorers for the interestingness
   engine.

   Scorer contract: `(fn [field]) -> {:score double, :reason string}`
   - field:  map of field/dimension metadata (kebab-case keys)
   - score:  double in [0.0, 1.0] where 0.0 = uninteresting, 1.0 = very interesting
   - reason: short human-readable explanation

   Score semantics:
     0.0         Hard exclude (e.g. PK, hidden field)
     0.01-0.29   Very low value, likely noise
     0.30-0.49   Below average
     0.50        Neutral / unknown (missing metadata)
     0.51-0.74   Decent, typical useful field
     0.75-1.0    High value for exploration"
  (:require
   [clojure.set :as set]))

(set! *warn-on-reflection* true)

;;; -------------------------------------------------- Shared scorers --------------------------------------------------

(defn type-penalty
  "Hard-zero fields whose data values carry no exploratory meaning regardless of the
   role they're being scored for (dimension or measure):
   - `:type/PK`: opaque row identifiers
   - `:type/Collection` / `:type/Structured`: structured blobs (JSON, XML, arrays,
     dictionaries, text-stored serialized JSON) — not groupable or aggregatable
   - `:type/UpdatedTimestamp` / `:type/DeletionTimestamp`: audit fields that describe
     the record, not the entity"
  [field]
  (let [semantic-type (:semantic-type field)]
    (cond
      (nil? semantic-type)                         {:score 1.0 :reason "no semantic type"}
      (isa? semantic-type :type/PK)                {:score 0.0 :reason "primary key"}
      (isa? semantic-type :type/Collection)        {:score 0.0 :reason "structured blob"}
      (isa? semantic-type :type/Structured)        {:score 0.0 :reason "structured blob"}
      (isa? semantic-type :type/UpdatedTimestamp)  {:score 0.0 :reason "updated timestamp"}
      (isa? semantic-type :type/DeletionTimestamp) {:score 0.0 :reason "deletion timestamp"}
      :else                                        {:score 1.0 :reason "no type penalty"})))

(defn nullness
  "Linear penalty based on null percentage. Mostly-null fields are noise whether being
   used as a dimension (empty bars) or a measure (nothing to aggregate)."
  [field]
  (if-let [nil-pct (get-in field [:fingerprint :global :nil%])]
    {:score  (- 1.0 nil-pct)
     :reason (if (> nil-pct 0.95)
               "mostly null"
               (str (long (* 100 nil-pct)) "% null"))}
    {:score 0.5 :reason "no null data"}))

(defn numeric-variance
  "Score numeric fields by their statistical spread. Zero-variance fields are
   uninteresting regardless of role — nothing to show as a dim (one bucket) or
   as a measure (SUM of a constant)."
  [field]
  (let [num-fp (get-in field [:fingerprint :type :type/Number])]
    (if (nil? num-fp)
      {:score 0.5 :reason "not a numeric field"}
      (let [{:keys [sd q1 q3 avg], mn :min, mx :max} num-fp]
        (cond
          (and (some? sd) (zero? sd))
          {:score 0.0 :reason "zero variance"}

          (and (some? q1) (some? q3) (== q1 q3))
          {:score 0.1 :reason "no interquartile spread"}

          (and (some? sd) (some? avg) (not (zero? avg)))
          (let [cv    (abs (/ sd avg))
                score (min 1.0 (max 0.2 (* 0.5 (+ 1.0 (Math/log (+ 1.0 cv))))))]
            {:score score :reason (str "coefficient of variation: " (double cv))})

          (and (some? q1) (some? q3) (some? mn) (some? mx) (not (== mn mx)))
          (let [iqr   (- q3 q1)
                rng   (- mx mn)
                ratio (/ iqr rng)
                score (min 1.0 (max 0.2 (+ 0.3 (* 0.7 ratio))))]
            {:score score :reason (str "IQR ratio: " (double ratio))})

          :else
          {:score 0.5 :reason "insufficient numeric stats"})))))

(defn- skewness-score
  [skewness]
  (let [abs-sk (abs (double skewness))]
    (cond
      (< abs-sk 0.5) {:score 1.0  :reason (str "symmetric distribution (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 1.0) {:score 0.85 :reason (str "slightly skewed (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 2.0) {:score 0.6  :reason (str "moderately skewed (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 4.0) {:score 0.3  :reason (str "heavily skewed (skewness " (format "%.2f" (double skewness)) ")")}
      :else          {:score 0.15 :reason (str "extremely skewed (skewness " (format "%.2f" (double skewness)) ")")})))

(defn- kurtosis-score
  [kurtosis]
  (let [k (double kurtosis)]
    (cond
      (< -1.0 k 3.0)  {:score 1.0  :reason (str "normal-ish tails (kurtosis " (format "%.2f" k) ")")}
      (< -2.0 k 7.0)  {:score 0.7  :reason (str "moderately heavy tails (kurtosis " (format "%.2f" k) ")")}
      (< -3.0 k 15.0) {:score 0.4  :reason (str "heavy tails / outlier-dominated (kurtosis " (format "%.2f" k) ")")}
      :else           {:score 0.15 :reason (str "extreme tail weight (kurtosis " (format "%.2f" k) ")")})))

(defn- mode-dominance-score
  [mode-fraction]
  (cond
    (>= mode-fraction 0.95) {:score 0.05 :reason (str (long (* 100 mode-fraction)) "% single value (near-constant)")}
    (>= mode-fraction 0.80) {:score 0.2  :reason (str (long (* 100 mode-fraction)) "% single value (heavily dominated)")}
    (>= mode-fraction 0.60) {:score 0.5  :reason (str (long (* 100 mode-fraction)) "% single value")}
    (>= mode-fraction 0.40) {:score 0.75 :reason (str (long (* 100 mode-fraction)) "% single value")}
    :else                   {:score 1.0  :reason (str (long (* 100 mode-fraction)) "% single value (well-distributed)")}))

(defn- top-3-concentration-score
  [top-3-fraction]
  (cond
    (>= top-3-fraction 0.99) {:score 0.1  :reason (str (long (* 100 top-3-fraction)) "% in top 3 (effectively 3 values)")}
    (>= top-3-fraction 0.95) {:score 0.3  :reason (str (long (* 100 top-3-fraction)) "% in top 3")}
    :else                    {:score 1.0  :reason (str (long (* 100 top-3-fraction)) "% in top 3")}))

(defn- zero-dominance-score
  [zero-fraction]
  (cond
    (>= zero-fraction 0.95) {:score 0.05 :reason (str (long (* 100 zero-fraction)) "% zeros (sparse/empty)")}
    (>= zero-fraction 0.80) {:score 0.2  :reason (str (long (* 100 zero-fraction)) "% zeros")}
    (>= zero-fraction 0.60) {:score 0.6  :reason (str (long (* 100 zero-fraction)) "% zeros")}
    :else                   {:score 1.0  :reason (str (long (* 100 zero-fraction)) "% zeros")}))

(defn distribution-shape
  "Score fields by the shape of their value distribution. Penalizes fields where:
   - A single value dominates (high mode-fraction): near-constant, poor for visualization
   - Top-3 values cover nearly everything (few real categories)
   - Zero values dominate (numeric counters / sparse data)
   - Distribution is heavily skewed or has extreme tail weight (kurtosis)

   Works on numeric, text, and temporal fields, and is role-neutral: a flat/skewed
   distribution is boring both as a breakout and as an aggregation target. Returns 0.5
   (neutral) when no distribution data is available. Signals are combined worst-of-N:
   any single strong boringness signal dominates the score."
  [field]
  (let [num-fp    (get-in field [:fingerprint :type :type/Number])
        text-fp   (get-in field [:fingerprint :type :type/Text])
        date-fp   (get-in field [:fingerprint :type :type/DateTime])
        mode-frac (or (:mode-fraction num-fp) (:mode-fraction text-fp) (:mode-fraction date-fp))
        top3      (or (:top-3-fraction num-fp) (:top-3-fraction text-fp) (:top-3-fraction date-fp))
        skewness  (or (:skewness num-fp) (:skewness date-fp))
        kurtosis  (:excess-kurtosis num-fp)
        zero-frac (:zero-fraction num-fp)
        sub-scores (cond-> []
                     (some? mode-frac) (conj (mode-dominance-score mode-frac))
                     (some? top3)      (conj (top-3-concentration-score top3))
                     (some? zero-frac) (conj (zero-dominance-score zero-frac))
                     (some? skewness)  (conj (skewness-score skewness))
                     (some? kurtosis)  (conj (kurtosis-score kurtosis)))]
    (if (empty? sub-scores)
      {:score 0.5 :reason "no distribution data"}
      (let [worst (apply min-key :score sub-scores)]
        {:score  (:score worst)
         :reason (:reason worst)}))))

;;; -------------------------------------------------- Composition --------------------------------------------------

(defn score-field
  "Score a single field using weighted scorers. Returns:
   {:score  double        ;; weighted average in [0.0, 1.0]
    :scores {scorer-fn {:score double, :reason string}}  ;; per-scorer breakdown
    :field  field}        ;; the input field, passed through

   If any scorer with nonzero weight returns exactly 0.0, the final score is clamped
   to at most 0.1. This lets hard signals act as effective gates regardless of what
   other scorers return."
  [scorer-weight-map field]
  (let [total-weight (reduce + 0.0 (vals scorer-weight-map))
        results      (reduce-kv
                      (fn [acc scorer weight]
                        (let [{:keys [score] :as result} (scorer field)]
                          (-> acc
                              (update :weighted-sum + (* weight score))
                              (update :has-hard-zero? #(or % (and (pos? weight) (zero? score))))
                              (assoc-in [:scores scorer] result))))
                      {:weighted-sum 0.0 :scores {} :has-hard-zero? false}
                      scorer-weight-map)
        raw-score    (if (pos? total-weight)
                       (/ (:weighted-sum results) total-weight)
                       0.5)
        final-score  (if (:has-hard-zero? results)
                       (min raw-score 0.1)
                       raw-score)]
    {:score  final-score
     :scores (:scores results)
     :field  field}))

(defn compose
  "Combine multiple scorers with weights into a single scorer function.
   Returns `(fn [field]) -> {:score double, :scores map, :field map}`."
  [scorer-weight-map]
  (fn [field] (score-field scorer-weight-map field)))

(defn apply-cutoff
  "Filter a sequence of scored field results, keeping only those at or above `threshold`."
  [threshold scored-fields]
  (filter #(>= (:score %) threshold) scored-fields))

(defn score-and-filter
  "Score all fields with the given scorer-weight-map and return only those at or above `cutoff`.
   Results are sorted by score descending."
  [scorer-weight-map fields cutoff]
  (->> fields
       (map #(score-field scorer-weight-map %))
       (apply-cutoff cutoff)
       (sort-by :score >)))

;;; -------------------------------------------------- Field Normalization --------------------------------------------------

(def ^:private snake->kebab-keys
  "Keys that need conversion from snake_case (raw DB Field maps) to kebab-case (scorer input)."
  {:semantic_type   :semantic-type
   :base_type       :base-type
   :effective_type  :effective-type
   :visibility_type :visibility-type})

(defn normalize-field
  "Convert a snake_case field map (as used in x-rays/raw DB) to the kebab-case shape scorers expect.
   Keys not in the rename map are passed through unchanged (e.g., :fingerprint)."
  [field]
  (set/rename-keys field snake->kebab-keys))

(defn score-raw-field
  "Score a snake_case field map by normalizing it first. Returns the same shape as `score-field`
   but with the original (unnormalized) field in `:field`."
  [scorer-weight-map field]
  (let [result (score-field scorer-weight-map (normalize-field field))]
    (assoc result :field field)))
