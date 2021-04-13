(ns metabase.search.scoring
  (:require [clojure.core.memoize :as memoize]
            [clojure.string :as str]
            [java-time :as t]
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

(defn- matches?
  [search-token match-token]
  (str/includes? match-token search-token))

(defn- matches-in?
  [search-token match-tokens]
  (some #(matches? search-token %) match-tokens))

(defn- tokens->string
  [tokens abbreviate?]
  (let [->string (partial str/join " ")
        context  search-config/surrounding-match-context]
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

(defn- text-score-with
  [weighted-scorers query-tokens search-result]
  (let [total-weight (reduce + (map :weight weighted-scorers))
        scores       (for [column (search-config/searchable-columns-for-model (search-config/model-name->class (:model search-result)))
                           :let   [matched-text (-> search-result
                                                    (get column)
                                                    (search-config/column->string (:model search-result) column))
                                   match-tokens (some-> matched-text normalize tokenize)
                                   score        (and matched-text
                                                     (reduce (fn [tally f]
                                                               (+ tally
                                                                  (f query-tokens match-tokens)))
                                                             0
                                                             (map :scorer weighted-scorers)))]
                           :when  (and matched-text
                                       (> score 0))]
                       {:text-score          (/ score total-weight)
                        :match               matched-text
                        :match-context-thunk #(match-context query-tokens match-tokens)
                        :column              column
                        :result              search-result})]
    (when (seq scores)
      (apply max-key :text-score scores))))

(defn- consecutivity-scorer
  [query-tokens match-tokens]
  (/ (largest-common-subseq-length
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
  "How much of the *result* is covered by the search query?"
  [query-tokens match-tokens]
  (let [match-token-count (count match-tokens)]
    (if (zero? match-token-count)
      0
      (/ (occurrences query-tokens match-tokens matches-in?)
         match-token-count))))

(def ^:private match-based-scorers
  [{:scorer consecutivity-scorer
    :weight 1}
   {:scorer total-occurrences-scorer
    :weight 1}
   {:scorer fullness-scorer
    :weight 1/2}
   {:scorer exact-match-scorer
    :weight 2}])

(def ^:private model->sort-position
  (into {} (map-indexed (fn [i model]
                          [(str/lower-case (name model)) i])
                        ;; Reverse so that they're in descending order
                        (reverse search-config/searchable-models))))

(defn- model-score
  [{:keys [model]}]
  (/ (or (model->sort-position model) 0)
     (count model->sort-position)))

(defn- text-score-with-match
  [raw-search-string result]
  (if (seq raw-search-string)
    (text-score-with match-based-scorers
                     (tokenize (normalize raw-search-string))
                     result)
    {:text-score          0
     :match               ""
     :result              result}))

(defn- pinned-score
  [{:keys [model collection_position]}]
  ;; We experimented with favoring lower collection positions, but it wasn't good
  ;; So instead, just give a bonus for items that are pinned at all
  (when (#{"card" "dashboard" "pulse"} model)
    (if ((fnil pos? 0) collection_position)
      1
      0)))

(defn- dashboard-count-score
  [{:keys [model dashboardcard_count]}]
  (when (= model "card")
    (min (/ dashboardcard_count
            search-config/dashboard-count-ceiling)
         1)))

(defn- recency-score
  [{:keys [updated_at]}]
  (let [stale-time search-config/stale-time-in-days
        days-ago (if updated_at
                   (t/time-between updated_at
                                   (t/offset-date-time)
                                   :days)
                   stale-time)]
    (/
     (max (- stale-time days-ago) 0)
     stale-time)))

(defn- compare-score-and-result
  "Compare maps of scores and results. Must return -1, 0, or 1. The score is assumed to be a vector, and will be
  compared in order."
  [{score-1 :score} {score-2 :score}]
  (compare score-1 score-2))

(defn- serialize
  "Massage the raw result from the DB and match data into something more useful for the client"
  [{:keys [result column match-context-thunk]} scores]
  (let [{:keys [name display_name
                collection_id collection_name]} result]
    (-> result
        (assoc
         :name           (if (or (= column :name)
                                 (nil? display_name))
                           name
                           display_name)
         :context        (when (and (not (search-config/displayed-columns column))
                                    match-context-thunk)
                           (match-context-thunk))
         :collection     {:id   collection_id
                          :name collection_name}
         :scores          scores)
        (dissoc
         :collection_id
         :collection_name
         :display_name))))

(defn- weights-and-scores
  [{:keys [text-score result]}]
  [{:weight 10
    :score  text-score
    :name   "text"}
   {:weight 2
    :score  (pinned-score result)
    :name   "pinned"}
   {:weight 3/2
    :score  (recency-score result)
    :name   "recency"}
   {:weight 1
    :score  (dashboard-count-score result)
    :name   "dashboard"}
   {:weight 1/2
    :score  (model-score result)
    :name   "model"}])

(defn- weighted-scores
  [hit]
  (->> hit
       weights-and-scores
       (filter :score)
       (map (fn [{:keys [weight score] :as composite-score}]
              (assoc composite-score :weighted-score (* weight score))))))

(defn- accumulate-top-results
  "Accumulator that saves the top n (defined by `search-config/max-filtered-results`) items sent to it"
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
  "Returns a map with the `:score` and `:result`—or nil. The score is a vector of comparable things in priority order."
  [raw-search-string result]
  (when-let [hit (text-score-with-match raw-search-string result)]
    (let [scores (weighted-scores hit)]
      {:score      (/ (reduce + (map :weighted-score scores))
                      (reduce + (map :weight scores)))
       :result     (serialize hit scores)})))

(defn top-results
  "Given a reducible collection (i.e., from `jdbc/reducible-query`) and a transforming function for it, applies the
  transformation and returns a seq of the results sorted by score. The transforming function is expected to output
  maps with `:score` and `:result` keys."
  [reducible-results xf]
  (->> reducible-results
       (transduce xf accumulate-top-results)
       ;; Make it descending: high scores first
       reverse
       (map :result)))
