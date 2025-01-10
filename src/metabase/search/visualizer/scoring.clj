(ns metabase.search.visualizer.scoring
  "Computes a relevancy score for search results using the weighted average of various scorers. Scores are determined by
  various ways of comparing the text of the search string and the item's title or description, as well as by
  Metabase-specific features such as how many dashboards a card appears in or whether an item is pinned.

  Get the score for a result with `score-and-result`, and efficiently get the most relevant results with
  `top-results`.

  Some of the scorers can be tweaked with configuration in [[metabase.search.config]]."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.search.config :as search.config]
   [metabase.search.in-place.util :as search.util]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(defn- matches?
  [search-token match-token]
  (str/includes? match-token search-token))

(defn- matches-in?
  [search-token match-tokens]
  (some #(matches? search-token %) match-tokens))

(defn- tokens->string
  [tokens abbreviate?]
  (let [->string (partial str/join " ")
        context  search.config/surrounding-match-context]
    (if (or (not abbreviate?)
            (<= (count tokens) (* 2 context)))
      (->string tokens)
      (str
       (->string (take context tokens))
       "…"
       (->string (take-last context tokens))))))

(defn- match-context
  "Breaks the matched-text into match/no-match chunks and returns a seq of them in order. Each chunk is a map with keys
  `is_match` (true/false) and `text`"
  [query-tokens match-tokens]
  (->> match-tokens
       (map (fn [match-token]
              {:text match-token
               :is_match (boolean (some #(matches? % match-token) query-tokens))}))
       (partition-by :is_match)
       (map (fn [matches-or-misses-maps]
              (let [is-match    (:is_match (first matches-or-misses-maps))
                    text-tokens (map :text matches-or-misses-maps)]
                {:is_match is-match
                 :text     (tokens->string text-tokens (not is-match))})))))

(defn- text-scores-with
  "Scores a search result. Returns a vector of score maps, each containing `:weight`, `:score`, and other info about
  the text match, if there is one. If there is no match, the score is 0."
  [search-native-query weighted-scorers query-tokens search-result]
  ;; TODO is pmap over search-result worth it?
  (let [scores (for [column (let [search-columns-fn (requiring-resolve 'metabase.search.visualizer.core/searchable-columns)]
                              (search-columns-fn (:model search-result) search-native-query))
                     {:keys [scorer name weight]
                      :as   _ws} weighted-scorers
                     :let [matched-text (-> search-result
                                            (get column)
                                            (search.config/column->string (:model search-result) column))
                           match-tokens (some-> matched-text search.util/normalize search.util/tokenize)
                           raw-score    (scorer query-tokens match-tokens)]
                     :when (and matched-text (pos? raw-score))]
                 {:score               raw-score
                  :name                (str "text-" name)
                  :weight              weight
                  :match               matched-text
                  :match-context-thunk #(match-context query-tokens match-tokens)
                  :column              column})]
    (if (seq scores)
      (vec scores)
      [{:score 0 :weight 0}])))

(defn- consecutivity-scorer
  [query-tokens match-tokens]
  (/ (search.util/largest-common-subseq-length
      matches?
      ;; See comment on largest-common-subseq-length re. its cache. This is a little conservative, but better to under- than over-estimate
      (take 30 query-tokens)
      (take 30 match-tokens))
     (count query-tokens)))

(defn- occurrences
  [query-tokens match-tokens token-matches?]
  (reduce (fn [tally token]
            (if (token-matches? token match-tokens)
              (inc tally)
              tally))
          0
          query-tokens))

(defn- total-occurrences-scorer
  "How many search tokens show up in the result?"
  [query-tokens match-tokens]
  (/ (occurrences query-tokens match-tokens matches-in?)
     (count query-tokens)))

(defn- exact-match-scorer
  "How many search tokens are exact matches (perfect string match, not `includes?`) in the result?"
  [query-tokens match-tokens]
  (/ (occurrences query-tokens match-tokens #(some (partial = %1) %2))
     (count query-tokens)))

(defn fullness-scorer
  "How much of the result is covered by the search query?"
  [query-tokens match-tokens]
  (let [match-token-count (count match-tokens)]
    (if (zero? match-token-count)
      0
      (/ (occurrences query-tokens match-tokens matches-in?)
         match-token-count))))

(defn- prefix-counter
  [query-string item-string]
  (reduce
   (fn [cnt [a b]]
     (if (= a b) (inc cnt) (reduced cnt)))
   0
   (map vector query-string item-string)))

(defn- count-token-chars
  "Tokens is a seq of strings, like [\"abc\" \"def\"]"
  [tokens]
  (reduce
   (fn [cnt x] (+ cnt (count x)))
   0
   tokens))

(defn prefix-scorer
  "How much does the search query match the beginning of the result? "
  [query-tokens match-tokens]
  (let [query (u/lower-case-en (str/join " " query-tokens))
        match (u/lower-case-en (str/join " " match-tokens))]
    (/ (prefix-counter query match)
       (count-token-chars query-tokens))))

(def ^:private match-based-scorers
  [{:scorer exact-match-scorer :name "exact-match" :weight 4}
   {:scorer consecutivity-scorer :name "consecutivity" :weight 2}
   {:scorer total-occurrences-scorer :name "total-occurrences" :weight 2}
   {:scorer fullness-scorer :name "fullness" :weight 1}
   {:scorer prefix-scorer :name "prefix" :weight 1}])

(def ^:private model-weights
  {"metric"  15
   "dataset" 10
   "card"    5})

(defn- model-score
  [{:keys [model]}]
  (get model-weights model))

(defn- text-scores-with-match
  [result {:keys [search-string search-native-query]}]
  (if (seq search-string)
    (text-scores-with search-native-query
                      match-based-scorers
                      (search.util/tokenize (search.util/normalize search-string))
                      result)
    [{:score 0 :weight 0}]))

(defn- recency-score
  [{:keys [updated_at]}]
  (let [stale-time search.config/stale-time-in-days
        days-ago (if updated_at
                   (t/time-between updated_at
                                   (t/offset-date-time)
                                   :days)
                   stale-time)]
    (/
     (max (- stale-time days-ago) 0)
     stale-time)))

(defn- col-is-temporal?
  [{:keys [base_type effective_type semantic_type]}]
  (some #(isa? (keyword %) :type/Temporal) [base_type effective_type semantic_type]))

(defn- col-is-categorical?
  [{:keys [base_type effective_type semantic_type]}]
  (some #(isa? (keyword %) :type/Category) [base_type effective_type semantic_type]))

(defn- single-column-scalar-score
  [{:keys [fingerprint base_type effective_type semantic_type]}]
  (cond-> 0
    (= (-> fingerprint :global :distinct-count) 1)                                   inc
    (some #(isa? (keyword %) :type/Number) [base_type effective_type semantic_type]) inc))

(defn- scalar-score
  [{:keys [result_metadata]}]
  (let [result-metadata (json/decode result_metadata keyword)
        col-scores      (mapv  single-column-scalar-score result-metadata)
        max-col-score   (apply max col-scores)]
    (if (and (> max-col-score 0)
             (= (count result-metadata) 1))
      (inc max-col-score)
      max-col-score)))

;; primary score concerns first:

;; - compatibility, as strongly sorted by:
;; - official
;; - pre-aggregated
;; - pre-aggregated-model > metric > dataset > question

;; should we consider time granularity in the scoring?
;; order of magnitude matters
;; also consider the :unit property, series with the same unit are scored higher

(defn- timeseries-score
  [{:keys [result_metadata]}]
  (let [result-metadata (json/decode result_metadata keyword)
        timeseries?     (some col-is-temporal? result-metadata)]
    (cond
      timeseries? 2
      :else       0)))

(defn- categorical-score
  [{:keys [result_metadata]}]
  (let [result-metadata (json/decode result_metadata keyword)
        timeseries?     (some col-is-categorical? result-metadata)]
    (cond
      timeseries? 2
      :else       0)))

(defn- column-similarity-score
  [{:keys [result_metadata]} col-types]
  (let [result-metadata (json/decode result_metadata keyword)
        result-types (into #{} (mapcat (fn [col]
                                         (vals (select-keys col [:base_type :effective_type :semantic_type])))
                                       result-metadata))
        overlap     (set/intersection result-types col-types)]
    (cond
      overlap (count overlap)
      :else    0)))

(defn compatibility-weights-and-scores
  "Default weights and scores for a given result."
  [result {:keys [compatibility]}]
  (let [{:keys [column-types]} compatibility]
    [{:weight 5
      :score  (if (some #(isa? % :type/Number) column-types)
                (scalar-score result)
                0)
      :name   "scalar-compatibility"}

     {:weight 7
      :score  (if (some #(isa? % :type/Temporal) column-types)
                (timeseries-score result)
                0)
      :name   "timeseries-compatibility"}

     {:weight 6
      :score  (if (some #(isa? % :type/Category) column-types)
                (categorical-score result)
                0)
      :name   "categorical-compatibility"}

     {:weight 1
      :score  (column-similarity-score result column-types)
      :name   "column-similarity-compatibility"}]))

;; these 2 are enterprise only, so to take this out of prototype land,
;; they must be only used in enterprise scenarios.

(defn- official-collection-score
  "A scorer for items in official collections"
  [{:keys [collection_authority_level]}]
  (if (contains? #{"official"} collection_authority_level)
    1
    0))

(defn- verified-score
  "A scorer for verified items."
  [{:keys [moderated_status]}]
  (if (contains? #{"verified"} moderated_status)
    1
    0))

(defn weights-and-scores
  "Default weights and scores for a given result."
  [result]
  [{:weight 3 :score (recency-score result) :name "recency"}
   {:weight 1 :score (model-score result) :name "model"}
   {:weight 8 :score (official-collection-score result) :name "official"}
   {:weight 10 :score (verified-score result) :name "verified"}])

(defn score-result
  "Score a result, returning a collection of maps with score and weight. Should not include the text scoring, done
  separately. Should return a sequence of maps with

    {:weight number,
     :score  number,
     :name   string}"
  [result reqs]
  (into
   (weights-and-scores result)
   (compatibility-weights-and-scores result reqs)))

(defn- sum-weights [weights]
  (reduce
   (fn [acc {:keys [weight] :or {weight 0}}]
     (+ acc weight))
   0
   weights))

(defn- compute-normalized-score [scores]
  (let [weight-sum (sum-weights scores)]
    (if (zero? weight-sum)
      0
      (let [score-sum (reduce
                       (fn [acc {:keys [weight score]
                                 :or {weight 0 score 0}}]
                         (+ acc (* score weight)))
                       0
                       scores)]
        (/ score-sum weight-sum)))))

(defn force-weight
  "Reweight `scores` such that the sum of their weights equals `total`, and their proportions do not change."
  [scores total]
  (let [total-weight (sum-weights scores)
        weight-calc-fn (if (contains? #{nil 0} total-weight)
                         (fn weight-calc-fn [_] 0)
                         (fn weight-calc-fn [weight] (* total (/ weight total-weight))))]
    (mapv #(update % :weight weight-calc-fn) scores)))

(def ^:const text-scores-weight
  "This is used to control the total weight of text-based scorers in [[score-and-result]]"
  10)

(defn score-and-result
  "Returns a map with the normalized, combined score from relevant-scores as `:score` and `:result`."
  [result {:keys [search-string search-native-query] :as search-ctx}]
  (let [text-matches         (-> (text-scores-with-match result {:search-string       search-string
                                                                 :search-native-query search-native-query})
                                 (force-weight text-scores-weight))
        has-text-match?      (some (comp pos? :score) text-matches)
        compatibility-scores (compatibility-weights-and-scores result search-ctx)
        all-scores           (into (into (vec (weights-and-scores result)) compatibility-scores) text-matches)
        relevant-scores      (remove (comp zero? :score) all-scores)
        total-score          (compute-normalized-score all-scores)]
    ;; Searches with a blank search string mean "show me everything, ranked";
    ;; see https://github.com/metabase/metabase/pull/15604 for archived search.
    ;; If the search string is non-blank, results with no text match have a score of zero.
    (when (or has-text-match? (str/blank? search-string))
      {:score  total-score
       :result (assoc result
                      :compatible (some #(> (:score %) 0) compatibility-scores)
                      :the-scores relevant-scores
                      :all-scores all-scores
                      :relevant-scores relevant-scores)})))

(defn compare-score
  "Compare maps of scores and results. Must return -1, 0, or 1. The score is assumed to be a vector, and will be
  compared in order."
  [{score-1 :score} {score-2 :score}]
  (compare score-1 score-2))

(defn top-results
  "Given a reducible collection (i.e., from `jdbc/reducible-query`) and a transforming function for it, applies the
  transformation and returns a seq of the results sorted by score. The transforming function is expected to output
  maps with `:score` and `:result` keys."
  [reducible-results max-results xf]
  (->> reducible-results
       (transduce xf (u/sorted-take max-results compare-score))
       rseq
       (map :result)))
