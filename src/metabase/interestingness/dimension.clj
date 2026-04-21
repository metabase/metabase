(ns metabase.interestingness.dimension
  "Dimension-role interestingness scoring."
  (:require
   [metabase.interestingness.impl :as impl]
   [metabase.util.time :as u.time]))

(set! *warn-on-reflection* true)

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
  [field]
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

(defn type-bonus
  "Boost fields with semantic types that tend to produce interesting explorations."
  [field]
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

(defn temporal-range
  "Score temporal fields by their date range span. Wider ranges enable richer time-series exploration."
  [field]
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
  [field]
  (let [text-fp (get-in field [:fingerprint :type :type/Text])]
    (if (nil? text-fp)
      {:score 0.5 :reason "not a text field"}
      (let [{:keys [percent-json percent-url percent-email percent-state average-length percent-blank]} text-fp]
        (cond
          (and (some? percent-blank) (> percent-blank 0.8))
          {:score 0.1 :reason (str (long (* 100 percent-blank)) "% blank/empty")}

          (and (some? percent-json) (> percent-json 0.9))
          {:score 0.1 :reason (str (long (* 100 percent-json)) "% JSON content")}

          (and (some? percent-url) (> percent-url 0.9))
          {:score 0.15 :reason (str (long (* 100 percent-url)) "% URL content")}

          (and (some? percent-email) (> percent-email 0.9))
          {:score 0.2 :reason (str (long (* 100 percent-email)) "% email content (likely PII, poor breakout)")}

          (and (some? percent-state) (> percent-state 0.9))
          {:score 0.4 :reason (str (long (* 100 percent-state)) "% state codes (a map visualization fits better)")}

          (and (some? average-length) (> average-length 100))
          {:score 0.05 :reason (str "avg length " (long average-length) " chars")}

          (and (some? average-length) (> average-length 50))
          {:score 0.2 :reason (str "avg length " (long average-length) " chars")}

          :else
          {:score 0.8 :reason "short structured text"})))))

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
  "Return the canonical `dimension_interestingness` score for `field`.

   Accepts either a raw DB-style field map with snake_case keys or a normalized
   field map with kebab-case keys. Returns a double in [0.0, 1.0]."
  [field]
  (:score (impl/score-field canonical-dimension-weights
                            (impl/normalize-field field))))
