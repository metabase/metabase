(ns metabase.interestingness.core
  "Composable interestingness scoring engine.

  Scores fields/dimensions on a 0-to-1 scale by combining independent scorer functions
  via weighted average. Callers choose weight profiles and cutoff thresholds.

  Scorer contract: `(fn [field context]) -> {:score double, :reason string}`
  - field:   map of field/dimension metadata (kebab-case keys)
  - context: optional map of situational info (nil treated as {})
  - score:   double in [0.0, 1.0] where 0.0 = uninteresting, 1.0 = very interesting
  - reason:  short human-readable explanation

  Score semantics:
    0.0         Hard exclude (e.g. PK, hidden field)
    0.01-0.29   Very low value, likely noise
    0.30-0.49   Below average
    0.50        Neutral / unknown (missing metadata)
    0.51-0.74   Decent, typical useful field
    0.75-1.0    High value for exploration"
  (:require
   [metabase.interestingness.scorers.dimension :as scorers.dimension]))

;; Planned context keys (not yet implemented):
;;
;; :intent       - keyword or string describing what the caller is looking for
;;                  e.g. :revenue, :temporal, "how many users signed up"
;; :focus-types  - set of semantic types to boost, e.g. #{:type/Currency :type/Price}
;; :prior-fields - set of field IDs the user has already interacted with
;; :source       - keyword identifying the caller, e.g. :xray, :metrics-viewer, :llm-agent

(defn score-field
  "Score a single field using weighted scorers. Returns:
   {:score  double        ;; weighted average in [0.0, 1.0]
    :scores {key {:score double, :reason string}}  ;; per-scorer breakdown
    :field  field}        ;; the input field, passed through"
  ([scorer-weight-map field]
   (score-field scorer-weight-map field nil))
  ([scorer-weight-map field context]
   (let [context       (or context {})
         total-weight  (reduce + 0.0 (vals scorer-weight-map))
         results       (reduce-kv
                        (fn [acc scorer weight]
                          (let [{:keys [score] :as result} (scorer field context)]
                            (-> acc
                                (update :weighted-sum + (* weight score))
                                (assoc-in [:scores scorer] result))))
                        {:weighted-sum 0.0 :scores {}}
                        scorer-weight-map)
         final-score   (if (pos? total-weight)
                         (/ (:weighted-sum results) total-weight)
                         0.5)]
     {:score  final-score
      :scores (:scores results)
      :field  field})))

(defn compose
  "Combine multiple scorers with weights into a single scorer function.
   Returns `(fn [field context]) -> {:score double, :scores map, :field map}`."
  [scorer-weight-map]
  (fn
    ([field] (score-field scorer-weight-map field nil))
    ([field context] (score-field scorer-weight-map field context))))

(defn apply-cutoff
  "Filter a sequence of scored field results, keeping only those at or above `threshold`."
  [threshold scored-fields]
  (filter #(>= (:score %) threshold) scored-fields))

(defn score-and-filter
  "Score all fields with the given scorer-weight-map and return only those at or above `cutoff`.
   Results are sorted by score descending."
  ([scorer-weight-map fields cutoff]
   (score-and-filter scorer-weight-map fields cutoff nil))
  ([scorer-weight-map fields cutoff context]
   (->> fields
        (map #(score-field scorer-weight-map % context))
        (apply-cutoff cutoff)
        (sort-by :score >))))

(def default-dimension-weights
  "Default weight profile for scoring dimensions/fields.
   Emphasizes type-penalty (structural noise) and cardinality (breakout quality)."
  {scorers.dimension/type-penalty      0.30
   scorers.dimension/cardinality       0.20
   scorers.dimension/nullness          0.10
   scorers.dimension/type-bonus        0.15
   scorers.dimension/numeric-variance  0.10
   scorers.dimension/temporal-range    0.10
   scorers.dimension/text-structure    0.05})
