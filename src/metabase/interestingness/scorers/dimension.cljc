(ns metabase.interestingness.scorers.dimension
  "Context-independent dimension/field scorers for the interestingness engine.

  Each scorer has the signature: (fn [field context]) -> {:score double, :reason string}
  All v1 scorers ignore the context argument."
  (:require
   [metabase.util.time :as u.time]))

(defn- log
  "Cross-platform natural logarithm."
  [x]
  #?(:clj  (Math/log x)
     :cljs (js/Math.log x)))

(defn type-penalty
  "Penalize fields that are structurally uninteresting for exploration.
   PKs, FKs, serialized JSON, and audit timestamps score 0.0."
  [field _context]
  (let [semantic-type (:semantic-type field)]
    (cond
      (nil? semantic-type)
      {:score 1.0 :reason "no semantic type"}

      (isa? semantic-type :type/PK)
      {:score 0.0 :reason "primary key"}

      (isa? semantic-type :type/FK)
      {:score 0.0 :reason "foreign key"}

      (isa? semantic-type :type/SerializedJSON)
      {:score 0.0 :reason "serialized JSON"}

      (isa? semantic-type :type/UpdatedTimestamp)
      {:score 0.0 :reason "updated timestamp"}

      (isa? semantic-type :type/DeletionTimestamp)
      {:score 0.0 :reason "deletion timestamp"}

      :else
      {:score 1.0 :reason "no type penalty"})))

(defn- cardinality-score
  "Sweet-spot curve for distinct count. Peaks around 2-100, decays for very high counts."
  [distinct-count]
  (cond
    (<= distinct-count 1)   0.0
    (<= distinct-count 100) (- 1.0 (/ 0.1 distinct-count))  ; approaches 1.0 quickly, e.g. 2->0.95, 10->0.99
    (<= distinct-count 1000) (- 0.9 (* 0.5 (/ (log (/ distinct-count 100.0))
                                              (log 10.0))))  ; 100->0.9, 1000->0.4
    :else (max 0.1 (- 0.4 (* 0.1 (/ (log (/ distinct-count 1000.0))
                                    (log 10.0)))))))  ; slow decay below 0.4

(defn cardinality
  "Score based on distinct value count. Fields with too few (constant) or too many
   (effectively unique) distinct values are poor breakout candidates."
  [field _context]
  (if-let [distinct-count (get-in field [:fingerprint :global :distinct-count])]
    {:score  (cardinality-score distinct-count)
     :reason (str distinct-count " distinct values")}
    {:score 0.5 :reason "no cardinality data"}))

(defn nullness
  "Linear penalty based on null percentage. Mostly-null fields are noise."
  [field _context]
  (if-let [nil-pct (get-in field [:fingerprint :global :nil%])]
    {:score  (- 1.0 nil-pct)
     :reason (if (> nil-pct 0.95)
               "mostly null"
               (str (long (* 100 nil-pct)) "% null"))}
    {:score 0.5 :reason "no null data"}))

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
                score (min 1.0 (max 0.2 (* 0.5 (+ 1.0 (log (+ 1.0 cv))))))]
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
  "Penalize text fields that are structured data (JSON, URLs) or free-form long text.
   These make poor breakout candidates."
  [field _context]
  (let [text-fp (get-in field [:fingerprint :type :type/Text])]
    (if (nil? text-fp)
      {:score 0.5 :reason "not a text field"}
      (let [{:keys [percent-json percent-url average-length]} text-fp]
        (cond
          (and (some? percent-json) (> percent-json 0.9))
          {:score 0.1 :reason (str (long (* 100 percent-json)) "% JSON content")}

          (and (some? percent-url) (> percent-url 0.9))
          {:score 0.15 :reason (str (long (* 100 percent-url)) "% URL content")}

          (and (some? average-length) (> average-length 100))
          {:score 0.2 :reason (str "avg length " (long average-length) " chars")}

          (and (some? average-length) (> average-length 50))
          {:score 0.4 :reason (str "avg length " (long average-length) " chars")}

          :else
          {:score 0.8 :reason "short structured text"})))))
