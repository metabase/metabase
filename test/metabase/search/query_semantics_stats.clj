(ns metabase.search.query-semantics-stats
  "Result-set statistics for the shared search semantics corpus.

  These compare fixture membership, not ranking or production query frequency."
  (:require
   [clojure.set :as set]
   [metabase.search.query-semantics :as fixtures]))

(def engines
  "The engines compared in each corpus case.
  Semantic search is scored twice: its vector arm alone, and what it returns once it falls back to app-db."
  [:in-place :appdb-h2 :appdb-postgres :semantic-only :semantic-with-fallback])

(def goal-kinds
  "The kinds of user goal an adapted-query comparison can have, in display order."
  [:or :and :exclusion :title :word-forms :typing])

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

(defn matching-pair-count
  "Count engine pairs with identical result sets in one case."
  [results]
  (count (filter (fn [[left right]] (= (results left) (results right))) engine-pairs)))

(defn conforming-engines
  "Engines whose results equal the correct result set, in engine order."
  [correct results]
  (filterv #(= correct (results %)) engines))

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

(defn- engine-hits
  "Each engine's expected hits for the scenario query."
  [case]
  (zipmap engines (map #(fixtures/expected-hits case %) engines)))

(defn scenario-rows
  "One identical-query result row per isolated scenario."
  [cases]
  (for [case cases]
    (assoc (select-keys case [:id :focus :note :config :query :docs])
           :semantic-arms (get-in case [:expect :semantic])
           :results       (engine-hits case))))

(defn translation-rows
  "One result row per adapted-query comparison, with its scenario query and correct result set.
  Each engine's `:results` are its hits for its own query, and its `:typed` hits are for the scenario query.
  Its `:scores` are both result sets scored against the correct one, as `{:best score, :typed score}`."
  [cases]
  (for [case       cases
        comparison (:comparisons case)
        :let [specs   (zipmap engines (map #(fixtures/comparison-spec case comparison %) engines))
              results (update-vals specs :hits)
              typed   (engine-hits case)
              correct (set (:correct comparison))]]
    (assoc (select-keys case [:config :docs :query])
           :scenario-id   (:id case)
           :scenario-note (:note case)
           :id            (:id comparison)
           :focus         (:focus comparison)
           :note          (:note comparison)
           :kind          (:kind comparison)
           :correct       correct
           :specs         specs
           :results       results
           :typed         typed
           :scores        (zipmap engines (for [engine engines]
                                            {:best  (score correct (results engine))
                                             :typed (score correct (typed engine))})))))

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

(defn- score-summary
  "Mean scores per engine for one of each row's `:scores`, `:best` or `:typed`.
  An F1 of 1 means the engine returned exactly the correct results."
  [rows score-key]
  (zipmap engines (for [engine engines
                        :let [scores (map #(get-in % [:scores engine score-key]) rows)]]
                    {:precision (mean :precision scores)
                     :recall    (mean :recall scores)
                     :f1        (mean :f1 scores)
                     :exact     (count (filter #(= 1 (:f1 %)) scores))})))

(defn summary
  "Summarize how the engines' results relate, for identical and adapted queries.
  Comparisons are scored against their correct results twice: `:scores` for each engine's adapted query, and
  `:typed-scores` for the scenario query as typed."
  [cases]
  (let [translations (translation-rows cases)]
    {:same-query   (membership-summary (scenario-rows cases))
     :translations (assoc (membership-summary translations)
                          :scores       (score-summary translations :best)
                          :typed-scores (score-summary translations :typed))}))
