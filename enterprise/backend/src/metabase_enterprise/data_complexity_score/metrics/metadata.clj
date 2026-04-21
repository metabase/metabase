(ns metabase-enterprise.data-complexity-score.metrics.metadata
  "Metadata-coverage dimension — how much curated, human-authored context the agent has to draw
   on. Inverted polarity: higher coverage reduces agent difficulty, so this dimension is NOT
   summed into the aggregate total. It's published alongside as a separate `:coverage` summary
   plus per-variable ratios so consumers can see where a catalog's curation is weak.

   Variables (all ratios in [0,1] except `:description-quality` which is a word-count):
     :description-coverage        fraction of entities with description of ≥ 20 chars
     :field-description-coverage  fraction of fields (flattened) with non-empty description
     :semantic-type-coverage      fraction of fields with semantic_type assigned
     :curated-metric-coverage     fraction of table entities with ≥ 1 named measure
     :embedding-coverage          fraction of distinct names with an embedding (nil at level 1)
     :description-quality         p50 word count over non-empty entity descriptions

  No `:score` on any variable — metadata can't honestly be summed with messiness axes. The
  dimension-level `:coverage` is the mean of the five ratios that are present and non-nil."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.data-complexity-score.metrics.common :as common]))

(set! *warn-on-reflection* true)

(def ^:const ^:private description-min-chars
  "A description needs at least this many characters (after trim) to count as present. Defends
  against one-word placeholder descriptions from gaming the coverage metric."
  20)

(defn- non-empty? [s]
  (and (string? s) (pos? (count (str/trim s)))))

(defn- has-description? [s]
  (and (string? s) (>= (count (str/trim s)) description-min-chars)))

(defn- description-coverage [entities]
  (common/value (common/safe-ratio (count (filter #(has-description? (:description %)) entities))
                                   (count entities))))

(defn- all-fields [entities]
  (mapcat :fields entities))

(defn- field-description-coverage [entities]
  (let [fields (all-fields entities)]
    (common/value (common/safe-ratio (count (filter #(non-empty? (:description %)) fields))
                                     (count fields)))))

(defn- semantic-type-coverage [entities]
  (let [fields (all-fields entities)]
    (common/value (common/safe-ratio (count (filter :semantic-type fields))
                                     (count fields)))))

(defn- curated-metric-coverage
  "Fraction of `:table` entities that have ≥ 1 named Measure. Excludes Cards so
   heavily-metric-Card-based catalogs don't get credit against the table-level denominator."
  [entities]
  (let [tables (filter #(= :table (:kind %)) entities)]
    (common/value (common/safe-ratio (count (filter #(seq (:measure-names %)) tables))
                                     (count tables)))))

(defn- description-quality
  "p50 of word counts over non-empty entity descriptions. Complement to `:description-coverage` —
   without it, 'everyone has a one-word description' gets 100% coverage credit."
  [entities]
  (let [words (->> entities
                   (map :description)
                   (filter non-empty?)
                   (map #(count (str/split (str/trim %) #"\s+"))))]
    (common/value (when (seq words)
                    (let [sorted (vec (sort words))]
                      (nth sorted (quot (count sorted) 2)))))))

(defn- average-coverage
  "Mean of the present, non-nil ratios in `[:description-coverage :field-description-coverage
   :semantic-type-coverage :curated-metric-coverage :embedding-coverage]`. Returns nil if all are
   nil (nothing to average)."
  [variables]
  (let [ratios (->> [:description-coverage :field-description-coverage
                     :semantic-type-coverage :curated-metric-coverage :embedding-coverage]
                    (keep #(get-in variables [% :value])))]
    (when (seq ratios)
      (double (/ (reduce + 0.0 ratios) (count ratios))))))

(defn score
  "Compute the Metadata dimension block.
   `ctx` may contain `:embedding-coverage` — a pre-computed ratio from the semantic dim. At
   level 1 no embedder was invoked so it is nil and the variable reports nil (absent from the
   coverage average)."
  [entities {emb-cov :embedding-coverage}]
  (let [variables {:description-coverage       (description-coverage entities)
                   :field-description-coverage (field-description-coverage entities)
                   :semantic-type-coverage     (semantic-type-coverage entities)
                   :curated-metric-coverage    (curated-metric-coverage entities)
                   :embedding-coverage         (common/value emb-cov)
                   :description-quality        (description-quality entities)}]
    {:variables variables
     :coverage  (average-coverage variables)}))
