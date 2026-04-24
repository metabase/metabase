(ns metabase-enterprise.data-complexity-score.metrics.common
  "Shared helpers for the five dimension namespaces.

  Every variable in the score is represented by the same two-shape pair:
    - `scored`  → `{:value v :score s}`  contributes `:score` to the dimension sub-total
    - `value`   → `{:value v}`           descriptive; excluded from the sub-total

  `:value` may be an integer, a float, or nil (for ratios where the denominator is zero — callers
  should treat nil as \"not available\" rather than 0).

  Dimensions wrap a map of variable-name → scored/value maps with a `:sub-total` (sum of present
  `:score`s). Descriptive variables contribute nothing, so adding one to a dimension is safe."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn normalize-name
  "Canonical form used for name-based lookups and comparisons. nil-safe. Duplicated here rather
  than required from `complexity-embedders` so metric namespaces don't transitively pull in
  embedder loading — keep the dep graph shallow."
  [s]
  (some-> s str/trim u/lower-case-en))

(defn scored
  "Build a `{:value v :score s}` variable map. `s = v * weight`."
  [weight v]
  (let [v (or v 0)]
    {:value v :score (* ^long weight ^long v)}))

(defn value
  "Build a `{:value v}` descriptive (non-scored) variable map."
  [v]
  {:value v})

(defn safe-ratio
  "Compute `num/denom` as a double, returning nil when `denom` is zero (rather than NaN/∞).
   Callers should render nil as 'not available' — a ratio with no denominator is meaningless, not
   zero. Both args default to 0 when nil."
  [num denom]
  (let [num   (or num 0)
        denom (or denom 0)]
    (when-not (zero? ^long denom)
      (double (/ num denom)))))

(defn sub-total
  "Sum the `:score` field across the variables in a dimension block (those without `:score`
  contribute nothing)."
  [variables]
  (reduce + 0 (keep (comp :score val) variables)))

(defn dimension-block
  "Assemble a dimension result from an ordered seq of `[variable-key variable-map]` entries.
  Returns `{:variables <map> :sub-total <int>}`."
  [entries]
  (let [variables (into {} entries)]
    {:variables variables
     :sub-total (sub-total variables)}))

(defn repeated-names
  "Count of name occurrences past the first (normalized for comparison). Single pass, no
  intermediate frequency map. `raw-names` may contain nils — they're skipped."
  [raw-names]
  (second
   (reduce (fn [[seen repeats] raw-name]
             (if-let [n (normalize-name raw-name)]
               (if (contains? seen n)
                 [seen (inc repeats)]
                 [(conj seen n) repeats])
               [seen repeats]))
           [#{} 0]
           raw-names)))
