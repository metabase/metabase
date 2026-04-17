(ns metabase.interestingness.scorers.card
  "Generic card-level interestingness scorers. Each scorer takes a normalized card map and
   a context map and returns {:score double, :reason string}. Not tied to any particular
   host pipeline (x-ray, metrics-viewer, adhoc) — callers are responsible for extracting
   their native card structure into the generic shape below.

   Card shape:
   - :dimensions    — vector of field maps used for group-by / breakout (may be empty)
   - :measures      — vector of field maps being aggregated (may be empty for rowcount cards)
   - :aggregation   — aggregation keyword (:count, :sum, :avg, :median, :min, :max, nil)
   - :visualization — viz keyword (:line, :bar, :scatter, :pie, :scalar, :table, nil)

   Each field map is expected to carry its fingerprint at [:fingerprint :type ...]. Scorers
   degrade gracefully (neutral 0.5 or 1.0) when fingerprint data is missing.

   Philosophy: card scorers answer 'will this card be structurally degenerate?' (e.g. flat
   bars, one-slice pie, outlier-dominated breakout). They do NOT answer 'does the data tell
   an interesting story' — that requires bivariate analysis on joined data, not available
   at card-selection time."
  (:require
   [medley.core :as m]))

;;; -------------------------------------------------- Helpers --------------------------------------------------

(defn- numeric-fp  [field] (get-in field [:fingerprint :type :type/Number]))
(defn- text-fp     [field] (get-in field [:fingerprint :type :type/Text]))
(defn- temporal-fp [field] (get-in field [:fingerprint :type :type/DateTime]))
(defn- global-fp   [field] (get-in field [:fingerprint :global]))

(defn- any-mode-fraction
  "Mode-fraction from any type-specific fingerprint that has it."
  [field]
  (or (:mode-fraction (numeric-fp field))
      (:mode-fraction (text-fp field))
      (:mode-fraction (temporal-fp field))))

(defn- worst-result
  "Given a seq of {:score :reason} results, return the one with the lowest score.
   Returns `default` if the seq is empty."
  [results default]
  (if (seq results)
    (apply min-key :score results)
    default))

;;; -------------------------------------------------- Measure degeneracy --------------------------------------------------

(defn- measure-degeneracy
  "Check a single measure field for signals that it's too flat to produce an interesting card.
   Returns 0.0 for signals strong enough that no dim breakdown can save the card — these
   act as hard-zero gates at the card level. Returns a soft penalty for weaker signals."
  [field]
  (let [fp-num     (numeric-fp field)
        field-name (or (:display_name field) (:name field) "measure")
        zf         (:zero-fraction fp-num)
        mf         (:mode-fraction fp-num)
        sd         (:sd fp-num)
        avg        (:avg fp-num)
        cv         (when (and sd avg (not (zero? avg))) (abs (/ (double sd) (double avg))))]
    (cond
      (and zf (>= zf 0.95))
      {:score 0.0 :reason (str field-name " is " (long (* 100 zf)) "% zeros")}

      (and mf (>= mf 0.95))
      {:score 0.0 :reason (str field-name " is " (long (* 100 mf)) "% single value")}

      (and (some? sd) (zero? sd))
      {:score 0.0 :reason (str field-name " has zero standard deviation")}

      (and cv (< cv 0.02))
      {:score 0.15 :reason (str field-name " has near-zero variance (CV " (format "%.3f" cv) ")")}

      :else nil)))

(defn measure-flatness
  "Card-level scorer. Penalize cards where any measure is flat enough that no dimension breakdown
   can produce visible variation. Returns 1.0 when all measures look lively, or the worst-case
   degeneracy score otherwise. Neutral 0.5 for cards without measure fingerprints (e.g. rowcount)."
  [{:keys [measures]} _context]
  (cond
    (empty? measures)
    {:score 0.5 :reason "no measure fingerprints (rowcount or unavailable)"}

    :else
    (worst-result (keep measure-degeneracy measures)
                  {:score 1.0 :reason "measures have meaningful variation"})))

;;; -------------------------------------------------- Dimension degeneracy --------------------------------------------------

(defn- dimension-degeneracy
  "Check a single dimension field for signals that it will collapse the breakout.
   Uses 0.0 (hard-zero gate) for signals strong enough that no measure can make the
   chart interesting; softer penalties for borderline cases."
  [field]
  (let [field-name (or (:display_name field) (:name field) "dimension")
        dc         (:distinct-count (global-fp field))
        mf         (any-mode-fraction field)
        blank%     (:blank% (text-fp field))]
    (cond
      (and dc (<= dc 1))
      {:score 0.0 :reason (str field-name " has only " dc " distinct value(s)")}

      (and mf (>= mf 0.95))
      {:score 0.0 :reason (str field-name " is " (long (* 100 mf)) "% single value")}

      (and blank% (>= blank% 0.8))
      {:score 0.0 :reason (str field-name " is " (long (* 100 blank%)) "% blank/empty")}

      (and mf (>= mf 0.85))
      {:score 0.2 :reason (str field-name " is " (long (* 100 mf)) "% dominated by one value")}

      (and dc (> dc 500))
      {:score 0.3 :reason (str field-name " has " dc " distinct values (too many for breakout)")}

      :else nil)))

(defn dimension-flatness
  "Card-level scorer. Penalize cards whose dimensions produce a degenerate breakout
   (single bar, dominated by one value, mostly blank, or too-crowded)."
  [{:keys [dimensions]} _context]
  (cond
    (empty? dimensions)
    {:score 1.0 :reason "no dimensions (dimensionless card)"}

    :else
    (worst-result (keep dimension-degeneracy dimensions)
                  {:score 1.0 :reason "dimensions are well-distributed"})))

;;; -------------------------------------------------- Pairing risk --------------------------------------------------

(def ^:private aggregations-that-are-outlier-sensitive
  "Aggregations where extreme outliers in the measure dominate the bar height for each category.
   MEDIAN, MIN, MAX, COUNT are less affected."
  #{:sum :avg :cum-sum :cum-count :stddev :distinct})

(defn- pairing-outlier-risk
  "Flag (dim, measure) pairings where a low-cardinality dim combined with a heavy-tailed measure
   will produce charts where one category's bar is pulled up by rare outliers rather than by
   real signal. Only applies to outlier-sensitive aggregations."
  [dim measure aggregation]
  (let [dim-dc   (:distinct-count (global-fp dim))
        measure-k (:excess-kurtosis (numeric-fp measure))
        measure-s (:skewness (numeric-fp measure))
        abs-s    (some-> measure-s double Math/abs)
        outlier-sensitive? (contains? aggregations-that-are-outlier-sensitive aggregation)]
    (when (and outlier-sensitive? dim-dc measure-k
               (<= dim-dc 10)
               (or (> measure-k 10.0)
                   (and abs-s (> abs-s 4.0))))
      {:score 0.35
       :reason (str "low-cardinality dim (" dim-dc ") × outlier-heavy measure "
                    "(kurtosis " (format "%.1f" (double measure-k))
                    (when abs-s (str ", skew " (format "%.1f" (double measure-s))))
                    ") — one bar will be outlier-dominated")})))

(defn outlier-dominated-breakout
  "Card-level scorer. Penalize cards that pair a low-cardinality dim with a heavy-tailed
   measure under an outlier-sensitive aggregation (SUM, AVG). In those cases the chart's
   shape reflects where outliers happen to fall, not real category differences."
  [{:keys [dimensions measures aggregation]} _context]
  (if (or (empty? dimensions) (empty? measures))
    {:score 1.0 :reason "not applicable (missing dim or measure)"}
    (worst-result (for [d dimensions
                        m measures
                        :let [r (pairing-outlier-risk d m aggregation)]
                        :when r]
                    r)
                  {:score 1.0 :reason "no outlier-dominated pairings"})))

;;; -------------------------------------------------- Visualization fit --------------------------------------------------

(def ^:private max-pie-categories 10)

(defn- pie-fit
  "Pie charts need few categories and a balanced distribution."
  [{:keys [dimensions]}]
  (let [dim (first dimensions)
        dc  (:distinct-count (global-fp dim))
        mf  (any-mode-fraction dim)]
    (cond
      (and dc (> dc max-pie-categories))
      {:score 0.2 :reason (str "pie chart with " dc " categories (>" max-pie-categories " is unreadable)")}

      (and mf (>= mf 0.9))
      {:score 0.25 :reason (str "pie chart where one slice is " (long (* 100 mf)) "%")}

      :else nil)))

(defn- scatter-fit
  "Scatter plots need numeric x-axis with meaningful range."
  [{:keys [dimensions]}]
  (let [dim (first dimensions)
        dc  (:distinct-count (global-fp dim))]
    (cond
      (and dc (<= dc 3))
      {:score 0.2 :reason (str "scatter with only " dc " distinct x-values")}

      (and dc (> dc 10000))
      {:score 0.3 :reason (str "scatter with " dc " x-values (too dense)")}

      :else nil)))

(defn- line-fit
  "Line charts want an ordered x-axis (temporal or numeric). Check temporal range sanity.
   Branches are ordered most-severe first so `cond` returns the worst applicable signal."
  [{:keys [dimensions]}]
  (let [temporal-dim (m/find-first temporal-fp dimensions)]
    (when-let [tfp (temporal-fp temporal-dim)]
      (let [hd (:hour-distribution tfp)
            wd (:weekday-distribution tfp)
            mf (:mode-fraction tfp)]
        (cond
          ;; Dumping-ground timestamps (most severe — chart has no real time axis)
          (and mf (>= mf 0.8))
          {:score 0.15 :reason (str "line chart: " (long (* 100 mf)) "% of rows share one timestamp (dumping ground)")}

          ;; All-midnight: it's actually a date field, not a timestamp
          (and hd (>= (first hd) 0.95))
          {:score 0.75 :reason "line chart: timestamps are all at midnight — better as date/weekly breakdown"}

          ;; All one weekday (e.g. Monday): probably a weekly batch job output
          (and wd (some #(>= % 0.95) wd))
          {:score 0.7 :reason "line chart: all rows on one weekday — better as weekly breakdown"}

          :else nil)))))

(defn visualization-fit
  "Card-level scorer. Flag cards whose visualization type doesn't match the data shape
   (pie with too many slices, scatter with too few x-values, line chart on date-only
   timestamps)."
  [{:keys [visualization] :as card} _context]
  (or (case visualization
        :pie     (pie-fit card)
        :scatter (scatter-fit card)
        :line    (line-fit card)
        nil)
      {:score 1.0 :reason "visualization matches data shape"}))
