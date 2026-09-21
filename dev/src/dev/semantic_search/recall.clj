(ns dev.semantic-search.recall
  "Measure the two recall axes of semantic search against a running instance with an active index (intended for
  a local full-stats appdb + pgvector copy). Unlike `dev.semantic-search.shootout` -- which runs raw SQL on a
  generic table -- this drives the real scored pipeline (`pgvector-api/query`: hybrid vector+keyword, RRF, and
  in-memory appdb scores), because score recall only means anything with the full score function.

  Two recalls, per strategy, for each probe query:

   - nn-recall    : did the strategy retrieve the true embedding nearest-neighbours? Ground truth = the top-N
                    by cosine distance over the exhaustively-scored candidate pool.
   - score-recall : did the strategy surface the items that should actually rank top? Ground truth = the top-N
                    by the full composite score over the same exhaustive pool. This is the retrieve-then-rerank
                    gap: a high-scoring row sitting past the distance-candidate cap never gets scored.

  Ground truth is exhaustive: a brute-force run with `results-limit` raised high enough to score every row
  matching the filters. That is expensive (it scores the whole filtered set in-memory), which is fine for a
  one-off offline analysis.

  Requires `init-semantic-search!` to have run (active index) and a superuser id to bind for permission checks."
  (:require
   [clojure.pprint :as pprint]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase.request.core :as request]))

(set! *warn-on-reflection* true)

(def ^:private exhaustive-limit
  "results-limit used for the exhaustive ground-truth run: large enough to score every filtered row."
  1000000)

(defn- distance-score
  "The `:semantic-distance` component of a result's `:all-scores` -- monotonic in cosine distance (higher =
  closer), so sorting by it descending orders by nearest-neighbour."
  [result]
  (some #(when (= :semantic-distance (:name %)) (:score %)) (:all-scores result)))

(defn- topn
  "Set of the top-`n` results' [model id] keys, ranked by `key-fn` descending (nil keys dropped)."
  [key-fn n results]
  (->> results
       (filter key-fn)
       (sort-by key-fn #(compare %2 %1))
       (take n)
       (map (juxt :model :id))
       set))

(defn- recall
  "Fraction of the `ground`-truth keys also present in `hit` (both sets), or nil when `ground` is empty."
  [ground hit]
  (when (seq ground)
    (double (/ (count (filter ground hit)) (count ground)))))

(defn- pct
  "Round a 0..1 ratio to an integer percent string; nil passes through."
  [r]
  (when r (str (Math/round (* 100.0 r)) "%")))

(defn- query!
  "Run the full scored pipeline for `search-context` as `user-id`, returning the scored results."
  [user-id search-context]
  ;; The SQL scorers (`:mine`) and the appdb scorers (`:user-recency`, bookmarks) read `:current-user-id`
  ;; from the context, not the dynamic *current-user*, so it has to be on the context too -- otherwise the
  ;; "full scored pipeline" silently drops the per-user signals.
  (request/with-current-user user-id
    (:results (semantic.pgvector-api/query (semantic.env/get-pgvector-datasource!)
                                           (semantic.env/get-index-metadata)
                                           (assoc search-context :current-user-id user-id)))))

(defn- with-results-limit!
  "Run `thunk` with `semantic-search-results-limit` temporarily set to `n`, restoring it afterwards."
  [n thunk]
  (let [orig (semantic.settings/semantic-search-results-limit)]
    (try
      (semantic.settings/semantic-search-results-limit! n)
      (thunk)
      (finally
        (semantic.settings/semantic-search-results-limit! orig)))))

(defn score-recall-report
  "For each probe `search-string`, compute nn-recall and score-recall of each strategy against an exhaustive
  ground truth, and print a comparison table.

  Required:
    :user-id        a superuser id to bind for permission checks

  Optional:
    :search-strings  probe queries                                     (default a small built-in set)
    :strategies      strategies to compare                             (default the iterative + naive set)
    :result-limit    candidate cap each strategy runs at               (default 1000)
    :top-n           N for top-N recall                                (default 100)
    :base-context    extra search-context keys (filters, models, ...)  (default {})

  Ground truth per query is a single brute-force run at `results-limit`=[[exhaustive-limit]]: the top-N by
  distance is the nn ground truth, the top-N by composite score is the score ground truth."
  [{:keys [user-id search-strings strategies result-limit top-n base-context]
    :or   {search-strings ["orders" "revenue by month" "customer churn"]
           strategies     [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict :brute-force]
           result-limit   1000
           top-n          100
           base-context   {}}}]
  (assert user-id ":user-id (a superuser) is required")
  (let [ctx (fn [strategy] (merge {:archived? false} base-context
                                  {:search-string  nil ; set per query below
                                   :vector-search-strategy strategy}))
        rows (vec
              (for [q     search-strings
                    :let  [gt        (with-results-limit! exhaustive-limit
                                       #(query! user-id (assoc (ctx :brute-force) :search-string q)))
                           gt-nn     (topn distance-score top-n gt)
                           gt-score  (topn :score top-n gt)]
                    strat strategies
                    :let  [res (with-results-limit! result-limit
                                 #(query! user-id (assoc (ctx strat) :search-string q)))]]
                {:query        q
                 :strategy     strat
                 :returned     (count res)
                 :pool         (count gt)
                 :nn-recall    (pct (recall gt-nn (topn distance-score top-n res)))
                 :score-recall (pct (recall gt-score (topn :score top-n res)))}))]
    (println (format "\nRecall report: top-%d, candidate cap=%d, exhaustive GT pool per query, %d probes"
                     top-n result-limit (count search-strings)))
    (pprint/print-table [:query :strategy :returned :pool :nn-recall :score-recall] rows)
    rows))

(comment
  ;; On a running instance backed by a full-stats appdb + pgvector copy, with an active index:
  (require '[dev.semantic-search.recall :as r])
  ;; user-id = a superuser; e.g. (t2/select-one-pk :model/User :is_superuser true)
  (r/score-recall-report {:user-id 1})

  ;; Narrow to one selective filter + a couple of queries:
  (r/score-recall-report {:user-id 1
                          :search-strings ["orders"]
                          :base-context {:models #{"dashboard"}}
                          :top-n 50}))
