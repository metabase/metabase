(ns metabase.search.scoring
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [metabase.search.config :as search-config]
            [schema.core :as s])
    (:import java.util.PriorityQueue))

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
   ;; Uses O(n*m) space (the lengths of the two lists) with k≤2, so napkin math suggests this gives us caching for at
   ;; least a 31*31 search (or 50*20, etc) which sounds like more than enough. Memory is cheap and the items are
   ;; small, so we may as well skew high.
   ;; As a precaution, the scorer that uses this limits the number of tokens (see the `take` call below)
   :fifo/threshold 2000))

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

(defn- match-context
  "Breaks the matched-text into match/no-match chunks and returns a seq of them in order. Each chunk is a map with keys
  `is_match` (true/false) and `text`"
  [query-tokens match-tokens]
  (->> match-tokens
       (map (fn [match-token]
              {:text match-token
               :is_match (boolean (some #(matches? % match-token) query-tokens))}))
       (partition-by :is_match)
       (map (fn [matches-or-misses-map]
              {:is_match (:is_match (first matches-or-misses-map))
               :text     (str/join " "
                                   (map :text matches-or-misses-map))}))))

(defn- score-with
  [scoring-fns query-tokens search-result]
  (let [scores (for [column (search-config/searchable-columns-for-model (search-config/model-name->class (:model search-result)))
                     :let   [matched-text (-> search-result
                                              (get column)
                                              (search-config/column->string (:model search-result) column))
                             match-tokens (-> matched-text normalize tokenize)
                             score        (reduce + (score-ratios query-tokens
                                                                  match-tokens
                                                                  scoring-fns))]
                     :when  (> score 0)]
                 {:score  score
                  :match  matched-text
                  :match-context (match-context query-tokens match-tokens)
                  :column column})]
    (when (seq scores)
      (apply max-key :score scores))))

(defn- consecutivity-scorer
  [query-tokens match-tokens]
  (largest-common-subseq-length
   matches?
   ;; See comment on largest-common-subseq-length re. its cache. This is a little conservative, but better to under- than over-estimate
   (take 30 query-tokens)
   (take 30 match-tokens)))

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
                        search-config/searchable-models)))

(defn- score-with-match
  [query-string result]
  (when (seq query-string)
    (score-with match-based-scorers
                (tokenize (normalize query-string))
                result)))

(defn- compare-score-and-result
  "Compare [score result] pairs. Must return -1, 0, or 1. The score is assumed to be a vector, and will be compared in
  order."
  [[score-1 _result-1] [score-2 _result-2]]
  (compare score-1 score-2))

(defn- serialize
  "Massage the raw result from the DB into something more useful for the client"
  [{:keys [collection_id collection_name name display_name] :as row} {:keys [score match column match-context] :as hit}]
  (-> row
      (assoc
       :name           (if (or (= column :name) (nil? display_name)) name display_name)
       :matched_column column
       :matched_text   match
       :context        (when-not (#{:name :display_name :collection_name} column) match-context) ;; TODO pull this out somewhere more responsible
       :score          score
       :collection     {:id collection_id :name collection_name})))

(defn accumulate-top-results
  "Accumulator that saves the top n (defined by `search-config/max-filtered-results`) sent to it"
  ([] (PriorityQueue. search-config/max-filtered-results compare-score-and-result))
  ([^PriorityQueue q]
   (loop [acc []]
     (if-let [x (.poll q)]
       (recur (conj acc x))
       acc)))
  ([^PriorityQueue q item]
   (if (>= (.size q) search-config/max-filtered-results)
     (let [smallest (.peek q)]
       (if (pos? (compare-score-and-result item smallest))
         (doto q
           (.poll)
           (.offer item))
         q))
     (doto q
       (.offer item)))))

(defn score-and-result
  "Returns a pair of [score, result] or nil. The score is a vector of comparable things in priority order. The result
  has `:matched_column` and `matched_text` injected in"
  [query-string result]
  (let [hit (score-with-match query-string result)]
    (and hit
         [[(- (:score hit))
           (model->sort-position (:model result))
           (:name result)],
          (serialize result hit)])))
