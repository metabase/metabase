(ns metabase.search.query-semantics-stats
  "Result-set statistics for the shared search semantics corpus.

  These compare fixture membership, not ranking or production query frequency."
  (:require
   [clojure.set :as set]
   [metabase.search.query-semantics :as fixtures]))

(def engines
  "The four engines compared in each corpus case."
  [:in-place :appdb-h2 :appdb-postgres :semantic])

(def engine-pairs
  "Ordered pairs; subset and superset counts are relative to the first engine."
  (vec (for [[i left] (map-indexed vector engines)
             right    (subvec engines (inc i))]
         [left right])))

(defn relation
  "Classify how two result sets relate: `:equal`, `:left-superset`, `:left-subset`, or `:incomparable`."
  [left right]
  (cond
    (= left right)             :equal
    (set/superset? left right) :left-superset
    (set/subset? left right)   :left-subset
    :else                      :incomparable))

(defn score
  "Precision, recall, and F1 against a correct result set.

  Both empty sets score 1 on all three measures; a one-sided empty set scores 0."
  [correct hits]
  (let [shared    (count (set/intersection correct hits))
        precision (if (empty? hits) (if (empty? correct) 1 0) (/ shared (count hits)))
        recall    (if (empty? correct) (if (empty? hits) 1 0) (/ shared (count correct)))
        f1        (if (zero? (+ precision recall))
                    0
                    (/ (* 2 precision recall) (+ precision recall)))]
    {:precision precision
     :recall    recall
     :f1        f1}))

(defn scenario-rows
  "One identical-query result row per isolated scenario."
  [cases]
  (for [case cases]
    (assoc (select-keys case [:id :focus :config :query :docs])
           :semantic-arms (get-in case [:expect :semantic])
           :results       (zipmap engines (map #(fixtures/expected-hits case %) engines)))))

(defn translation-rows
  "One result row per adapted-query comparison, with its correct result set."
  [cases]
  (for [case       cases
        comparison (:comparisons case)
        :let [specs (zipmap engines (map #(fixtures/comparison-spec case comparison %) engines))]]
    (assoc (select-keys case [:config :docs])
           :scenario-id (:id case)
           :focus       (:focus comparison)
           :correct     (set (:correct comparison))
           :specs       specs
           :results     (update-vals specs :hits))))

(defn- mean
  ([xs]
   (if (seq xs)
     (/ (reduce + xs) (count xs))
     0))
  ([f xs]
   (mean (map f xs))))

(defn- membership-summary
  [rows]
  (let [results (map :results rows)]
    {:count     (count results)
     :all-equal (count (filter #(apply = (map % engines)) results))
     :mean-hits (zipmap engines (map #(mean (comp count %) results) engines))
     :pairwise  (zipmap engine-pairs
                        (for [[left right] engine-pairs]
                          (merge {:equal 0, :left-superset 0, :left-subset 0, :incomparable 0}
                                 (frequencies (map #(relation (% left) (% right)) results)))))}))

(defn- engine-score-summary
  [rows engine]
  (let [pairs  (map (juxt :correct (comp engine :results)) rows)
        scores (map #(apply score %) pairs)]
    {:precision (mean :precision scores)
     :recall    (mean :recall scores)
     :f1        (mean :f1 scores)
     :exact     (count (filter #(apply = %) pairs))}))

(defn summary
  "Summarize how the engines' results relate, for identical and adapted queries.
  Adapted queries are also scored against their correct results."
  [cases]
  (let [translations (translation-rows cases)]
    {:same-query   (membership-summary (scenario-rows cases))
     :translations (assoc (membership-summary translations)
                          :scores (zipmap engines (map #(engine-score-summary translations %) engines)))}))
