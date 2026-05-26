(ns metabase.interestingness.dimension
  "Dimension-role interestingness scoring."
  (:require
   [metabase.interestingness.impl :as impl]
   [metabase.util.time :as u.time])
  (:import
   (java.time LocalDate OffsetDateTime ZoneOffset)
   (java.time.format DateTimeParseException)))

(set! *warn-on-reflection* true)

(defn- bound->epoch-seconds
  "Fast path for parsing a temporal fingerprint bound (`:earliest`/`:latest`) to epoch
   seconds. Handles the two shapes fingerprints actually emit — bare ISO dates
   (`yyyy-MM-dd`) and zoned ISO datetimes (`...Z` / `...+hh:mm`, with optional fractional
   seconds). Returns `nil` for anything else (e.g. zoneless datetimes) so callers can fall
   back to the slower general-purpose [[u.time/coerce-to-timestamp]]."
  ^Long [bound]
  (when (string? bound)
    (try
      (if (and (= (count bound) 10) (= \- (.charAt ^String bound 4)))
        (.toEpochSecond (.atStartOfDay (LocalDate/parse bound) ZoneOffset/UTC))
        (.toEpochSecond (OffsetDateTime/parse bound)))
      (catch DateTimeParseException _ nil))))

(defn temporal-day-span
  "Day span between a temporal field's `:earliest` and `:latest` fingerprint bounds, or
   `nil` when the field isn't temporal, is missing a bound, or has unparseable bounds.

   Computed once and shared between [[cardinality]] and [[temporal-range]] (both need it)
   via [[dimension-interestingness]], which stashes the result under `::day-span`. Uses the
   [[bound->epoch-seconds]] fast path when possible, falling back to the general coercer so
   results are identical to the previous `coerce-to-timestamp` + `day-diff` implementation."
  [field]
  (let [temporal-fp (get-in field [:fingerprint :type :type/DateTime])
        {:keys [earliest latest]} temporal-fp]
    (when (and earliest latest)
      (let [se (bound->epoch-seconds earliest)
            ee (bound->epoch-seconds latest)]
        (if (and se ee)
          (quot (- ee se) 86400)
          ;; fast path missed at least one bound — fall back to the general coercer for both
          (let [start (u.time/coerce-to-timestamp earliest)
                end   (u.time/coerce-to-timestamp latest)]
            (when (and start end)
              (u.time/day-diff start end))))))))

(defn- effective-day-span
  "Day span for `field`, preferring a value precomputed under `::day-span` (see
   [[dimension-interestingness]]) so it is parsed only once per field. Falls back to
   computing it on demand when the field wasn't preprocessed (e.g. scorers called
   standalone in tests or x-rays). `nil` is a legitimate precomputed value (unparseable
   bounds) and is honored rather than recomputed."
  [field]
  (if (contains? field ::day-span)
    (::day-span field)
    (temporal-day-span field)))

(def ^:private near-unique-top-3-fraction
  "Hard-zero threshold for [[cardinality]]: when the three most common values of a text field
   together cover less than this fraction of rows, the field is effectively key-like / free-text
   (nearly every value is distinct) and makes a useless breakout — one group per row. 0.01 ≈ 300+
   evenly-distributed categories, well past the point a grouped chart is readable."
  0.01)

(def ^:private max-breakout-text-length
  "Hard-zero threshold for [[text-structure]]: text whose average length exceeds this many
   characters is free-form prose (descriptions, narratives, comments), not a label, and makes a
   useless breakout. Shorter text keeps the existing soft penalties."
  100)

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
   Returns 0.0 (hard-zero gate) for constant fields (≤1 distinct value) and for near-unique
   text fields (key-like / free-text, where the top 3 values cover < [[near-unique-top-3-fraction]]
   of rows) — grouping by those produces one bucket per row, which is never a useful chart."
  [field]
  (let [distinct-count (get-in field [:fingerprint :global :distinct-count])
        temporal-fp    (get-in field [:fingerprint :type :type/DateTime])
        numeric-fp     (get-in field [:fingerprint :type :type/Number])
        text-top-3     (get-in field [:fingerprint :type :type/Text :top-3-fraction])]
    (cond
      ;; No fingerprint data at all
      (nil? distinct-count)
      nil

      ;; Constant field — hard-zero gate
      (<= distinct-count 1)
      0.0

      ;; Temporal with range data → pick best granularity
      (and temporal-fp (:earliest temporal-fp) (:latest temporal-fp))
      (when-let [days (effective-day-span field)]
        (:score (best-temporal-buckets days)))

      ;; Numeric with high cardinality and a nonzero range → auto-binning will produce good buckets
      (and numeric-fp (> distinct-count 50)
           (some? (:min numeric-fp)) (some? (:max numeric-fp))
           (not= (:min numeric-fp) (:max numeric-fp)))
      0.9

      ;; Near-unique text — hard-zero gate. When the top 3 values cover almost no rows the field is
      ;; effectively key-like / free-text (one group per row), a useless breakout. Scoped to text:
      ;; binnable numerics already returned above, and temporal fields exited at the temporal branch.
      (and (some? text-top-3) (< text-top-3 near-unique-top-3-fraction))
      0.0

      ;; Everything else: score by raw distinct count (categoricals, low-cardinality numerics, etc.)
      :else
      (bucket-count-score distinct-count))))

(def ^:private dimension-bonus-types
  "Semantic types that make especially interesting dimensions."
  [:type/Address
   :type/Birthdate
   :type/CancelationTemporal
   :type/Company
   :type/CreationTimestamp
   :type/Currency
   :type/JoinTemporal
   :type/Owner
   :type/Quantity
   :type/Score
   :type/Share
   :type/Subscription
   :type/Title])

(defn type-bonus
  "Boost fields with semantic types that tend to produce interesting explorations.
   Returns nil (no signal) when the field's semantic type isn't on the bonus list —
   the absence of a bonus isn't a neutral signal, it just means this scorer has
   nothing to say."
  [field]
  (let [semantic-type (:semantic-type field)]
    (when (some #(isa? semantic-type %) dimension-bonus-types)
      1.0)))

(defn temporal-range
  "Score temporal fields by their date range span. Wider ranges enable richer time-series exploration."
  [field]
  (let [temporal-fp (get-in field [:fingerprint :type :type/DateTime])]
    (when (some? temporal-fp)
      (let [{:keys [earliest latest]} temporal-fp]
        (when (and (some? earliest) (some? latest))
          (when-let [days (effective-day-span field)]
            (cond
              (<= days 0)   0.1
              (< days 7)    0.4
              (< days 30)   0.6
              (< days 365)  0.8
              :else         0.95)))))))

(defn text-structure
  "Penalize text fields that are structured data (JSON, URLs, email, state codes), mostly
   blank, or free-form long text. These make poor breakout candidates.

   Email / state percentage checks are a safety net for fields the classifier missed:
   normally they get `:type/Email` / `:type/State` semantic types which are handled by
   `type-bonus`, but for borderline or misclassified fields the raw percentages still
   catch them here."
  [field]
  (let [text-fp (get-in field [:fingerprint :type :type/Text])]
    (when (some? text-fp)
      (let [{:keys [percent-json percent-url percent-email percent-state average-length percent-blank]} text-fp]
        (cond
          (and (some? percent-blank) (> percent-blank 0.8))   0.1
          (and (some? percent-json) (> percent-json 0.9))     0.1
          (and (some? percent-url) (> percent-url 0.9))       0.15
          (and (some? percent-email) (> percent-email 0.9))   0.2
          (and (some? percent-state) (> percent-state 0.9))   0.4
          ;; Free-form long text (descriptions, narratives, comments) — hard-zero gate.
          (and (some? average-length) (> average-length max-breakout-text-length)) 0.0
          (and (some? average-length) (> average-length 50))  0.2
          :else                                               0.8)))))

;;; -------------------------------------------------- Weight profiles --------------------------------------------------

(def canonical-dimension-weights
  "Canonical weight profile for scoring a field as a *dimension* (breakout column).
   Persisted as `dimension_interestingness` on metabase_field. Rewards structural
   cleanliness, good bucket counts, category/temporal types, and balanced distributions."
  {impl/type-penalty       0.30
   cardinality             0.20
   impl/nullness           0.10
   type-bonus              0.10
   temporal-range          0.05
   text-structure          0.05
   impl/distribution-shape 0.15
   impl/numeric-variance   0.05})

(defn dimension-interestingness
  "Return the canonical `dimension_interestingness` score for `field`. Always
   returns a double in [0.0, 1.0].

   Accepts either a raw DB-style field map with snake_case keys or a normalized
   field map with kebab-case keys. Hard-zero gates (e.g. `:type/PK` via
   `type-penalty`) always produce 0.0."
  [field]
  (let [normalized (impl/normalize-field field)
        ;; parse the temporal bounds once; cardinality and temporal-range both read this
        normalized (assoc normalized ::day-span (temporal-day-span normalized))]
    (impl/score-only canonical-dimension-weights normalized)))
