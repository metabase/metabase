(ns metabase.interestingness.measure
  "Measure-role interestingness scoring.

  Combines measure-specific scorers (`measure-type-suitability`) with role-neutral
  scorers from `impl` (nullness, numeric-variance, distribution-shape, type-penalty)
  under a measure-specific weight profile.

  The public `measure-interestingness` function is re-exported by
  `metabase.interestingness.core`. Not currently persisted on metabase_field —
  available for consumers that want to rank fields by measure-role suitability."
  (:require
   [metabase.interestingness.impl :as impl]))

(defn measure-type-suitability
  "Score how aggregatable a field's type is when used as an aggregation target
   (SUM/AVG/COUNT DISTINCT etc.).

   - Primary keys: 0.05 — one PK per row within a table, so aggregating is meaningless
   - Foreign keys: 0.5 — SUM/AVG are nonsense, but COUNT DISTINCT is a common and
     meaningful aggregation (e.g. \"how many unique users placed an order\")
   - Numeric: 1.0 — fully aggregatable
   - Boolean: 0.6 — COUNT or SUM(0/1)
   - Text: 0.3 — only COUNT / COUNT DISTINCT are meaningful
   - Temporal: 0.2 — only MIN / MAX apply; rarely used as a measure
   - Other: 0.1 — unknown suitability"
  [field]
  (let [base-type     (or (:effective-type field) (:base-type field))
        semantic-type (:semantic-type field)]
    (cond
      (isa? semantic-type :type/PK)
      {:score 0.05 :reason "primary key — one per row, aggregating is meaningless"}

      (isa? semantic-type :type/FK)
      {:score 0.5 :reason "foreign key — SUM/AVG are meaningless, but COUNT DISTINCT is useful"}

      (isa? base-type :type/Number)   {:score 1.0 :reason "numeric (aggregatable)"}
      (isa? base-type :type/Boolean)  {:score 0.6 :reason "boolean (COUNT / SUM of 0-1 values)"}
      (isa? base-type :type/Text)     {:score 0.3 :reason "text (only COUNT-based aggregations)"}
      (isa? base-type :type/Temporal) {:score 0.2 :reason "temporal (only MIN / MAX)"}
      :else                           {:score 0.1 :reason "type not suitable for aggregation"})))

(def canonical-measure-weights
  "Canonical weight profile for scoring a field as a *measure* (aggregation target).
   Rewards numeric/aggregatable types, meaningful variance, and distributions that
   won't be outlier-dominated. Drops breakout-oriented signals (cardinality,
   geographic/category type-bonus, temporal-range, text-structure) since those
   answer the wrong question for measures."
  {impl/type-penalty        0.25
   measure-type-suitability 0.25
   impl/numeric-variance    0.20
   impl/distribution-shape  0.15
   impl/nullness            0.15})

(defn measure-interestingness
  "Return the canonical measure-interestingness score for `field`.

   Accepts either a raw DB-style field map with snake_case keys or a normalized
   field map with kebab-case keys. Returns a double in [0.0, 1.0]."
  [field]
  (:score (impl/score-field canonical-measure-weights
                            (impl/normalize-field field))))
