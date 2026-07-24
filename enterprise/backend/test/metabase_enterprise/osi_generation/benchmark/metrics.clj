(ns metabase-enterprise.osi-generation.benchmark.metrics
  "Retrieval-quality metric functions for the OSI-generation benchmark — pure over ranked results and
  relevance judgments, so they run in CI with no pgvector, no embedding service and no LLM.

  Vocabulary follows `dev.semantic-search.recall`: a `ranked` list is the tool's rank-ordered
  `:structured-output :data` reduced to distinct entity keys (best first); `judged` is an entity-key ->
  grade map (2 = the answer, 1 = defensible, 0 = wrong/absent — grade-0 pairs are simply omitted).

  Entity keys are `[class entity-local-id]` from `entity-retrieval.core/entity-class`, so a judged key
  and a ranked key collapse the same way dedupe does — the benchmark never compares raw entity_type
  strings.

  Rank metrics are only meaningful for in-domain queries: [[score-query]] computes
  them only when the query judges at least one entity relevant, and [[summarize]] feeds out-of-domain
  queries solely into the weak-flag tallies."
  (:require
   [clojure.string :as str]
   [metabase.entity-retrieval.core :as entity-retrieval]
   [metabase.util :as u])
  (:import
   (java.util Random)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------------- Per-query rank metrics ----------------------------------------

(defn- relevant-keys
  "The entity keys `judged` grades relevant (grade >= 1)."
  [judged]
  (into #{} (keep (fn [[k grade]] (when (<= 1 grade) k))) judged))

(defn hit-at-k
  "1 when any grade>=1 judged entity appears in the first `k` of `ranked`, else 0.
  `judged` is entity-key -> grade; `ranked` is distinct entity-keys best-first. 0 on an empty `judged`."
  [judged ranked k]
  (if (some (relevant-keys judged) (take k ranked)) 1 0))

(defn recall-at-k
  "Fraction of the grade>=1 judged entities that appear in the first `k` of `ranked`.
  0.0 when nothing is judged relevant (an out-of-domain query contributes no recall denominator)."
  [judged ranked k]
  (let [relevant (relevant-keys judged)]
    (if (empty? relevant)
      0.0
      (/ (double (count (filter relevant (take k ranked))))
         (count relevant)))))

(defn reciprocal-rank
  "1/rank of the first grade>=1 judged entity in `ranked` (1-indexed); 0.0 when none is present."
  [judged ranked]
  (let [relevant (relevant-keys judged)]
    (or (first (keep-indexed (fn [i entity-key]
                               (when (relevant entity-key)
                                 (/ 1.0 (inc i))))
                             ranked))
        0.0)))

(defn- log2 ^double [^long x]
  (/ (Math/log (double x)) (Math/log 2.0)))

(defn- dcg
  "Discounted cumulative gain of `grades` in rank order: Σ (2^grade - 1) / log2(rank + 1)."
  ^double [grades]
  (transduce (map-indexed (fn [i grade]
                            (/ (dec (Math/pow 2.0 (double grade)))
                               (log2 (+ i 2)))))
             + 0.0 grades))

(defn ndcg-at-k
  "Graded nDCG@`k`: DCG of `ranked`'s grades (2/1/0) over the ideal DCG of `judged`'s grades.
  1.0 for the ideal ordering; rewards a grade-2 entity above a grade-1 entity at the same rank.
  0.0 when `judged` has no positive grade."
  [judged ranked k]
  (let [gains (map #(get judged % 0) (take k ranked))
        ideal (take k (sort > (vals judged)))
        idcg  (dcg ideal)]
    (if (pos? idcg)
      (/ (dcg gains) idcg)
      0.0)))

;;; ---------------------------------------------- Per-query scoring ----------------------------------------------

(def rank-k
  "The k the per-query recall/nDCG metrics are computed at. Under the tool's 20-entity max, 10 leaves
  the metrics sensitive to ordering without saturating recall on a small corpus."
  10)

(defn- ranked-entity-keys
  "The tool's rank-ordered `:data` reduced to entity keys, best first.
  The tool already dedupes to distinct entities; `distinct` here just keeps the metrics' precondition
  independent of that implementation detail."
  [result]
  (into [] (comp (map #(entity-retrieval/entity-class (:type %) (:id %))) (distinct)) (:data result)))

(defn score-query
  "Score one query's tool `result` against its judgments, returning the per-query metric map:
  `{:id _ :holdout _ :judged-any? _ :weak? _ :top-similarity _}` plus — for in-domain queries only —
  `:hit-at-1 :recall-at-10 :mrr :ndcg-at-10`.
  `query` carries `:id`, `:holdout` and `:judged` (entity-key -> grade, already translated from corpus
  keys); `result` is the tool's `:structured-output` (`{:data [...] :weak_match bool}`), whose `:data`
  is rank-ordered. `:judged-any?` distinguishes in-domain from out-of-domain for the weak-flag tallies
  in [[summarize]]."
  [query result]
  (let [judged      (:judged query)
        ranked      (ranked-entity-keys result)
        judged-any? (boolean (seq (relevant-keys judged)))]
    (cond-> {:id             (:id query)
             :holdout        (boolean (:holdout query))
             :judged-any?    judged-any?
             :weak?          (boolean (:weak_match result))
             :top-similarity (:similarity (first (:data result)))}
      judged-any? (assoc :hit-at-1     (hit-at-k judged ranked 1)
                         :recall-at-10 (recall-at-k judged ranked rank-k)
                         :mrr          (reciprocal-rank judged ranked)
                         :ndcg-at-10   (ndcg-at-k judged ranked rank-k)))))

;;; ------------------------------------------------- Aggregation -------------------------------------------------

(def rank-metrics
  "The per-query rank-metric keys [[summarize]] averages and [[score-query]] emits for in-domain queries."
  [:hit-at-1 :recall-at-10 :mrr :ndcg-at-10])

(defn- mean [xs]
  (when (seq xs)
    (/ (reduce + 0.0 xs) (count xs))))

(defn- rank-column
  "Means of the rank metrics over the in-domain members of `queries`, plus their count as `:n`.
  Metric means are nil at `:n` 0 — an absent column reads as absent, never as a zero score."
  [queries]
  (let [in-domain (filter :judged-any? queries)]
    (into {:n (count in-domain)}
          (map (fn [metric] [metric (mean (keep metric in-domain))]))
          rank-metrics)))

(defn summarize
  "Arm summary over `per-query-metrics`: `:visible` and `:holdout` rank-metric columns (means over
  in-domain queries only, see [[rank-column]]), plus the weak-flag confusion tallies over every query —
  `:weak-flag/true-positive` (out-of-domain queries correctly flagged `:weak?`) and
  `:weak-flag/false-positive` (in-domain queries wrongly flagged), with their denominators."
  [per-query-metrics]
  (let [{holdout true, visible false} (group-by (comp boolean :holdout) per-query-metrics)
        in-domain                     (filter :judged-any? per-query-metrics)
        out-of-domain                 (remove :judged-any? per-query-metrics)]
    {:queries                  (count per-query-metrics)
     :visible                  (rank-column visible)
     :holdout                  (rank-column holdout)
     :weak-flag/true-positive  (count (filter :weak? out-of-domain))
     :weak-flag/false-positive (count (filter :weak? in-domain))
     :weak-flag/out-of-domain  (count out-of-domain)
     :weak-flag/in-domain      (count in-domain)}))

(def ^:private bootstrap-resamples 2000)

(def ^:private bootstrap-seed
  "Fixed PRNG seed so two bootstrap runs over the same per-query vectors report the same interval."
  20260722)

(defn bootstrap-delta
  "Paired bootstrap of `metric`'s per-query difference between two arms — so a two-point nDCG gap on a
  40-query set reads as noise, not a win. Returns `{:delta d :ci-95 [lo hi] :n pairs}`, nil when no
  query carries the metric in both arms.
  `per-query-a` and `per-query-b` are [[score-query]] maps aligned by `:id`; a query missing the metric
  on either side (out-of-domain) is excluded. `:delta` is mean(b) - mean(a) — positive means arm b
  scored higher. Seeded ([[bootstrap-seed]]), so the interval is reproducible."
  [per-query-a per-query-b metric]
  (let [b-by-id (u/index-by :id per-query-b)
        diffs   (into []
                      (keep (fn [qa]
                              (let [va (get qa metric)
                                    vb (get (b-by-id (:id qa)) metric)]
                                (when (and va vb)
                                  (- (double vb) (double va))))))
                      per-query-a)
        n       (count diffs)]
    (when (pos? n)
      (let [rng       (Random. bootstrap-seed)
            resampled (->> (repeatedly bootstrap-resamples
                                       (fn []
                                         (/ (reduce + 0.0 (repeatedly n #(diffs (.nextInt rng n))))
                                            n)))
                           sort
                           vec)
            at        (fn [q] (resampled (min (dec bootstrap-resamples)
                                              (long (Math/floor (* q bootstrap-resamples))))))]
        {:delta (mean diffs)
         :ci-95 [(at 0.025) (at 0.975)]
         :n     n}))))

;;; ---------------------------------------------- Baseline hygiene -----------------------------------------------

(defn normalize-text
  "Case-fold, strip punctuation, collapse whitespace — the normalization
  baseline-does-not-quote-the-queries-test compares under, so a baseline synonym/example that merely
  re-punctuates a query string is still caught."
  [s]
  (some-> s
          u/lower-case-en
          (str/replace #"[^a-z0-9]+" " ")
          str/trim))
