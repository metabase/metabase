(ns dev.semantic-search.shootout
  "REPL harness to compare vector-search strategies over a pgvector `{id, model, embedding}` table:

   - `:brute-force`  filter-first MATERIALIZED scan (skips the HNSW index, exact)
   - `:hnsw`         naive top-N index scan then post-filter (under-populates under selective filters)
   - `:iterative`    inline-filter HNSW iterative scan, tuned by the `hnsw.iterative_scan` / `hnsw.ef_search`
                     / `hnsw.max_scan_tuples` GUCs

  It is DB- and table-parameterized (datasource + table name) so it runs unchanged against the app index,
  the local `emb_incremental` replica, or a stats-DB dump -- only the `{id, model, embedding}` columns are
  assumed. For each variant it reports rows returned, recall against the brute-force ground truth, the inner
  query's p50 execution time, the tuples the scan actually visited, the prefilter pool a filter-first scan
  would touch, and which plan node the planner chose. Cache warmth is controlled with warmup runs.

  This intentionally re-implements the minimal SQL shapes rather than reusing the production builders in
  `metabase-enterprise.semantic-search.index`, because those select index-specific columns that a generic
  dump need not have."
  (:require
   [clojure.pprint :as pprint]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (org.postgresql.util PGobject)))

(set! *warn-on-reflection* true)

(defn datasource
  "Build a next.jdbc datasource from a JDBC URL, e.g.
  `(datasource \"jdbc:postgresql://localhost:55432/hnsw_replica?user=postgres&password=postgres\")`."
  [jdbc-url]
  (jdbc/get-datasource jdbc-url))

(def ^:private result-opts
  "next.jdbc result-set options used everywhere here: unqualified, lower-cased column keywords."
  {:builder-fn jdbc.rs/as-unqualified-lower-maps})

(defn- where-sql
  "Render a raw SQL filter as a ` WHERE ...` clause, or \"\" when blank."
  [where]
  (if (str/blank? where) "" (str " WHERE " where)))

(defn- set-recall
  "Set-overlap recall: fraction of ground-truth set `gt` recovered in `found` (0.0 when `gt` is empty)."
  [gt found]
  (/ (count (filter gt found)) (double (max 1 (count gt)))))

;;; ------------------------------------------------ Query building -------------------------------------------------

(defn- query-embedding-literal
  "Resolve the probe vector as a pgvector literal. Pass `:query-vector` (a seq of numbers) or `:query-id`
  (read row `id`'s embedding from `table`). Inlined as a literal -- like production -- so the scan node is
  unambiguous (a bound subquery would add a pkey InitPlan node)."
  [ds table {:keys [query-id query-vector]}]
  (cond
    query-vector (format "'[%s]'::vector" (str/join "," query-vector))
    query-id     (let [e (:e (jdbc/execute-one! ds [(format "SELECT embedding::text AS e FROM %s WHERE id = ?" table) query-id]
                                                result-opts))]
                   (when-not e
                     (throw (ex-info (format "No row id=%s in %s to take a probe vector from" query-id table) {})))
                   (format "'%s'::vector" e))
    :else        (throw (ex-info "Provide :query-id or :query-vector" {}))))

(defn- shape->sql
  "Generate the raw SQL for a variant `shape` over `table`, with the probe-vector literal `elit`, the optional
  raw SQL `where` fragment, the distance `cutoff` and result `limit`."
  [shape table elit where cutoff limit]
  (let [where-clause (where-sql where)]
    (case shape
      ;; filter-first full scan, exact: the MATERIALIZED CTE has no ORDER BY ... LIMIT so the index is skipped
      :brute-force
      (format (str "WITH vc AS MATERIALIZED (SELECT id, embedding <=> %s AS distance FROM %s%s) "
                   "SELECT id, distance FROM vc WHERE distance <= %s ORDER BY distance ASC LIMIT %d")
              elit table where-clause cutoff limit)
      ;; naive index scan then post-filter: the inner ORDER BY ... LIMIT uses the index, filters run outside.
      ;; The CTE selects `*` so the outer `where` can reference any app-index column (not just id/model) -- it
      ;; runs after the candidate set is chosen, which is exactly the post-filter under-population this shape
      ;; demonstrates.
      :hnsw
      (format (str "WITH vc AS (SELECT *, embedding <=> %s AS distance FROM %s "
                   "ORDER BY embedding <=> %s ASC LIMIT %d) "
                   "SELECT id, distance FROM vc WHERE distance <= %s%s ORDER BY distance ASC LIMIT %d")
              elit table elit limit cutoff (if (str/blank? where) "" (str " AND " where)) limit)
      ;; inline-filter iterative scan: filters live in the ordered+limited index scan; tuning is via the GUCs
      :iterative
      (format (str "WITH vc AS (SELECT id, embedding <=> %s AS distance FROM %s%s "
                   "ORDER BY embedding <=> %s ASC LIMIT %d) "
                   "SELECT id, distance FROM vc WHERE distance <= %s ORDER BY distance ASC LIMIT %d")
              elit table where-clause elit limit cutoff limit))))

;;; --------------------------------------------- Session + execution -----------------------------------------------

(defn- with-session
  "Run `(f conn)` with the variant's `gucs` (a map like {:iterative_scan \"relaxed_order\" :ef_search 40}) and
  optional `force-index?` applied via SET LOCAL on a transaction. When neither is needed, runs on a plain
  connection. SET LOCAL resets at COMMIT, so the connection is left clean."
  [ds gucs force-index? f]
  (if (and (empty? gucs) (not force-index?))
    (with-open [conn (jdbc/get-connection ds)]
      (f conn))
    (jdbc/with-transaction [tx ds]
      (doseq [[k v] gucs]
        (jdbc/execute! tx [(format "SET LOCAL hnsw.%s = %s" (name k) v)]))
      (when force-index?
        (jdbc/execute! tx ["SET LOCAL enable_seqscan = off"]))
      (f tx))))

(defn- explain-element
  "Coerce the single EXPLAIN (… FORMAT JSON) value into its one plan element."
  [v]
  (let [decoded (cond
                  (instance? PGobject v) (json/decode (.getValue ^PGobject v))
                  (string? v)            (json/decode v)
                  :else                  v)]
    (first decoded)))

(defn- find-scan-node
  "Depth-first search of an EXPLAIN plan tree for the scan node over `table`."
  [plan table]
  (when (map? plan)
    (if (and (#{"Seq Scan" "Index Scan" "Index Only Scan" "Bitmap Heap Scan"} (get plan "Node Type"))
             (= table (get plan "Relation Name")))
      plan
      (some #(find-scan-node % table) (get plan "Plans")))))

(defn- explain-once
  "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) `sql` under the variant's session. Returns the whole statement's
  execution time (`:total-ms`) and the table scan node's own time (`:inner-ms`) so callers can see how much of
  the SQL is the raw vector scan vs the surrounding materialize/sort/rank."
  [ds gucs force-index? sql table]
  (with-session ds gucs force-index?
    (fn [conn]
      (let [element (-> (jdbc/execute-one! conn [(str "EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " sql)])
                        vals first explain-element)
            node    (find-scan-node (get element "Plan") table)]
        {:total-ms       (get element "Execution Time")
         ;; EXPLAIN reports per-loop averages. Row counts are per-loop, so a parallel scan (loops = workers)
         ;; needs the multiply for the true total; "Actual Total Time" is also per-loop but the workers run
         ;; concurrently, so it already approximates wall clock and must NOT be multiplied. (Matches the
         ;; production scan-node-metrics in semantic_search/index.clj.)
         :inner-ms       (get node "Actual Total Time" 0)
         :node-type      (get node "Node Type")
         :index-name     (get node "Index Name")
         :tuples-scanned (* (get node "Actual Loops" 1)
                            (+ (get node "Actual Rows" 0) (get node "Rows Removed by Filter" 0)))
         :shared-read    (get node "Shared Read Blocks")}))))

(defn- run-ids
  "Run `sql` under the variant's session and return the result id vector."
  [ds gucs force-index? sql]
  (with-session ds gucs force-index?
    (fn [conn]
      (mapv :id (jdbc/execute! conn [sql] result-opts)))))

(defn- run-rows
  "Run `sql` under the variant's session and return [{:id :distance}] in the order the query returns them."
  [ds gucs force-index? sql]
  (with-session ds gucs force-index?
    (fn [conn]
      (mapv #(select-keys % [:id :distance])
            (jdbc/execute! conn [sql] result-opts)))))

(defn- count-where
  "Count rows in `table` matching the raw SQL `where` (or all rows when blank)."
  [ds table where]
  (-> (jdbc/execute-one! ds [(format "SELECT count(*) AS n FROM %s%s" table (where-sql where))]
                         result-opts)
      :n))

;;; ---------------------------------------------------- Variants ---------------------------------------------------

(defn default-variants
  "A reasonable default variant sweep: brute-force ground truth, naive HNSW, and iterative scans across orders
  and `max_scan_tuples`. `ef-search` is the base candidate list; `big-scan` bumps the iterative tuple budget."
  [{:keys [ef-search big-scan] :or {ef-search 40 big-scan 200000}}]
  [{:label "brute-force"            :shape :brute-force}
   {:label "hnsw-naive"             :shape :hnsw}
   {:label "iter-relaxed"           :shape :iterative :gucs {:iterative_scan "relaxed_order" :ef_search ef-search}}
   {:label "iter-strict"            :shape :iterative :gucs {:iterative_scan "strict_order"  :ef_search ef-search}}
   {:label "iter-relaxed-bigscan"   :shape :iterative :gucs {:iterative_scan "relaxed_order" :ef_search ef-search
                                                             :max_scan_tuples big-scan}}
   {:label "iter-relaxed-force-idx" :shape :iterative :gucs {:iterative_scan "relaxed_order" :ef_search ef-search}
    :force-index? true}])

(defn- measure-variant
  "Warm the cache, then EXPLAIN ANALYZE `repeats` times and run once for the id set. Reports the single run with
  the median total time, so its `:inner-ms` and `:total-ms` stay mutually consistent (inner is a sub-node of
  the statement, so inner <= total within one run -- taking independent p50s could break that)."
  [ds table elit where cutoff limit repeats warmup variant]
  (let [sql  (shape->sql (:shape variant) table elit where cutoff limit)
        gucs (:gucs variant)
        fi?  (:force-index? variant)]
    (dotimes [_ warmup] (run-ids ds gucs fi? sql))
    (let [explains (vec (repeatedly repeats #(explain-once ds gucs fi? sql table)))
          rep      (nth (vec (sort-by :total-ms explains)) (quot (count explains) 2))
          ids      (run-ids ds gucs fi? sql)]
      (merge rep
             {:label (:label variant)
              :rows  (count ids)
              :ids   (set ids)}))))

;;; ------------------------------------------------- Shoot-out -----------------------------------------------------

(defn run-query-shootout
  "Compare vector-search strategies over a pgvector `{id, model, embedding}` `table`.

  Required:
    :datasource  a next.jdbc datasource (see [[datasource]])
    :table       the index/table name to query
    :query-id    OR :query-vector   the probe vector (a row id, or an explicit seq of numbers)

  Optional:
    :where       raw SQL filter fragment, e.g. \"model = 'dashboard'\"  (default: no filter)
    :cutoff      max cosine distance                                    (default 0.7)
    :limit       result limit                                           (default 1000)
    :variants    seq of variant specs                                   (default [[default-variants]])
    :repeats     EXPLAIN ANALYZE repeats for the p50                    (default 5)
    :warmup      cache-warmup runs per variant                          (default 2)
    :ef-search / :big-scan   passed to [[default-variants]]

  Recall is measured against the `brute-force` variant's result (exact top-N within cutoff). `inner-ms` is the
  vector scan node's time, `total-ms` the whole SQL statement's; `inner%` is their ratio. The `inner-x` /
  `total-x` columns are speed multipliers vs the brute-force baseline (>1 = that much faster than brute-force).
  Note `total-ms` is the SQL statement, not the full API request -- the harness runs raw SQL, with no
  embedding / keyword / scoring / permission-filter / HTTP cost. Returns the per-variant rows and prints a
  comparison table."
  [{:keys [datasource table where cutoff limit variants repeats warmup]
    :or   {cutoff 0.7 limit 1000 repeats 5 warmup 2}
    :as   opts}]
  (let [elit       (query-embedding-literal datasource table opts)
        variants   (or variants (default-variants opts))
        total      (count-where datasource table nil)
        pool       (count-where datasource table where)
        results    (mapv #(measure-variant datasource table elit where cutoff limit repeats warmup %) variants)
        baseline   (first (filter #(= "brute-force" (:label %)) results))
        ground     (:ids baseline)
        speed-mult (fn [base this] (when (and base this (pos? this)) (format "%.1fx" (double (/ base this)))))
        rows       (mapv (fn [{:keys [label rows ids inner-ms total-ms tuples-scanned node-type index-name]}]
                           {:variant label
                            :rows    rows
                            :recall  (when (seq ground) (str (Math/round (* 100.0 (set-recall ground ids))) "%"))
                            :inner-ms (some->> inner-ms (format "%.1f"))
                            :total-ms (some->> total-ms (format "%.1f"))
                            :inner%   (when (and inner-ms total-ms (pos? total-ms))
                                        (str (Math/round (double (* 100 (/ inner-ms total-ms)))) "%"))
                            :inner-x  (speed-mult (:inner-ms baseline) inner-ms)
                            :total-x  (speed-mult (:total-ms baseline) total-ms)
                            :scanned  tuples-scanned
                            :node     node-type
                            :index?   (some? index-name)})
                         results)]
    (println (format "\nTable %s: %,d rows total, %,d match filter (%s)"
                     table total pool (if (str/blank? where) "no filter" where)))
    (println (format "limit=%d cutoff=%s repeats=%d warmup=%d  (inner-x/total-x = speed vs brute-force; total-ms is SQL only)\n"
                     limit cutoff repeats warmup))
    (pprint/print-table [:variant :rows :recall :inner-ms :total-ms :inner% :inner-x :total-x :scanned :node] rows)
    results))

;;; -------------------------------------------- Recall / NDCG @ k --------------------------------------------------
;;;
;;; Ranking quality of each strategy's embedding retrieval, averaged over a deterministic probe-vector sample.
;;; The query is a stored row embedding, so every returned item's cosine distance is exact (HNSW approximates
;;; *which* items return, not their distance) -- we grade each by similarity `1 - d/2` and take the exact
;;; brute-force ranking as the ideal. Recall@k is set overlap with the ideal top-k; NDCG@k also rewards order.

(def ^:private default-ks [1 10 100 1000])

(defn- sim
  "Graded relevance from a cosine distance d in [0,2]: 1 (identical) .. 0 (opposite)."
  [d]
  (max 0.0 (- 1.0 (/ (double d) 2.0))))

(defn- dcg
  "Discounted cumulative gain of a sequence of per-position relevances."
  [rels]
  (reduce + (map-indexed (fn [i r] (/ (double r) (/ (Math/log (+ i 2.0)) (Math/log 2.0)))) rels)))

(defn- ndcg-at [k ideal-dists strat-dists]
  (let [idcg (dcg (map sim (take k ideal-dists)))]
    (when (pos? idcg) (/ (dcg (map sim (take k strat-dists))) idcg))))

(defn- recall-at [k ideal-ids strat-ids]
  (let [ideal (set (take k ideal-ids))]
    (when (seq ideal) (double (/ (count (filter ideal (take k strat-ids))) (count ideal))))))

(defn- probe-ids
  "Deterministically sample `n` probe row ids (stable across runs via md5(id), optionally restricted by
  `probe-where`)."
  [ds table probe-where n]
  (mapv :id (jdbc/execute! ds [(format "SELECT id FROM %s%s ORDER BY md5(id::text) LIMIT %d"
                                       table (where-sql probe-where) n)]
                           result-opts)))

(defn- mean
  "Mean of `xs`, ignoring nils; nil when nothing is left."
  [xs]
  (when-let [v (seq (keep identity xs))]
    (double (/ (reduce + v) (count v)))))

(defn ndcg-report
  "Average recall@k and NDCG@k of each strategy's embedding retrieval over a deterministic probe sample.

  Required: :datasource, :table
  Optional:
    :where        raw SQL result filter                         (default none)
    :probe-where  raw SQL restricting which rows are probes     (default: whole table)
    :n-probes     number of probe vectors                       (default 25)
    :ks           the k values                                  (default [1 10 100 1000])
    :cutoff       max cosine distance                           (default 0.7)
    :variants     variant specs                                 (default [[default-variants]])

  Ground truth per probe = the exact brute-force ranking (relevance graded by similarity). Probes are sampled
  deterministically so results are comparable across runs."
  [{:keys [datasource table where probe-where n-probes ks cutoff variants]
    :or   {n-probes 25 ks default-ks cutoff 0.7}
    :as   opts}]
  (let [ds       datasource
        max-k    (apply max ks)
        variants (or variants (default-variants opts))
        probes   (probe-ids ds table probe-where n-probes)
        ;; per probe: ideal rows (exact) + each variant's rows, then per-k recall/ndcg
        per-probe (for [pid probes
                        :let [elit  (query-embedding-literal ds table {:query-id pid})
                              ideal (run-rows ds nil false (shape->sql :brute-force table elit where cutoff max-k))
                              ideal-ids   (mapv :id ideal)
                              ideal-dists (mapv :distance ideal)]]
                    (into {}
                          (for [v variants
                                :let [rows  (run-rows ds (:gucs v) (:force-index? v)
                                                      (shape->sql (:shape v) table elit where cutoff max-k))
                                      rids  (mapv :id rows)
                                      rdsts (mapv :distance rows)]]
                            [(:label v)
                             (into {} (for [k ks]
                                        [k {:recall (recall-at k ideal-ids rids)
                                            :ndcg   (ndcg-at k ideal-dists rdsts)}]))])))
        fmt      (fn [x] (if x (format "%.2f" (double x)) "-"))]
    (println (format "\nRecall/NDCG @ k on %s: %d probes (deterministic), filter=%s, cutoff=%s"
                     table (count probes) (if (str/blank? where) "none" where) cutoff))
    (pprint/print-table
     (into [:variant] (mapcat (fn [k] [(keyword (str "r@" k)) (keyword (str "n@" k))]) ks))
     (for [v variants
           :let [label (:label v)]]
       (into {:variant label}
             (mapcat (fn [k]
                       [[(keyword (str "r@" k)) (fmt (mean (map #(get-in % [label k :recall]) per-probe)))]
                        [(keyword (str "n@" k)) (fmt (mean (map #(get-in % [label k :ndcg]) per-probe)))]])
                     ks))))))

;;; ------------------------------------------- Index maintenance cost ----------------------------------------------
;;;
;;; The query-time shoot-out above measures recall/latency. These measure the *other* side of the trade: what
;;; the HNSW index costs to keep. `index-size-report` is read-only; `index-build-cost!` and `staleness-report!`
;;; operate on a throwaway scratch table (`<table>_shootout_scratch`) and never touch the source data.

(defn- hnsw-index-name
  "Name of the HNSW index on `table`, or nil."
  [ds table]
  (-> (jdbc/execute-one! ds [(str "SELECT indexname FROM pg_indexes WHERE tablename = ? "
                                  "AND indexdef ILIKE '%using hnsw%' LIMIT 1") table]
                         result-opts)
      :indexname))

(defn- vector-dims
  "Embedding dimensionality of `table`."
  [ds table]
  (-> (jdbc/execute-one! ds [(format "SELECT vector_dims(embedding) AS d FROM %s LIMIT 1" table)]
                         result-opts)
      :d))

(defn index-size-report
  "Read-only: report the HNSW index size for `table` relative to the table heap and total relation size."
  [{:keys [datasource table]}]
  (let [idx (hnsw-index-name datasource table)
        row (jdbc/execute-one! datasource
                               [(format (str "SELECT pg_size_pretty(pg_relation_size('%s')) AS index_size, "
                                             "pg_relation_size('%s') AS index_bytes, "
                                             "pg_size_pretty(pg_table_size('%s')) AS table_size, "
                                             "pg_table_size('%s') AS table_bytes, "
                                             "pg_size_pretty(pg_total_relation_size('%s')) AS total_size")
                                        idx idx table table table)]
                               result-opts)]
    (println (format "\nHNSW index %s on %s:" idx table))
    (println (format "  index %s | table %s | total %s | index is %.0f%% of the table heap"
                     (:index_size row) (:table_size row) (:total_size row)
                     (* 100.0 (/ (double (:index_bytes row)) (max 1 (:table_bytes row))))))
    row))

(defn- timed!
  "Run `[sql]` on `ds` and return elapsed ms."
  [ds sql]
  (let [t (u/start-timer)]
    (jdbc/execute! ds [sql])
    (u/since-ms t)))

(defn index-build-cost!
  "On a throwaway scratch copy of `n` rows sampled from `table`, measure the HNSW index's maintenance costs:
  the insert throughput with vs without the index (the write slowdown the index imposes), the index build
  time and size, and the VACUUM / REINDEX times. Creates and DROPS `<table>_shootout_scratch`; never touches
  the source data.

  `n` rows seed the no-index insert; another `n` (offset) seed the with-index insert."
  [{:keys [datasource table n] :or {n 20000}}]
  (let [ds      datasource
        scratch (str table "_shootout_scratch")
        idx     (str scratch "_hnsw")
        dims    (vector-dims ds table)]
    (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" scratch)])
    (jdbc/execute! ds [(format "CREATE TABLE %s (id bigint, model text, embedding vector(%d))" scratch dims)])
    (try
      (let [insert-cold (timed! ds (format "INSERT INTO %s (id, model, embedding) SELECT id, model, embedding FROM %s LIMIT %d"
                                           scratch table n))
            build       (timed! ds (format "CREATE INDEX %s ON %s USING hnsw (embedding vector_cosine_ops)" idx scratch))
            idx-size    (jdbc/execute-one! ds [(format "SELECT pg_size_pretty(pg_relation_size('%s')) AS s, pg_relation_size('%s') AS b" idx idx)]
                                           result-opts)
            insert-warm (timed! ds (format "INSERT INTO %s (id, model, embedding) SELECT id, model, embedding FROM %s OFFSET %d LIMIT %d"
                                           scratch table n n))
            vacuum      (timed! ds (format "VACUUM (ANALYZE) %s" scratch))
            reindex     (timed! ds (format "REINDEX INDEX %s" idx))]
        (println (format "\nIndex maintenance cost on %s (scratch %s, %,d rows/batch, dim %d):" table scratch n dims))
        (println (format "  insert WITHOUT index : %8.1f ms (%,.0f rows/s)" insert-cold (/ n (/ insert-cold 1000.0))))
        (println (format "  insert WITH index    : %8.1f ms (%,.0f rows/s)  -> %.1fx slower per row"
                         insert-warm (/ n (/ insert-warm 1000.0)) (/ insert-warm insert-cold)))
        (println (format "  index build          : %8.1f ms  (size %s for %,d rows)" build (:s idx-size) n))
        (println (format "  VACUUM (ANALYZE)     : %8.1f ms" vacuum))
        (println (format "  REINDEX              : %8.1f ms" reindex))
        {:insert-no-index-ms insert-cold
         :insert-index-ms    insert-warm
         :insert-slowdown    (/ insert-warm insert-cold)
         :build-ms           build
         :index-bytes        (:b idx-size)
         :vacuum-ms          vacuum
         :reindex-ms         reindex})
      (finally
        (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" scratch)])))))

(defn staleness-report!
  "On a throwaway scratch copy of `n` rows from `table`, measure how index staleness erodes recall: build the
  HNSW index, measure recall of a top-`limit` search against the exact (seq-scan) answer, then churn
  `churn-frac` of the rows in place, re-measure recall, then VACUUM + REINDEX and measure recovery. Creates
  and DROPS `<table>_shootout_scratch`.

  Recall here is index-vs-exact for an unfiltered nearest-neighbour search, so it isolates index quality from
  the post-filter under-population the query shoot-out shows."
  [{:keys [datasource table n limit churn-frac query-id] :or {n 50000 limit 100 churn-frac 0.2 query-id 1}}]
  (let [ds      datasource
        scratch (str table "_shootout_scratch")
        idx     (str scratch "_hnsw")
        dims    (vector-dims ds table)
        elit    (query-embedding-literal ds table {:query-id query-id})
        ;; Force the index (off the seq scan) so this is the *index's* answer, not the exact one. Without it the
        ;; planner can pick a seq scan and `approx` collapses onto `gt`, reporting recall 1.0 and hiding the very
        ;; staleness this report exists to measure.
        approx  (fn []
                  (jdbc/with-transaction [tx ds]
                    (jdbc/execute! tx ["SET LOCAL enable_seqscan = off"])
                    (set (mapv :id (jdbc/execute! tx [(format "SELECT id FROM %s ORDER BY embedding <=> %s ASC LIMIT %d" scratch elit limit)]
                                                  result-opts)))))]
    (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" scratch)])
    (jdbc/execute! ds [(format "CREATE TABLE %s (id bigint primary key, model text, embedding vector(%d))" scratch dims)])
    (try
      (jdbc/execute! ds [(format "INSERT INTO %s (id, model, embedding) SELECT id, model, embedding FROM %s LIMIT %d" scratch table n)])
      ;; ground truth = exact seq scan; force it off the index for the truth set. The churn is a no-op
      ;; in-place UPDATE, so the data (and thus this exact answer) is unchanged throughout -- only the index
      ;; accumulates dead tuples. That isolates index staleness from any change in the true neighbour set.
      (let [gt          (jdbc/with-transaction [tx ds]
                          (jdbc/execute! tx ["SET LOCAL enable_indexscan = off"])
                          (set (mapv :id (jdbc/execute! tx [(format "SELECT id FROM %s ORDER BY embedding <=> %s ASC LIMIT %d" scratch elit limit)]
                                                        result-opts))))
            _           (jdbc/execute! ds [(format "CREATE INDEX %s ON %s USING hnsw (embedding vector_cosine_ops)" idx scratch)])
            recall-fresh (set-recall gt (approx))
            churn-n     (long (* churn-frac n))
            ;; churn: re-write a slice in place. Because `embedding` is indexed this is a non-HOT update --
            ;; each touched row gets a fresh HNSW graph entry and leaves the old one dead.
            _           (jdbc/execute! ds [(format "UPDATE %s SET embedding = embedding WHERE id IN (SELECT id FROM %s ORDER BY id LIMIT %d)"
                                                   scratch scratch churn-n)])
            recall-churned (set-recall gt (approx))
            _           (jdbc/execute! ds [(format "VACUUM (ANALYZE) %s" scratch)])
            recall-vacuumed (set-recall gt (approx))
            _           (jdbc/execute! ds [(format "REINDEX INDEX %s" idx)])
            recall-reindexed (set-recall gt (approx))]
        (println (format "\nStaleness vs recall on %s (scratch %s, %,d rows, churned %,d, top-%d):" table scratch n churn-n limit))
        (println (format "  recall fresh build   : %.2f" recall-fresh))
        (println (format "  recall after churn   : %.2f" recall-churned))
        (println (format "  recall after VACUUM  : %.2f" recall-vacuumed))
        (println (format "  recall after REINDEX : %.2f" recall-reindexed))
        {:fresh recall-fresh :churned recall-churned :vacuumed recall-vacuumed :reindexed recall-reindexed})
      (finally
        (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" scratch)])))))

(defn- ids-with-setting
  "Run a top-k id query under one planner `setting` (a `SET LOCAL` statement) in a transaction, returning the
  id set. Used to force the exact (seq-scan) answer vs the index-backed approximate answer."
  [ds setting sql]
  (jdbc/with-transaction [tx ds]
    (jdbc/execute! tx [setting])
    (set (mapv :id (jdbc/execute! tx [sql] result-opts)))))

(defn rotation-report!
  "Measure the rotation win: how much recall a fresh index rebuild buys on a degraded `table`, and what it
  costs. A production rotation re-runs the search framework's reindex into a fresh table; with an embedding
  cache it reuses the existing vectors instead of re-embedding. This models that storage-layer outcome by
  copying the same embeddings into `<table>_rotated` (no re-embedding) and building a fresh HNSW graph, then
  compares, over `n-probes` probe vectors, the index-vs-exact recall of the CURRENT (possibly degraded) index
  against the ROTATED one. Reports per-probe and mean recall, the index size/bloat reduction, and the rebuild
  cost (copy + index build). Builds and DROPS `<table>_rotated`.

  Recall is measured by forcing the index for the approximate answer (`enable_seqscan=off`) and a seq scan for
  the exact answer (`enable_indexscan=off`); the rotated table has identical rows, so the exact answer is shared."
  [{:keys [datasource table limit n-probes] :or {limit 100 n-probes 10}}]
  (let [ds        datasource
        rotated   (str table "_rotated")
        cur-idx   (hnsw-index-name ds table)
        probe-ids (mapv :id (jdbc/execute! ds [(format "SELECT id FROM %s ORDER BY id LIMIT %d" table n-probes)]
                                           result-opts))
        topk      (fn [tbl elit] (format "SELECT id FROM %s ORDER BY embedding <=> %s ASC LIMIT %d" tbl elit limit))]
    (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" rotated)])
    (try
      ;; rotate: copy rows -- reusing the existing embeddings, no re-embedding -- into a fresh table + graph
      (let [copy-ms  (timed! ds (format "CREATE TABLE %s AS SELECT id, model, embedding FROM %s" rotated table))
            build-ms (timed! ds (format "CREATE INDEX %s_hnsw ON %s USING hnsw (embedding vector_cosine_ops)" rotated rotated))
            sizes    (jdbc/execute-one! ds [(format (str "SELECT pg_size_pretty(pg_relation_size('%s')) cur_pretty, "
                                                         "pg_relation_size('%s') cur_b, "
                                                         "pg_size_pretty(pg_relation_size('%s_hnsw')) rot_pretty, "
                                                         "pg_relation_size('%s_hnsw') rot_b")
                                                    cur-idx cur-idx rotated rotated)]
                                        result-opts)
            per-probe (vec (for [pid probe-ids]
                             (let [elit (query-embedding-literal ds table {:query-id pid})
                                   gt   (ids-with-setting ds "SET LOCAL enable_indexscan = off" (topk table elit))
                                   cur  (ids-with-setting ds "SET LOCAL enable_seqscan = off"   (topk table elit))
                                   rot  (ids-with-setting ds "SET LOCAL enable_seqscan = off"   (topk rotated elit))]
                               {:probe pid
                                :current (set-recall gt cur)
                                :rotated (set-recall gt rot)})))
            mean-cur  (or (mean (map :current per-probe)) 0.0)
            mean-rot  (or (mean (map :rotated per-probe)) 0.0)]
        (println (format "\nRotation win on %s (top-%d, %d probes):" table limit (count probe-ids)))
        (pprint/print-table [:probe :current :rotated]
                            (mapv (fn [r] (-> r (update :current #(format "%.2f" %)) (update :rotated #(format "%.2f" %)))) per-probe))
        (println (format "  mean recall: current %.3f -> rotated %.3f  (+%.3f)"
                         mean-cur mean-rot (- mean-rot mean-cur)))
        (println (format "  index size : current %s -> rotated %s  (%.0f%% smaller)"
                         (:cur_pretty sizes) (:rot_pretty sizes)
                         (* 100.0 (- 1.0 (/ (double (:rot_b sizes)) (max 1 (:cur_b sizes)))))))
        (println (format "  rebuild cost: copy %.1f ms + index build %.1f ms (no re-embedding)" copy-ms build-ms))
        {:mean-recall-current mean-cur
         :mean-recall-rotated mean-rot
         :cur-index-bytes     (:cur_b sizes)
         :rotated-index-bytes (:rot_b sizes)
         :copy-ms             copy-ms
         :build-ms            build-ms})
      (finally
        (jdbc/execute! ds [(format "DROP TABLE IF EXISTS %s" rotated)])))))

(comment
  ;; Against the local prod-like replica: query vector from a card, filter for dashboards (selective +
  ;; anti-correlated -- the case where naive HNSW post-filtering under-populates).
  (def ds (datasource "jdbc:postgresql://localhost:55432/hnsw_replica?user=postgres&password=postgres"))

  (run-query-shootout
   {:datasource ds
    :table      "emb_incremental"
    :query-id   1
    :where      "model = 'dashboard'"
    :limit      1000})

  ;; Against the app index (point :datasource at MB_PGVECTOR_DB_URL's DB, :table at the index table).
  ;; Re-run against a stats-DB dump by pointing :datasource / :table at it.
  (run-query-shootout
   {:datasource ds
    :table      "search_prompt_entities_index"
    :query-id   1
    :where      "model = 'card' AND archived = false"
    :ef-search  100})

  ;; --- Recall / NDCG @ k over a deterministic probe sample ---
  (ndcg-report {:datasource ds :table "emb_incremental" :n-probes 25})
  (ndcg-report {:datasource ds :table "emb_incremental" :where "model = 'card'" :n-probes 25})

  ;; --- Index maintenance cost (the other side of the trade-off) ---
  (index-size-report {:datasource ds :table "emb_incremental"})       ; read-only
  (index-build-cost! {:datasource ds :table "emb_incremental" :n 20000})  ; scratch table, dropped after
  (staleness-report! {:datasource ds :table "emb_incremental" :n 50000 :churn-frac 0.2})

  ;; --- Rotation win: recall of the current (degraded) index vs a fresh rebuild from the same embeddings ---
  (rotation-report! {:datasource ds :table "emb_incremental" :n-probes 15 :limit 100}))
