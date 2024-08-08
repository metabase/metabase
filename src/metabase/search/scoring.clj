;; # How does search scoring work?
;;
;; _This was written for a success engineer, but may be helpful here, too._
;;
;; Most of what you care about happens in the `scoring.clj` file [here](https://github.com/metabase/metabase/blob/master/src/metabase/search/scoring.clj).
;;
;; We have two sets of scorers. The first is based on the literal text matches and defined [here](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/scoring.clj#L132C1-L137):
;;
;; <pre><code>
;; (def ^:private match-based-scorers
;;   [{:scorer exact-match-scorer :name "exact-match" :weight 4}
;;    {:scorer consecutivity-scorer :name "consecutivity" :weight 2}
;;    {:scorer total-occurrences-scorer :name "total-occurrences" :weight 2}
;;    {:scorer fullness-scorer :name "fullness" :weight 1}
;;    {:scorer prefix-scorer :name "prefix" :weight 1}])
;; </code></pre>
;;
;; * The `exact-match-scorer` gives points for exact matches. So if you search `foo` it'll score well for `foo
;;   collection` but not `my favorite foods`. Everything else counts partial matches
;;
;; * `consecutivity-scorer` gives points for a sequence of matching words. So if you search `four five six seven`
;;   it'll score well for `one two three four five six seven eight` and 0 for `eight seven six five four three two
;;   one`.
;;
;; * `total-occurrences-scorer` gives points for the number of tokens that show up in the search result. So if you
;;   search for `foo bar` it'll score better for `Admiral Akbar's Food Truck` (2; note that `akbar` and `food` count
;;   as matches even though it's not exact) than for `foo collection` (1; being an exact match doesn't matter. That's
;;   why we have the `exact-match-scorer`).
;;
;; * `fullness-scorer` is sort of the opposite of that: it gives points for how much of the result is "covered" by the
;;   search query. So if you search `foo bar` then `Barry's Food` will have a perfect fullness score and `Barry's
;;   Dashboard Of Favorite Bars, Restaurants, and Food Trucks` will score poorly since only 3/9 of the dashboard's
;;   title is covered by the search query. Why 3? `bar` matches both `Barry's` and `Bars`.
;;
;; * `prefix-scorer` gives points for an exact prefix match. So if you search for `foo bar` then `foo collection` will
;;   have a good prefix score (4/24: `foo ` matches), `Food trucks I love` will have a worse one (3/18), and
;;   `top 10 foo bars` will be zero.
;;
;;
;; These are all weighted: you can see that the exact-match scorer is responsible for 4/10 of the score, the consecutivity one is 2/10, etc.
;;
;; The second set of scorers is defined lower down,
;; [here](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/scoring.clj#L215-L222):
;;
;; <pre><code>
;; (defn weights-and-scores
;;   "Default weights and scores for a given result."
;;   [result]
;;   [{:weight 2 :score (pinned-score result) :name "pinned"}
;;    {:weight 2 :score (bookmarked-score result) :name "bookmarked"}
;;    {:weight 3/2 :score (recency-score result) :name "recency"}
;;    {:weight 1 :score (dashboard-count-score result) :name "dashboard"}
;;    {:weight 1/2 :score (model-score result) :name "model"}])
;; </code></pre>
;;
;; And there are two more for Enterprise
;; [here](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/enterprise/backend/src/metabase_enterprise/search/scoring.clj#L27-L33):
;;
;; <pre><code>
;; (premium-features/has-feature? :official-collections)
;;     (conj {:weight 2
;;             :score  (official-collection-score result)
;;             :name   "official collection score"})
;;     (premium-features/has-feature? :content-verification)
;;     (conj {:weight 2
;;            :score  (verified-score result)
;;            :name   "verified"})))
;; </code></pre>
;;
;; These are easier to explain: you get points if the search result is pinned (yes or no), bookmarked (yes or no), how
;; recently it was updated (sliding value between 1 (edited just now) and 0 (edited [180+
;; days](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/config.clj#L29-L32)
;; ago), how many dashboards it appears in (sliding value between 0 (zero dashboards) and 1 ([50+
;; dashboards](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/config.clj#L34-L36))
;; and it's type (`model-score`): the earlier a type appears in [this
;; list](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/config.clj#L55-L58)
;; the higher score it gets:
;;
;; <code> ["dashboard" "metric" "segment" "indexed-entity" "card" "dataset" "collection" "table" "action" "database"]</code>
;;
;; On the EE side, we also give points if something's an official collection and if it's verified.
;;
;; Finally, what we actually search is defined in the search
;; config [here](https://github.com/metabase/metabase/blob/8d5f5db02c84899a053e20468986050b2034a9a4/src/metabase/search/config.clj#L73-L109),
;; but the short answer is "the name and, if there is one, the description". We used to search raw SQL queries for
;; cards, but that got turned off recently (but I've seen chat about turning it back on).
;;
;; ❦
;;
;; So, these 12 scorers are weighted and combined together, and the grand total affects search order. If this sounds a
;; little complicated…it is! It also means that it can be tricky to give a proper answer about why the search ranking
;; is "wrong", maybe you search for `monthly revenue` and are looking for a card called `monthly revenue` and are mad
;; that a dashboard called `company stats` shows up first…but then it turns out that the dashboard's description is
;; `Stats that everyone should be aware of, such as our order count and monthly revenue.` and the dashboard happens to
;; be pinned, bookmarked, part of an official collection, verified, and edited a couple hours ago…whereas the card is
;; none of those things.
;;
;; Also, be aware that as of October 2023 there's [a big epic under
;; way](https://github.com/metabase/metabase/issues/27982) to add filtering to search results, which should help
;; people find what they're looking for (and spares us from having to make the above algorithm better).
;;
;;  <hr />

(ns metabase.search.scoring
  "Computes a relevancy score for search results using the weighted average of various scorers. Scores are determined by
  various ways of comparing the text of the search string and the item's title or description, as well as by
  Metabase-specific features such as how many dashboards a card appears in or whether an item is pinned.

  Get the score for a result with `score-and-result`, and efficiently get the most relevant results with
  `top-results`.

  Some of the scorers can be tweaked with configuration in [[metabase.search.config]]."
  (:require
   [cheshire.core :as json]
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.legacy-mbql.normalize :as mbql.normalize]
   [metabase.public-settings.premium-features :refer [defenterprise]]
   [metabase.search.config :as search.config]
   [metabase.search.util :as search.util]
   [metabase.util :as u]))

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
  (let [scores (for [column      (search.config/searchable-columns (:model search-result) search-native-query)
                     {:keys [scorer name weight]
                      :as   _ws} weighted-scorers
                     :let        [matched-text (-> search-result
                                                   (get column)
                                                   (search.config/column->string (:model search-result) column))
                                  match-tokens (some-> matched-text search.util/normalize search.util/tokenize)
                                  raw-score (scorer query-tokens match-tokens)]
                     :when       (and matched-text (pos? raw-score))]
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

(def ^:private model->sort-position
  (zipmap (reverse search.config/models-search-order) (range)))

(defn- model-score
  [{:keys [model]}]
  (/ (or (model->sort-position model) 0)
     (count model->sort-position)))

(defn- text-scores-with-match
  [result {:keys [search-string search-native-query]}]
  (if (seq search-string)
    (text-scores-with search-native-query
                      match-based-scorers
                      (search.util/tokenize (search.util/normalize search-string))
                      result)
    [{:score 0 :weight 0}]))

(defn- pinned-score
  [{:keys [model collection_position]}]
  ;; We experimented with favoring lower collection positions, but it wasn't good
  ;; So instead, just give a bonus for items that are pinned at all
  (if (and (#{"card" "dashboard"} model)
           ((fnil pos? 0) collection_position))
    1
    0))

(defn- bookmarked-score
  [{:keys [model bookmark]}]
  (if (and (#{"card" "collection" "dashboard"} model)
           bookmark)
    1
    0))

(defn- dashboard-count-score
  [{:keys [model dashboardcard_count]}]
  (if (= model "card")
    (min (/ dashboardcard_count
            search.config/dashboard-count-ceiling)
         1)
    0))

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

(defn serialize
  "Massage the raw result from the DB and match data into something more useful for the client"
  [{:as result :keys [all-scores relevant-scores name display_name collection_id collection_name
                      collection_authority_level collection_type collection_effective_ancestors effective_parent]}]
  (let [matching-columns    (into #{} (remove nil? (map :column relevant-scores)))
        match-context-thunk (first (keep :match-context-thunk relevant-scores))]
    (-> result
        (assoc
         :name           (if (and (contains? matching-columns :display_name) display_name)
                           display_name
                           name)
         :context        (when (and match-context-thunk
                                    (empty?
                                     (remove matching-columns search.config/displayed-columns)))
                           (match-context-thunk))
         :collection     (merge {:id              collection_id
                                 :name            collection_name
                                 :authority_level collection_authority_level
                                 :type            collection_type}
                                (when effective_parent
                                  effective_parent)
                                (when collection_effective_ancestors
                                  {:effective_ancestors collection_effective_ancestors}))
         :scores          all-scores)
        (update :dataset_query #(some-> % json/parse-string mbql.normalize/normalize))
        (dissoc
         :all-scores
         :relevant-scores
         :collection_effective_ancestors
         :collection_id
         :collection_location
         :collection_name
         :collection_type
         :display_name
         :effective_parent))))

(defn weights-and-scores
  "Default weights and scores for a given result."
  [result]
  [{:weight 2 :score (pinned-score result) :name "pinned"}
   {:weight 2 :score (bookmarked-score result) :name "bookmarked"}
   {:weight 3/2 :score (recency-score result) :name "recency"}
   {:weight 1 :score (dashboard-count-score result) :name "dashboard"}
   {:weight 1/2 :score (model-score result) :name "model"}])

(defenterprise score-result
  "Score a result, returning a collection of maps with score and weight. Should not include the text scoring, done
  separately. Should return a sequence of maps with

    {:weight number,
     :score  number,
     :name   string}"
  metabase-enterprise.search.scoring
  [result]
  (weights-and-scores result))

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
  [result {:keys [search-string search-native-query]}]
  (let [text-matches     (-> (text-scores-with-match result {:search-string       search-string
                                                             :search-native-query search-native-query})
                             (force-weight text-scores-weight))
        all-scores       (into (vec (score-result result)) text-matches)
        relevant-scores  (remove #(= 0 (:score %)) all-scores)
        total-score      (compute-normalized-score all-scores)]
    ;; Searches with a blank search string mean "show me everything, ranked";
    ;; see https://github.com/metabase/metabase/pull/15604 for archived search.
    ;; If the search string is non-blank, results with no text match have a score of zero.
    (if (or (str/blank? search-string)
            (pos? (reduce (fn [acc {:keys [score] :or {score 0}}] (+ acc score))
                          0
                          text-matches)))
      {:score total-score
       :result (assoc result :all-scores all-scores :relevant-scores relevant-scores)}
      {:score 0})))

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
