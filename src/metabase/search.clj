(ns metabase.search
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [metabase.models.table :refer [Table]]
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

;;; Model setup

(defn- model-name->class
  [model-name]
  (Class/forName (format "metabase.models.%s.%sInstance" model-name (str/capitalize model-name))))

(defmulti searchable-columns-for-model
  "The columns that will be searched for the query."
  {:arglists '([model])}
  class)

(defmethod searchable-columns-for-model :default
  [_]
  [:name])

(defmethod searchable-columns-for-model (class Table)
  [_]
  [:name
   :display_name])

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
  (apply max
         (for [column (searchable-columns-for-model (model-name->class (:model result)))
               :let [haystack (-> result
                                  (get column)
                                  normalize
                                  tokenize)]]
           (reduce + (score-ratios tokens haystack scoring-fns)))))

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

(s/defn score :- s/Num
  [query :- (s/maybe s/Str), result :- s/Any] ;; TODO. It's a map with result columns + :model
  (if (seq query)
    (score-with [consecutivity-scorer
                 total-occurrences-scorer
                 (weigh-by 1.5 exact-match-scorer)]
                (tokenize (normalize query))
                result)
    0))
