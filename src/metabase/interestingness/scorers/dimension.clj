(ns metabase.interestingness.scorers.dimension
  "Context-independent dimension/field scorers for the interestingness engine.

  Each scorer has the signature: (fn [field context]) -> {:score double, :reason string}
  All v1 scorers ignore the context argument."
  (:require
   [metabase.util.time :as u.time]))

(defn type-penalty
  "Hard-zero fields whose data values carry no exploratory meaning:
   - `:type/PK`: opaque row identifiers
   - `:type/SerializedJSON`: structured blobs, not groupable
   - `:type/UpdatedTimestamp` / `:type/DeletionTimestamp`: audit fields that don't
     describe the entity itself

   **FKs are intentionally NOT penalized**, even though a raw FK integer carries no
   exploratory meaning on its own. The reason is coupling to downstream consumers:
   both the x-ray pipeline and the metrics-viewer substitute the referenced entity's
   label field at display time, so a breakout \"by FK\" shows `user_name`, not
   `user_id`. The FK field thus acts as a gateway to the interesting foreign value.

   If a future consumer renders FK columns as raw IDs without label substitution,
   that consumer should either use a different weight profile that includes an
   explicit FK penalty, or this scorer should be split into smaller per-penalty
   scorers that weight profiles can opt into individually."
  [field _context]
  (let [semantic-type (:semantic-type field)]
    (cond
      (nil? semantic-type)
      {:score 1.0 :reason "no semantic type"}

      (isa? semantic-type :type/PK)
      {:score 0.0 :reason "primary key"}

      (isa? semantic-type :type/SerializedJSON)
      {:score 0.0 :reason "serialized JSON"}

      (isa? semantic-type :type/UpdatedTimestamp)
      {:score 0.0 :reason "updated timestamp"}

      (isa? semantic-type :type/DeletionTimestamp)
      {:score 0.0 :reason "deletion timestamp"}

      :else
      {:score 1.0 :reason "no type penalty"})))

(defn- bucket-count-score
  "Universal quality curve for bucket/group counts. Sweet spot is 10-25 buckets.
   Returns 0.0 for ≤1 (hard-zero gate for constant fields)."
  [n]
  (cond
    (<= n 1)   0.0
    (<= n 2)   0.15
    (<= n 5)   (+ 0.15 (* (/ (- n 2.0) 3.0) 0.25))   ; 2→0.15 .. 5→0.4
    (<= n 10)  (+ 0.4  (* (/ (- n 5.0) 5.0) 0.4))     ; 5→0.4  .. 10→0.8
    (<= n 25)  1.0                                      ; sweet spot
    (<= n 50)  (- 1.0  (* (/ (- n 25.0) 25.0) 0.3))   ; 25→1.0 .. 50→0.7
    (<= n 100) (- 0.7  (* (/ (- n 50.0) 50.0) 0.4))   ; 50→0.7 .. 100→0.3
    :else      (max 0.05 (- 0.3 (* 0.05 (Math/log (/ n 100.0)))))))

(def ^:private temporal-bucket-days
  "Temporal bucketing strategies with approximate days per bucket, coarsest first
   so `reduce` finds the best match efficiently (coarser = fewer buckets, finer
   granularities only win if coarser ones overshoot)."
  [[:year    365.25]
   [:quarter 91.31]
   [:month   30.44]
   [:week    7.0]
   [:day     1.0]
   [:hour    (/ 1.0 24)]
   [:minute  (/ 1.0 1440)]])

(defn- best-temporal-buckets
  "Given a day span, find the granularity whose bucket count scores best."
  [day-span]
  (if (<= day-span 0)
    {:granularity :day :count 1 :score 0.0}
    (reduce (fn [best [gran days-per]]
              (let [n (/ day-span days-per)
                    s (bucket-count-score n)]
                (if (> s (:score best)) {:granularity gran :count n :score s} best)))
            {:granularity :year :count (/ day-span 365.25) :score 0.0}
            temporal-bucket-days)))

(defn cardinality
  "Score based on best achievable bucket/group count for visualization.
   - Temporal fields: evaluates granularities (day/week/month/quarter/year) and picks
     the one that lands closest to the 10-25 bucket sweet spot.
   - Numeric fields with high distinct count and a range: auto-binnable, scores high.
   - All others (categorical, low-cardinality numeric): scores by raw distinct count.
   Returns 0.0 (hard-zero gate) for constant fields (≤1 distinct value)."
  [field _context]
  (let [distinct-count (get-in field [:fingerprint :global :distinct-count])
        temporal-fp    (get-in field [:fingerprint :type :type/DateTime])
        numeric-fp     (get-in field [:fingerprint :type :type/Number])]
    (cond
      ;; No fingerprint data at all
      (nil? distinct-count)
      {:score 0.5 :reason "no cardinality data"}

      ;; Constant field — hard-zero gate
      (<= distinct-count 1)
      {:score 0.0 :reason "constant field"}

      ;; Temporal with range data → pick best granularity
      (and temporal-fp (:earliest temporal-fp) (:latest temporal-fp))
      (let [{:keys [earliest latest]} temporal-fp
            start (u.time/coerce-to-timestamp earliest)
            end   (u.time/coerce-to-timestamp latest)]
        (if (and start end)
          (let [days (u.time/day-diff start end)
                {:keys [granularity count score]} (best-temporal-buckets days)]
            {:score  score
             :reason (str (long days) "-day range, ~" (long count) " " (name granularity) " buckets")})
          {:score 0.5 :reason "unparseable temporal bounds"}))

      ;; Numeric with high cardinality and a nonzero range → auto-binning will produce good buckets
      (and numeric-fp (> distinct-count 50)
           (some? (:min numeric-fp)) (some? (:max numeric-fp))
           (not= (:min numeric-fp) (:max numeric-fp)))
      {:score 0.9 :reason (str distinct-count " distinct values, auto-binnable")}

      ;; Everything else: score by raw distinct count (categoricals, low-cardinality numerics, etc.)
      :else
      {:score  (bucket-count-score distinct-count)
       :reason (str distinct-count " distinct values")})))

(defn nullness
  "Linear penalty based on null percentage. Mostly-null fields are noise."
  [field _context]
  (if-let [nil-pct (get-in field [:fingerprint :global :nil%])]
    {:score  (- 1.0 nil-pct)
     :reason (if (> nil-pct 0.95)
               "mostly null"
               (str (long (* 100 nil-pct)) "% null"))}
    {:score 0.5 :reason "no null data"}))

(defn measure-type-suitability
  "Score how aggregatable a field's type is. Used when scoring a field for the measure role
   (i.e. as an aggregation target like SUM/AVG). Unrelated to the field's dimension suitability.

   - Relation identifiers (PK / FK): 0.05 (hard-kill — SUM(user_id) is meaningless; aggregating
     raw row IDs gives opaque numbers that don't correspond to any real-world measurement)
   - Numeric: fully aggregatable → 1.0
   - Boolean: can COUNT or SUM(0/1) → 0.6
   - Text: only COUNT / COUNT DISTINCT are meaningful → 0.3
   - Temporal: only MIN / MAX apply; rarely used as a measure → 0.2
   - Other: unknown suitability → 0.1"
  [field _context]
  (let [base-type     (or (:effective-type field) (:base-type field))
        semantic-type (:semantic-type field)]
    (cond
      (or (isa? semantic-type :type/PK)
          (isa? semantic-type :type/FK))
      {:score 0.05 :reason "relation identifier (PK/FK) — aggregating row IDs is meaningless"}

      (isa? base-type :type/Number)   {:score 1.0 :reason "numeric (aggregatable)"}
      (isa? base-type :type/Boolean)  {:score 0.6 :reason "boolean (COUNT / SUM of 0-1 values)"}
      (isa? base-type :type/Text)     {:score 0.3 :reason "text (only COUNT-based aggregations)"}
      (isa? base-type :type/Temporal) {:score 0.2 :reason "temporal (only MIN / MAX)"}
      :else                           {:score 0.1 :reason "type not suitable for aggregation"})))

(defn type-bonus
  "Boost fields with semantic types that tend to produce interesting explorations."
  [field _context]
  (let [semantic-type (:semantic-type field)
        base-type     (or (:effective-type field) (:base-type field))]
    (cond
      (isa? semantic-type :type/CreationTimestamp)
      {:score 0.95 :reason "creation timestamp"}

      (or (isa? semantic-type :type/Temporal)
          (isa? base-type :type/Temporal))
      {:score 0.9 :reason "temporal field"}

      (or (isa? semantic-type :type/State)
          (isa? semantic-type :type/Country)
          (isa? semantic-type :type/City))
      {:score 0.85 :reason "geographic field"}

      (isa? semantic-type :type/Category)
      {:score 0.8 :reason "category field"}

      (or (isa? base-type :type/Boolean)
          (isa? semantic-type :type/Boolean))
      {:score 0.7 :reason "boolean field"}

      :else
      {:score 0.5 :reason "no type bonus"})))

(defn numeric-variance
  "Score numeric fields by their statistical spread. Zero-variance fields are uninteresting."
  [field _context]
  (let [num-fp (get-in field [:fingerprint :type :type/Number])]
    (if (nil? num-fp)
      {:score 0.5 :reason "not a numeric field"}
      (let [{:keys [sd q1 q3 avg], mn :min, mx :max} num-fp]
        (cond
          ;; zero standard deviation means constant
          (and (some? sd) (zero? sd))
          {:score 0.0 :reason "zero variance"}

          ;; q1 = q3 means at least 50% of values are identical
          (and (some? q1) (some? q3) (== q1 q3))
          {:score 0.1 :reason "no interquartile spread"}

          ;; compute score from coefficient of variation
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

(defn temporal-range
  "Score temporal fields by their date range span. Wider ranges enable richer time-series exploration."
  [field _context]
  (let [temporal-fp (get-in field [:fingerprint :type :type/DateTime])]
    (if (nil? temporal-fp)
      {:score 0.5 :reason "not a temporal field"}
      (let [{:keys [earliest latest]} temporal-fp]
        (if (or (nil? earliest) (nil? latest))
          {:score 0.5 :reason "missing temporal bounds"}
          (let [start (u.time/coerce-to-timestamp earliest)
                end   (u.time/coerce-to-timestamp latest)]
            (if (or (nil? start) (nil? end))
              {:score 0.5 :reason "unparseable temporal bounds"}
              (let [days (u.time/day-diff start end)]
                (cond
                  (<= days 0)   {:score 0.1  :reason "single-point temporal range"}
                  (< days 7)    {:score 0.4  :reason (str days " day range")}
                  (< days 30)   {:score 0.6  :reason (str days " day range")}
                  (< days 365)  {:score 0.8  :reason (str days " day range")}
                  :else         {:score 0.95 :reason (str days " day range")})))))))))

(defn text-structure
  "Penalize text fields that are structured data (JSON, URLs, email, state codes), mostly
   blank, or free-form long text. These make poor breakout candidates.

   Email / state percentage checks are a safety net for fields the classifier missed:
   normally they get `:type/Email` / `:type/State` semantic types which are handled by
   `type-bonus`, but for borderline or misclassified fields the raw percentages still
   catch them here."
  [field _context]
  (let [text-fp (get-in field [:fingerprint :type :type/Text])]
    (if (nil? text-fp)
      {:score 0.5 :reason "not a text field"}
      (let [{:keys [percent-json percent-url percent-email percent-state average-length blank%]} text-fp]
        (cond
          (and (some? blank%) (> blank% 0.8))
          {:score 0.1 :reason (str (long (* 100 blank%)) "% blank/empty")}

          (and (some? percent-json) (> percent-json 0.9))
          {:score 0.1 :reason (str (long (* 100 percent-json)) "% JSON content")}

          (and (some? percent-url) (> percent-url 0.9))
          {:score 0.15 :reason (str (long (* 100 percent-url)) "% URL content")}

          (and (some? percent-email) (> percent-email 0.9))
          {:score 0.2 :reason (str (long (* 100 percent-email)) "% email content (likely PII, poor breakout)")}

          (and (some? percent-state) (> percent-state 0.9))
          {:score 0.4 :reason (str (long (* 100 percent-state)) "% state codes (a map visualization fits better)")}

          (and (some? average-length) (> average-length 100))
          {:score 0.2 :reason (str "avg length " (long average-length) " chars")}

          (and (some? average-length) (> average-length 50))
          {:score 0.4 :reason (str "avg length " (long average-length) " chars")}

          :else
          {:score 0.8 :reason "short structured text"})))))

(defn- skewness-score
  "Score a numeric field by distribution symmetry. Symmetric distributions score high,
   heavily skewed distributions score low. Uses absolute skewness magnitude."
  [skewness]
  (let [abs-sk (abs (double skewness))]
    (cond
      (< abs-sk 0.5) {:score 1.0  :reason (str "symmetric distribution (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 1.0) {:score 0.85 :reason (str "slightly skewed (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 2.0) {:score 0.6  :reason (str "moderately skewed (skewness " (format "%.2f" (double skewness)) ")")}
      (< abs-sk 4.0) {:score 0.3  :reason (str "heavily skewed (skewness " (format "%.2f" (double skewness)) ")")}
      :else          {:score 0.15 :reason (str "extremely skewed (skewness " (format "%.2f" (double skewness)) ")")})))

(defn- kurtosis-score
  "Score a numeric field by distribution tail weight. Near-normal (excess kurtosis ≈ 0) scores high;
   extreme kurtosis (heavy tails from outliers, or degenerate flat/plateau distributions) scores low."
  [kurtosis]
  (let [k (double kurtosis)]
    (cond
      (< -1.0 k 3.0)  {:score 1.0  :reason (str "normal-ish tails (kurtosis " (format "%.2f" k) ")")}
      (< -2.0 k 7.0)  {:score 0.7  :reason (str "moderately heavy tails (kurtosis " (format "%.2f" k) ")")}
      (< -3.0 k 15.0) {:score 0.4  :reason (str "heavy tails / outlier-dominated (kurtosis " (format "%.2f" k) ")")}
      :else           {:score 0.15 :reason (str "extreme tail weight (kurtosis " (format "%.2f" k) ")")})))

(defn- mode-dominance-score
  "Score a field by how much a single value dominates. High dominance = boring."
  [mode-fraction]
  (cond
    (>= mode-fraction 0.95) {:score 0.05 :reason (str (long (* 100 mode-fraction)) "% single value (near-constant)")}
    (>= mode-fraction 0.80) {:score 0.2  :reason (str (long (* 100 mode-fraction)) "% single value (heavily dominated)")}
    (>= mode-fraction 0.60) {:score 0.5  :reason (str (long (* 100 mode-fraction)) "% single value")}
    (>= mode-fraction 0.40) {:score 0.75 :reason (str (long (* 100 mode-fraction)) "% single value")}
    :else                   {:score 1.0  :reason (str (long (* 100 mode-fraction)) "% single value (well-distributed)")}))

(defn- top-3-concentration-score
  "Score a field by how much the top-3 most common values cover. Very high coverage on a
   field expected to be diverse is boring; moderate coverage is fine."
  [top-3-fraction]
  (cond
    (>= top-3-fraction 0.99) {:score 0.1  :reason (str (long (* 100 top-3-fraction)) "% in top 3 (effectively 3 values)")}
    (>= top-3-fraction 0.95) {:score 0.3  :reason (str (long (* 100 top-3-fraction)) "% in top 3")}
    :else                    {:score 1.0  :reason (str (long (* 100 top-3-fraction)) "% in top 3")}))

(defn- zero-dominance-score
  "Score a numeric field by fraction of exactly-zero values. Mostly-zero columns are boring
   in the same way mode-dominated ones are — counters, sparse metrics."
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

   Works on numeric, text, and temporal fields. Returns 0.5 (neutral) when no distribution
   data is available. Signals are combined worst-of-N: any single strong boringness signal
   dominates the score."
  [field _context]
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
