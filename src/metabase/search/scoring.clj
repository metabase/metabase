(ns metabase.search.scoring
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [metabase.models :refer :all]
            [metabase.search.config :refer :all]
            [schema.core :as s]))

;;; Utility functions

(s/defn normalize :- s/Str
  [query :- s/Str]
  (str/lower-case query))

(s/defn tokenize :- [s/Str]
  "Break a search `query` into its constituent tokens"
  [query :- s/Str]
  (filter seq
          (str/split query #"\s+")))

(def ^:private largest-common-subseq-length
  (memoize/fifo
   (fn
     ([eq xs ys]
      (largest-common-subseq-length eq xs ys 0))
     ([eq xs ys tally]
      (if (or (zero? (count xs))
              (zero? (count ys)))
        tally
        (max
         (if (eq (first xs)
                 (first ys))
           (largest-common-subseq-length eq (rest xs) (rest ys) (inc tally))
           tally)
         (largest-common-subseq-length eq xs (rest ys) 0)
         (largest-common-subseq-length eq (rest xs) ys 0)))))
   ;; Uses O(n*m) space with k < 2, so this gives us caching for at least a 22*22 search (or 50*10, etc) which sounds
   ;; like more than enough. Memory is cheap and the items are small, so we may as well skew high
   :fifo/threshold 1000))

;;; Scoring

(defn- hits->ratio
  [hits total]
  (/ hits total))

(defn- matches?
  [search-term haystack]
  (str/includes? haystack search-term))

(defn- matches-in?
  [term haystack-tokens]
  (some #(matches? term %) haystack-tokens))

(defn- score-ratios
  [search-tokens result-tokens fs]
  (map (fn [f]
         (hits->ratio
          (f search-tokens result-tokens)
          (count search-tokens)))
       fs))

(defn- score-with
  [scoring-fns tokens result]
  (apply max-key :score
         (for [column (searchable-columns-for-model (model-name->class (:model result)))
               :let [target (-> result
                                  (get column)
                                  (column->string (:model result) column))]]
           {:score  (reduce + (score-ratios tokens (-> target normalize tokenize) scoring-fns))
            :match  target
            :column column})))

(def ^:private consecutivity-scorer
  (partial largest-common-subseq-length matches?))

(defn- total-occurrences-scorer
  [tokens haystack]
  (->> tokens
       (map #(if (matches-in? % haystack) 1 0))
       (reduce +)))

(defn- exact-match-scorer
  [tokens haystack]
  (->> tokens
       (map #(if (some (partial = %) haystack) 1 0))
       (reduce +)))

(defn- weigh-by
  [factor scorer]
  (comp (partial * factor) scorer))

(def ^:private match-based-scorers
  [consecutivity-scorer
   total-occurrences-scorer
   (weigh-by 1.5 exact-match-scorer)])

(def ^:private model->sort-position
  (into {} (map-indexed (fn [i model]
                          [(str/lower-case (name model)) i])
                        searchable-models)))

(defn- score-with-match
  [query-string result]
  (if (seq query-string)
    (score-with match-based-scorers
                (tokenize (normalize query-string))
                result)
    {:score 0}))

(defn sort-results
  "Sorts the given results based on internal scoring. Returns them in order, with `:matched_column` and
  `matched_text` injected in"
  [query-string results]
  (let [scores-and-results (for [result results
                                 :let [{:keys [score column match]} (score-with-match query-string result)]]
                             [[(- score)
                               (model->sort-position (:model result))
                               (:name result)]
                              (assoc result
                                     :matched_column column
                                     :matched_text match)])]
    (->> scores-and-results
         (sort-by first)
         (map second))))
