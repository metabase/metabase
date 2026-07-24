(ns metabase.interestingness.impl
  "Shared composition machinery and role-independent scorers for the interestingness
   engine.

   Scorer contract: `(fn [field]) -> double-or-nil`
   - field:  map of field/dimension metadata (kebab-case keys)
   - return: a double in [0.0, 1.0] where 0.0 = uninteresting, 1.0 = very interesting,
             OR nil meaning \"this scorer has no signal for this field\" (e.g. a
             text scorer applied to a numeric field, or any scorer applied to a
             field without a fingerprint). [[score-only]] excludes nil-scoring
             scorers from *both* the numerator and the denominator of the
             weighted average — missing signals neither penalize nor reward the
             field, they simply don't participate. If every scorer returns nil,
             the result falls back to 0.5 (neutral baseline).

   Score semantics:
     nil         No signal (don't participate in the average)
     0.0         Hard exclude (e.g. PK, hidden field)
     0.01-0.29   Very low value, likely noise
     0.30-0.49   Below average
     0.50        Neutral
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
   - numeric `:type/FK`: opaque row references — grouping by one gives a bar per id
     value (the QP refuses to bin `:Relation/*` columns), and aggregating one is
     meaningless. Non-numeric FKs (e.g. a country code referencing a lookup table)
     keep their data meaning and are not penalized.
   - `:type/Collection` / `:type/Structured`: structured blobs (JSON, XML, arrays,
     dictionaries, text-stored serialized JSON) — not groupable or aggregatable
   - `:type/UpdatedTemporal` / `:type/DeletionTemporal`: audit fields that describe
     the record, not the entity (covers Date/Time/Timestamp variants)

   Returns `0.0` (hard-zero gate) for the above, otherwise `nil` (no signal): the
   absence of a penalty isn't a positive signal, it just means this scorer has
   nothing to say about the field."
  [field]
  (let [semantic-type  (:semantic-type field)
        effective-type (or (:effective-type field) (:base-type field))]
    (cond
      (nil? semantic-type)                        nil
      (isa? semantic-type :type/PK)               0.0
      (and (isa? semantic-type :type/FK)
           (isa? effective-type :type/Number))    0.0
      (isa? semantic-type :type/Collection)       0.0
      (isa? semantic-type :type/Structured)       0.0
      (isa? semantic-type :type/UpdatedTemporal)  0.0
      (isa? semantic-type :type/DeletionTemporal) 0.0
      :else                                       nil)))

(defn nullness
  "Linear penalty based on null percentage. Mostly-null fields are noise whether being
   used as a dimension (empty bars) or a measure (nothing to aggregate)."
  [field]
  (when-let [nil-pct (get-in field [:fingerprint :global :nil%])]
    (- 1.0 nil-pct)))

(defn numeric-variance
  "Score numeric fields by their statistical spread. Zero-variance fields are
   uninteresting regardless of role — nothing to show as a dim (one bucket) or
   as a measure (SUM of a constant)."
  [field]
  (let [num-fp (get-in field [:fingerprint :type :type/Number])]
    (when (some? num-fp)
      (let [{:keys [sd q1 q3 avg], mn :min, mx :max} num-fp]
        (cond
          (and (some? sd) (zero? sd))
          0.0

          (and (some? q1) (some? q3) (== q1 q3))
          0.1

          (and (some? sd) (some? avg) (not (zero? avg)))
          (let [cv (abs (/ sd avg))]
            (min 1.0 (max 0.2 (* 0.5 (+ 1.0 (Math/log (+ 1.0 cv)))))))

          (and (some? q1) (some? q3) (some? mn) (some? mx) (not (== mn mx)))
          (let [ratio (/ (- q3 q1) (- mx mn))]
            (min 1.0 (max 0.2 (+ 0.3 (* 0.7 ratio)))))

          :else
          nil)))))

(defn- skewness-score
  [skewness]
  (let [abs-sk (abs (double skewness))]
    (cond
      (< abs-sk 0.5) 1.0
      (< abs-sk 1.0) 0.85
      (< abs-sk 2.0) 0.6
      (< abs-sk 4.0) 0.3
      :else          0.15)))

(defn- kurtosis-score
  [kurtosis]
  (let [k (double kurtosis)]
    (cond
      (< -1.0 k 3.0)  1.0
      (< -2.0 k 7.0)  0.7
      (< -3.0 k 15.0) 0.4
      :else           0.15)))

(defn- mode-dominance-score
  [mode-fraction]
  (cond
    (>= mode-fraction 0.95) 0.05
    (>= mode-fraction 0.80) 0.2
    (>= mode-fraction 0.60) 0.5
    (>= mode-fraction 0.40) 0.75
    :else                   1.0))

(defn- top-3-concentration-score
  [top-3-fraction]
  (cond
    (>= top-3-fraction 0.99) 0.1
    (>= top-3-fraction 0.95) 0.3
    :else                    1.0))

(defn- zero-dominance-score
  [zero-fraction]
  (cond
    (>= zero-fraction 0.95) 0.05
    (>= zero-fraction 0.80) 0.2
    (>= zero-fraction 0.60) 0.6
    :else                   1.0))

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
    ;; worst-of-N: any single strong boringness signal dominates
    (when (seq sub-scores)
      (apply min sub-scores))))

;;; -------------------------------------------------- Composition --------------------------------------------------

(defn score-only
  "Compute a field's weighted interestingness score as a double — the canonical combiner.

   Each scorer in `scorer-weight-map` returns a double in [0.0, 1.0] or nil. Nil-scoring
   scorers are excluded from *both* the numerator and the denominator of the weighted
   average — missing signals neither penalize nor reward the field. If every scorer
   returns nil the result is 0.5 (neutral baseline). If any scorer with nonzero weight
   returns exactly 0.0, the final score is forced to 0.0, letting hard signals act as
   gates regardless of what other scorers return."
  ^double [scorer-weight-map field]
  (loop [pairs        (seq scorer-weight-map)
         weighted-sum 0.0
         total-weight 0.0
         hard-zero?   false]
    (if-let [pair (first pairs)]
      (let [weight (double (val pair))
            score  ((key pair) field)]
        (if (number? score)
          (let [score (double score)]
            (recur (next pairs)
                   (+ weighted-sum (* weight score))
                   (+ total-weight weight)
                   (or hard-zero? (and (pos? weight) (zero? score)))))
          (recur (next pairs) weighted-sum total-weight hard-zero?)))
      (cond
        hard-zero?          0.0
        (pos? total-weight) (/ weighted-sum total-weight)
        :else               0.5))))

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
