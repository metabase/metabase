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
  (vec (for [left-index (range (count engines))
             right-index (range (inc left-index) (count engines))]
         [(engines left-index) (engines right-index)])))

(defn relation
  "Classify two result sets. Disjoint nonempty sets are incomparable."
  [left right]
  (cond
    (= left right)             :equal
    (set/superset? left right) :left-superset
    (set/subset? left right)   :left-subset
    :else                     :incomparable))

(defn score
  "Precision, recall, and F1 against one target engine's gold result set.

  Both empty sets score 1 on all three measures; a one-sided empty set scores 0."
  [gold hits]
  (let [shared    (count (set/intersection gold hits))
        precision (if (empty? hits) (if (empty? gold) 1 0) (/ shared (count hits)))
        recall    (if (empty? gold) (if (empty? hits) 1 0) (/ shared (count gold)))
        f1        (if (zero? (+ precision recall))
                    0
                    (/ (* 2 precision recall) (+ precision recall)))]
    {:precision precision
     :recall    recall
     :f1        f1}))

(defn scenario-rows
  "One identical-query result row per isolated scenario."
  [cases]
  (mapv (fn [{:keys [id focus config query docs expect] :as case}]
          {:id            id
           :focus         focus
           :config        config
           :query         query
           :docs          docs
           :semantic-arms (:semantic expect)
           :results       (into {} (map (fn [engine] [engine (fixtures/expected-hits case engine)])) engines)})
        cases))

(defn translation-rows
  "One result row per nested comparison, with the target engine's hits as gold."
  [cases]
  (into []
        (mapcat (fn [{:keys [id config docs comparisons] :as case}]
                  (for [{:keys [focus target] :as comparison} comparisons
                        :let [specs (into {}
                                          (map (fn [engine]
                                                 [engine (fixtures/comparison-spec case comparison engine)]))
                                          engines)]]
                    {:scenario-id id
                     :focus       focus
                     :config      config
                     :docs        docs
                     :target      target
                     :gold        (get-in specs [target :hits])
                     :specs       specs
                     :results     (update-vals specs :hits)})))
        cases))

(defn- mean
  [numbers]
  (if (seq numbers)
    (/ (reduce + numbers) (count numbers))
    0))

(defn- membership-summary
  [rows]
  {:count       (count rows)
   :all-equal   (count (filter (fn [{:keys [results]}]
                                 (apply = (map results engines)))
                               rows))
   :mean-hits   (into {}
                      (map (fn [engine]
                             [engine (mean (map (comp count engine :results) rows))]))
                      engines)
   :pairwise    (into {}
                      (map (fn [[left right :as pair]]
                             [pair (merge {:equal          0
                                           :left-superset  0
                                           :left-subset    0
                                           :incomparable   0}
                                          (frequencies
                                           (map (fn [{:keys [results]}]
                                                  (relation (results left) (results right)))
                                                rows)))]))
                      engine-pairs)})

(defn- engine-score-summary
  [rows engine]
  (let [scores        (map (fn [{:keys [gold results]}] (score gold (results engine))) rows)
        target-groups (vals (group-by :target rows))]
    {:precision   (mean (map :precision scores))
     :recall      (mean (map :recall scores))
     :f1          (mean (map :f1 scores))
     :balanced-f1 (mean (map (fn [group]
                               (mean (map (fn [{:keys [gold results]}]
                                            (:f1 (score gold (results engine))))
                                          group)))
                             target-groups))
     :exact       (count (filter (fn [{:keys [gold results]}]
                                   (= gold (results engine)))
                                 rows))}))

(defn summary
  "Calculate both corpuses' divergence and target-gold fidelity from fixture cases."
  [cases]
  (let [scenarios    (scenario-rows cases)
        translations (translation-rows cases)]
    {:same-query   (membership-summary scenarios)
     :translations (assoc (membership-summary translations)
                          :target-counts (frequencies (map :target translations))
                          :scores (into {}
                                        (map (fn [engine] [engine (engine-score-summary translations engine)]))
                                        engines))}))
