(ns metabase-enterprise.semantic-search.vector-strategy-matrix-test
  "Quality matrix over the vector-search strategies on a small deterministic dataset.

  Headline:

  - naive :hnsw -- too risky around under-fetching.
    An anti-correlated :verified filter empties its pool outright (final recall 0.0 where :brute-force
    scores 1.0), and even a half-selective filter halves it before the permission drop halves it again
    ({:raw-count 10 :returned 6} against 20/16 for every other variant).
  - :brute-force -- reliable, but poor asymptotic performance.
    Exact in every cell of the matrix, at the cost of computing distances over the whole filtered table.
    And because that cost tracks the filtered pool size, latency varies query-to-query with the filters --
    intermittent slowness that can frustrate more than a uniformly slower engine.
  - :hnsw-iterative-* -- promising, but can still underperform.
    It recovers everything the naive scan loses to filters (recall 1.0 vs 0.0) at index-backed cost.
    Yet approximation shows up at real dimensionality (recall@20 observed at 0.15-0.6 on the 32-d packed
    dataset with ef_search 16), a binding hnsw.max_scan_tuples empties a filtered scan that :brute-force
    answers exactly, and the post-retrieval re-ranking and permission stages lose just as much through it
    (0.4 recall under limit truncation, a 20 -> 12 pool drop) because they run after retrieval.

  Caveat: every number above comes from a very, very small index (300 docs; 2000 for the packed dataset).
  The mechanisms are the same at scale, but their effects can be far more drastic.

  Covers four retrieval variants -- no HNSW index (exact seq scan), naive :hnsw (post-filter), and the two
  iterative-scan strategies -- with :brute-force as the exact SQL reference, and measures three things:

  1. distance recall / NDCG of candidate retrieval against a ground truth computed in pure Clojure,
  2. recall of the final re-ranked top results against an exhaustive run of the same scoring pipeline,
  3. under-fetch caused by post-retrieval permission filtering.

  The trade-offs demonstrated: even exact retrieval under-delivers end-to-end (the candidate pool is
  truncated at `semantic-search-results-limit` before re-ranking, and permission checks drop candidates
  after), naive :hnsw misses everything under an anti-correlated filter, and the iterative strategies fix
  filter-driven misses but not limit truncation or permission under-fetch.
  Under a half-selective filter naive :hnsw also under-fetches at the SQL stage before the permission drop
  cuts again -- the two losses compound for the post-filtering strategy only.

  The matrix cells assert exact values and orderings, not thresholds.
  Embeddings sit at exact distinct distances from the probe (no ties), the heap is populated in a fixed
  order before the index exists, table stats are pinned with ANALYZE, and every indexed query forces the
  index path (a 300-row table would otherwise always seq-scan).
  The HNSW graph itself is NOT reproducible (pgvector draws node levels from the per-backend global PRNG,
  which `setseed` does not touch), so exact cells are only those whose outcome is invariant across graphs;
  each was validated against 30-60 independently built graphs.
  On the 4-d matrix dataset the graph is exact regardless of its random shape -- even 3000 densely packed
  filler docs do not change that -- so the matrix pins the structural differences between the strategies'
  SQL shapes and scan termination rules.
  Graph approximation error needs dimensionality, not tree size: [[graph-approximation-test]] covers that
  axis on a 32-d densely packed dataset with banded assertions (band edges sit several misses away from
  everything observed across dozens of graphs)."
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.scoring :as semantic.scoring]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.permissions.models.permissions :as perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [next.jdbc :as jdbc])
  (:import
   (java.util Random)))

(set! *warn-on-reflection* true)

(use-fixtures :once #'semantic.tu/once-fixture)

;;;; quality metrics

(def ^:private cutoff
  "The production cosine-distance cutoff; the dataset's bands are designed around it."
  @#'semantic.index/max-cosine-distance)

(defn- recall-at
  "Fraction of the ideal top-`k` ids present in the returned top-`k`."
  [k ideal-ids returned-ids]
  (let [ideal (set (take k ideal-ids))]
    (double (/ (count (filter ideal (take k returned-ids)))
               (count ideal)))))

(defn- sim
  "Graded relevance of a cosine distance `d` in [0,2]: 1 (identical) .. 0 (opposite)."
  [d]
  (max 0.0 (- 1.0 (/ (double d) 2.0))))

(defn- dcg
  "Discounted cumulative gain of a sequence of per-position relevances."
  [rels]
  (transduce (map-indexed (fn [i r] (/ (double r) (/ (Math/log (+ i 2.0)) (Math/log 2.0))))) + 0.0 rels))

(defn- ndcg-at
  "NDCG@`k` of `returned-ids` against the exact `ideal-ids` ranking.
  Relevance is graded by true distance via `id->distance`."
  [k id->distance ideal-ids returned-ids]
  (/ (dcg (map (comp sim id->distance) (take k returned-ids)))
     (dcg (map (comp sim id->distance) (take k ideal-ids)))))

;;;; dataset

(def ^:private probe-text "zebra quark")
(def ^:private probe-vector [1.0 0.0 0.0 0.0])

(def ^:private bands
  "Band layout for the 300-doc dataset, in insertion (and ascending-distance) order.

  - :restricted sits nearest the probe but in a permission-restricted collection, so it occupies top-k slots
    that the permission filter then drops (under-fetch).
  - :core/:mid are bulk filler so retrieval is nowhere near saturated.
  - :pinned is inside the cutoff but far outside any candidate pool -- the re-ranking lever for layer 2.
  - :rare holds the only verified docs and is anti-correlated with the probe: a :verified filter on it is
    adversarial for post-filtering strategies. The adversarial filter must be a column with no supporting
    btree: a :models filter would be served exactly by the (model, model_id) unique constraint at this table
    size, bypassing the HNSW scan the matrix is exercising.
  - :decoy lies beyond the cutoff and must never be returned."
  [{:band :restricted :n 8   :model "card" :d0 0.020 :dstep 0.005}
   {:band :core       :n 180 :model "card" :d0 0.100 :dstep 0.0015}
   {:band :mid        :n 74  :model "card" :d0 0.400 :dstep 0.0008}
   {:band :pinned     :n 6   :model "card" :d0 0.465 :dstep 0.002 :pinned true}
   {:band :rare       :n 12  :model "card" :d0 0.550 :dstep 0.008 :verified true}
   {:band :decoy      :n 20  :model "card" :d0 0.750 :dstep 0.007}])

(defn- vector-at-distance
  "A unit `dims`-d vector at exact cosine distance `d` (pgvector `<=>`) from the probe `[1 0 0 ...]`."
  [^Random rng dims d]
  ;; the probe component is fixed by `d` and the remainder is a seeded random unit direction orthogonal to
  ;; the probe axis, so the cosine against the probe is exactly 1 - d
  (let [u (loop []
            (let [g (repeatedly (dec dims) #(.nextGaussian rng))
                  n (Math/sqrt (double (reduce + (map * g g))))]
              (if (< n 1e-6) (recur) (mapv #(/ % n) g))))
        a (- 1.0 d)
        b (Math/sqrt (- 1.0 (* a a)))]
    (into [a] (map #(* b %)) u)))

(defn- make-dataset
  "Build the deterministic banded dataset.
  Returns {:docs [...], :embeddings {text -> vec}, :id->distance {id -> d}, :id->band {id -> band}}.
  The creator alternates with id parity (odd -> crowberto, even -> rasta), so a `created-by` filter is
  half-selective in every band.
  Doc names share no stem with [[probe-text]], so the keyword side of the hybrid query never matches and the
  RRF rank reduces to the pure semantic (distance) rank."
  [{:keys [seed restricted-collection-id]}]
  (let [rng  (Random. (long seed))
        rows (for [{:keys [band n model d0 dstep pinned verified]} bands
                   i (range n)]
               {:band band :model model :pinned pinned :verified verified :d (+ d0 (* i dstep))})
        rows (map-indexed (fn [idx row]
                            (let [{:keys [band model]} row]
                              (assoc row
                                     :id (inc idx)
                                     :name (format "%s %s %03d" (name band) model (inc idx))
                                     :vector (vector-at-distance rng 4 (:d row)))))
                          rows)]
    {:docs         (vec (for [{:keys [band model pinned verified d id name]} rows]
                          (let [collection-id (when (= band :restricted) restricted-collection-id)]
                            {:model           model
                             :id              id
                             :name            name
                             :searchable_text name
                             :embeddable_text name
                             :created_at      #t "2025-01-01T12:00:00Z"
                             :creator_id      (mt/user->id (if (odd? id) :crowberto :rasta))
                             :archived        false
                             :pinned          (boolean pinned)
                             :verified        (boolean verified)
                             :collection_id   collection-id
                             ;; the permission filter runs on the decoded legacy_input, so like the real
                             ;; ingestion documents it must carry collection_id itself
                             :legacy_input    {:id id :model model :name name :collection_id collection-id}
                             :metadata        {:title name :distance d}})))
     :embeddings   (into {probe-text probe-vector} (map (juxt :name :vector)) rows)
     :id->distance (into {} (map (juxt :id :d)) rows)
     :id->band     (into {} (map (juxt :id :band)) rows)}))

(defn- exact-ids
  "Ids of docs satisfying `pred`, within the distance cutoff, in exact ascending-distance order.
  This is the pure-Clojure ground truth the SQL retrieval is measured against."
  [{:keys [docs id->distance]} pred]
  (->> docs
       (filter pred)
       (filter #(<= (id->distance (:id %)) cutoff))
       (sort-by #(id->distance (:id %)))
       (mapv :id)))

(defn- band-ids
  [{:keys [id->band]} band]
  (set (keep (fn [[id b]] (when (= b band) id)) id->band)))

(deftest dataset-sanity-test
  (let [ds (make-dataset {:seed 42 :restricted-collection-id -1})]
    (testing "300 docs, distinct strictly-positive distances, unit vectors"
      (is (= 300 (count (:docs ds))))
      (is (= 300 (count (distinct (vals (:id->distance ds))))))
      (is (every? pos? (vals (:id->distance ds))))
      (is (every? #(< (abs (- 1.0 (reduce + (map * % %)))) 1e-9)
                  (vals (dissoc (:embeddings ds) probe-text)))))
    (testing "geometry the assertions rely on"
      (let [top-20 (set (take 20 (exact-ids ds (constantly true))))]
        (testing "exact top-20 = the whole restricted band + nearest core docs, nothing verified"
          (is (every? (some-fn (band-ids ds :restricted) (band-ids ds :core)) top-20))
          (is (every? top-20 (band-ids ds :restricted))))
        (testing "rare verified docs are all inside the cutoff, decoys all outside"
          (is (= (band-ids ds :rare) (set (exact-ids ds :verified))))
          (is (empty? (filter (band-ids ds :decoy) (exact-ids ds (constantly true))))))
        (testing "at least a full pool of accessible docs lies within the cutoff"
          (is (<= 20 (count (remove (band-ids ds :restricted) (exact-ids ds (constantly true)))))))
        (testing "creator parity makes a created-by filter half-selective: 10 odd-id docs in the top-20, and
                  the nearest 20 odd-id docs are 4 restricted + 16 core"
          (is (= 10 (count (filter odd? top-20))))
          (let [odd-top-20 (take 20 (exact-ids ds (comp odd? :id)))]
            (is (= 20 (count odd-top-20)))
            (is (= 4 (count (filter (band-ids ds :restricted) odd-top-20))))
            (is (= 16 (count (filter (band-ids ds :core) odd-top-20))))))))))

;;;; fixture

(def ^:private results-limit
  "The candidate-pool size every variant retrieves, well below the 300-doc dataset so nothing saturates."
  20)

(def ^:private iterative-ef-search
  "Below [[results-limit]], so the iterative strategies must run more than one scan iteration."
  16)

(defn- assert-pgvector-prereqs!
  "Fail fast unless pgvector supports iterative scans and the server ef_search default is what the naive
  :hnsw cells assume (there is deliberately no per-context ef knob for the naive strategy)."
  []
  (jdbc/with-transaction [tx (semantic.env/get-pgvector-datasource!)]
    ;; a vector op loads the extension library, which registers the hnsw.* GUCs for SHOW
    (jdbc/execute! tx ["SELECT '[1,2,3]'::vector <=> '[1,2,3]'::vector"])
    (let [version   (-> (jdbc/execute-one! tx ["SELECT extversion FROM pg_extension WHERE extname = 'vector'"])
                        vals first str)
          ef-search (-> (jdbc/execute-one! tx ["SHOW hnsw.ef_search"]) vals first)]
      (when-not (<= 0 (compare (mapv parse-long (take 2 (str/split version #"\.")))
                               [0 8]))
        (throw (ex-info "vector-strategy matrix needs pgvector >= 0.8.0 (iterative scans)"
                        {:extversion version})))
      (when-not (= "40" ef-search)
        (throw (ex-info "vector-strategy matrix assumes the stock hnsw.ef_search default"
                        {:hnsw.ef_search ef-search}))))))

(def ^:private ^:dynamic *index*
  "The semantic index the helpers below operate on; [[graph-approximation-test]] rebinds it."
  semantic.tu/mock-index)

(defn- drop-hnsw-index!
  []
  (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                 [(str "DROP INDEX IF EXISTS " (semantic.index/hnsw-index-name *index*))]))

(defn- build-hnsw-index!
  "Build the HNSW index on [[*index*]]'s table."
  []
  ;; the graph is NOT reproducible: pgvector draws node levels from the per-backend global PRNG, which
  ;; `setseed` does not touch, so every assertion against the index must hold for any random graph
  (jdbc/with-transaction [tx (semantic.env/get-pgvector-datasource!)]
    ;; serial build keeps insertion order fixed and removes worker-count variation
    (jdbc/execute! tx ["SET LOCAL max_parallel_maintenance_workers = 0"])
    ;; m/ef_construction are the current pgvector defaults, pinned against future default changes
    (jdbc/execute! tx [(format (str "CREATE INDEX %s ON %s USING hnsw (embedding vector_cosine_ops) "
                                    "WITH (m = 16, ef_construction = 64)")
                               (semantic.index/hnsw-index-name *index*)
                               (:table-name *index*))])))

(defn- do-with-matrix-fixture!
  "Run `(f dataset)` against a temp pgvector DB whose index table is populated with the matrix dataset but has
  NO HNSW index yet. `f` runs its exact cells first, then calls [[build-hnsw-index!]] for the indexed ones."
  [f]
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [semantic-search-results-limit results-limit]
      (mt/with-temp [:model/Collection {restricted-id :id} {:name "Matrix Restricted Collection"}]
        (perms/revoke-collection-permissions! (perms-group/all-users) restricted-id)
        (let [ds (make-dataset {:seed 42 :restricted-collection-id restricted-id})]
          (semantic.tu/with-mock-embeddings (:embeddings ds)
            (semantic.tu/with-test-db! {:mode :mock-initialized}
              (assert-pgvector-prereqs!)
              (drop-hnsw-index!)
              (semantic.tu/upsert-index! (:docs ds) :serial? true)
              ;; pin the stats the planner sees, so plan choice cannot vary with autoanalyze timing
              (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                             [(str "ANALYZE " (:table-name *index*))])
              (f ds))))))))

(def ^:private base-ctx
  {:search-string probe-text
   :search-engine "semantic"
   :archived?     false})

(defn- variant-ctx
  "Per-variant search-context overrides."
  [variant]
  (case variant
    ;; the :hnsw query shape run before build-hnsw-index!, to measure exact pre-index retrieval. Opt out of
    ;; the missing-index fail-fast, which production traffic gets but this baseline deliberately bypasses.
    :no-index    {:vector-search-strategy             :hnsw
                  :vector-search-allow-missing-index? true}
    :brute-force {:vector-search-strategy :brute-force}
    ;; force-index because the planner would otherwise always seq-scan a 300-row table, making every
    ;; variant silently exact
    :hnsw        {:vector-search-strategy     :hnsw
                  :vector-search-force-index? true}
    (:hnsw-iterative-relaxed :hnsw-iterative-strict)
    ;; both GUC knobs pinned so nothing depends on settings; max_scan_tuples exceeds the table so it never
    ;; binds except where a cell overrides it
    {:vector-search-strategy         variant
     :vector-search-force-index?     true
     :vector-search-ef-search        iterative-ef-search
     :vector-search-max-scan-tuples  10000}))

(defn- query-results!
  "Run the full [[semantic.index/query-index]] pipeline for `variant`.
  Returns query-index's {:results ... :raw-count ...}."
  [variant extra-ctx]
  (memoize/memo-clear! #'semantic.scoring/view-count-percentiles)
  (semantic.index/query-index (semantic.env/get-pgvector-datasource!)
                              *index*
                              (merge base-ctx
                                     {:current-user-id (mt/user->id :rasta)}
                                     (variant-ctx variant)
                                     extra-ctx)))

(defn- query-ids!
  "Ordered result ids for `variant`, through the full pipeline."
  [variant & {:as extra-ctx}]
  (mapv :id (:results (query-results! variant extra-ctx))))

;;;; if one of these tests flakes
;;
;; The HNSW graph is rebuilt randomly on every run (see [[build-hnsw-index!]] -- it cannot be seeded), so a
;; failure here is one of three things:
;;
;; 1. An EXACT matrix cell failing intermittently. These cells assert outcomes that are invariant across
;;    random graphs (each was validated against 30-60 independently built graphs on pgvector 0.8.1), so an
;;    intermittent failure means the invariance itself broke -- almost certainly a pgvector behavior change
;;    (graph build defaults, scan-phase sizing, max_scan_tuples semantics). Do not loosen the assertion
;;    blindly: re-validate with the loop below, work out which scan behavior changed, and either restore the
;;    invariant by pinning the changed parameter or convert the cell to a band derived from fresh
;;    measurements.
;; 2. A BANDED cell in [[graph-approximation-test]] failing. The edges sit several misses beyond the range
;;    observed across dozens of graphs (the observed range is noted per cell), but a rare excursion past an
;;    edge is possible. Re-derive the edges rather than nudging by one miss: run the loop below, take the
;;    min/max per cell, and set edges ~0.1-0.15 of recall beyond them. Keep upper edges strictly below 1.0;
;;    a band touching 1.0 no longer demonstrates approximation, and the fix is a harder dataset (higher
;;    dims, denser packing), not a wider band.
;; 3. A deterministic failure after an environment change (new pgvector version, changed server defaults).
;;    [[assert-pgvector-prereqs!]] catches the known dependencies on server state; extend it when a new one
;;    is discovered.
;;
;; Each test run builds a fresh graph, so re-measuring a cell's distribution is just repetition:
;;
;;   (frequencies (map (fn [_] (dissoc (clojure.test/run-test <the-deftest>) :type)) (range 30)))
;;
;; For per-cell values, evaluate the cell's recall expression inside the fixture across runs (bind an atom,
;; collect, take min/max). Beware deriving bands from raw SQL probes instead: in-pipeline recall has fatter
;; tails (an ef8-vs-ef64 margin assertion derived from SQL probes flaked within 10 in-pipeline runs).

;;;; layer 1: distance-level retrieval vs exact ground truth

(deftest distance-recall-matrix-test
  (do-with-matrix-fixture!
   (fn [ds]
     ;; isolate retrieval: weights reduce ranking to the distance rank, permission filtering is bypassed
     (semantic.tu/with-only-semantic-weights
       (mt/with-dynamic-fn-redefs [semantic.index/filter-read-permitted identity]
         (let [exact-all  (exact-ids ds (constantly true))
               exact-rare (exact-ids ds :verified)]
           (testing "without an HNSW index"
             (testing "retrieval is exact: the pool is the true top-20 in distance order"
               (is (= (take 20 exact-all) (query-ids! :no-index)))
               (is (= (take 20 exact-all) (query-ids! :brute-force))))
             (testing "but post-filtering still finds NOTHING for an anti-correlated :verified filter"
               ;; the exact global top-20 contains nothing verified, so filtering it afterwards yields zero;
               ;; only filter-first (:brute-force) retrieval is immune
               (is (= [] (query-ids! :no-index :verified true)))
               (is (= exact-rare (query-ids! :brute-force :verified true)))))
           (build-hnsw-index!)
           (testing "with the HNSW index (forced)"
             (testing "unfiltered retrieval is exact: graph approximation error does not manifest at this scale"
               ;; a 300-doc 4-d graph returns the true top-20 even at ef_search 2, so these cells pin
               ;; exactness rather than a recall band; the approximation-error axis is a scale phenomenon
               ;; and is measured by the at-scale benchmarking harness, not this matrix
               (doseq [variant [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
                 (let [ids (query-ids! variant)]
                   (testing variant
                     (is (= (take 20 exact-all) ids))
                     (is (= 1.0 (ndcg-at 20 (:id->distance ds) exact-all ids)))))))
             (testing "naive :hnsw post-filters the same global pool, so the adversarial filter finds nothing"
               ;; structural, not graph luck: the scan's top-20 would need fewer than 20 of the 262 docs
               ;; nearer than the rare band for anything verified to enter the pool
               (is (= [] (query-ids! :hnsw :verified true))))
             (testing "iterative scans pull neighbours past the filter and fully recover, in exact order"
               ;; the inner limit (20) exceeds the 12 matches, so the scan runs until the graph is exhausted
               (doseq [variant [:hnsw-iterative-relaxed :hnsw-iterative-strict]]
                 (testing variant
                   (is (= exact-rare (query-ids! variant :verified true))))))
             (testing "hnsw.max_scan_tuples truncates an iterative scan before it reaches far-away matches"
               ;; the rare band sits at distance ranks 269-280, far past a 64-tuple visit budget; the cap
               ;; has scan-phase granularity, but no phase overshoots by the ~200 tuples that would need
               (is (= [] (query-ids! :hnsw-iterative-relaxed
                                     :verified true
                                     :vector-search-max-scan-tuples 64)))))))))))

;;;; layer 2: final top results vs an exhaustive run of the same scoring pipeline

(deftest full-pipeline-recall-matrix-test
  (do-with-matrix-fixture!
   (fn [ds]
     (mt/with-dynamic-fn-redefs [semantic.index/filter-read-permitted identity]
       (testing "re-ranking: a deterministic :pinned boost promotes docs the candidate pool never contains"
         (semantic.tu/with-weights {:rrf 1 :pinned 10}
           (let [ideal      (mt/with-temporary-setting-values [semantic-search-results-limit 1000]
                              (query-ids! :brute-force))
                 ideal-top  (take 10 ideal)
                 exact-all  (exact-ids ds (constantly true))]
             (testing "the ideal top-10 is the pinned band plus the nearest docs"
               (is (= (into (band-ids ds :pinned) (take 4 exact-all))
                      (set ideal-top))))
             (testing "exact retrieval scores only its truncated pool: pinned docs sit at distance ranks 263-268"
               (is (= 0.4 (recall-at 10 ideal-top (query-ids! :no-index)))))
             (build-hnsw-index!)
             (testing "indexed retrieval is stuck at the same recall: iterating does not fix limit truncation"
               ;; the filters are non-selective here, so every variant's pool is the same exact top-20
               (doseq [variant [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
                 (testing variant
                   (is (= 0.4 (recall-at 10 ideal-top (query-ids! variant))))))))))
       (testing "under a selective filter the indexed iterative variants are strictly better end-to-end"
         (semantic.tu/with-only-semantic-weights
           (let [ideal-rare (mt/with-temporary-setting-values [semantic-search-results-limit 1000]
                              (query-ids! :brute-force :verified true))]
             (is (= 0.0 (recall-at 10 ideal-rare (query-ids! :no-index :verified true))))
             (is (= 0.0 (recall-at 10 ideal-rare (query-ids! :hnsw :verified true))))
             (doseq [variant [:hnsw-iterative-relaxed :hnsw-iterative-strict]]
               (testing variant
                 (is (= 1.0 (recall-at 10 ideal-rare (query-ids! variant :verified true)))))))))))))

;;;; layer 3: under-fetch from post-retrieval permission filtering

(deftest permission-under-fetch-matrix-test
  (do-with-matrix-fixture!
   (fn [_ds]
     (semantic.tu/with-only-semantic-weights
       (let [run! (fn [variant user & {:as extra-ctx}]
                    (mt/with-test-user user
                      (let [{:keys [results raw-count]} (query-results! variant
                                                                        (merge {:current-user-id (mt/user->id user)}
                                                                               extra-ctx))]
                        {:raw-count raw-count :returned (count results)})))]
         (testing "exact variants: the restricted band fills 8 of the 20 pool slots, then gets dropped"
           (doseq [variant [:no-index :brute-force]]
             (testing variant
               (is (= {:raw-count 20 :returned 12} (run! variant :rasta))))))
         (build-hnsw-index!)
         (testing "indexed variants under-fetch identically; iterating cannot help (the check runs in Clojure)"
           (doseq [variant [:hnsw :hnsw-iterative-relaxed :hnsw-iterative-strict]]
             (testing variant
               (is (= {:raw-count 20 :returned 12} (run! variant :rasta))))))
         (testing "an admin sees the full pool, pinning the loss on permissions rather than retrieval"
           (is (= {:raw-count 20 :returned 20} (run! :hnsw :crowberto))))
         ;; The half-selective created-by filter (odd ids -> crowberto) keeps 10 of the exact top-20
         ;; (4 restricted + 6 core). Naive :hnsw post-filters that fixed pool, so it arrives at the
         ;; permission check already halved; filter-first and iterative scans refill to a full pool of 20
         ;; (4 restricted + 16 core). Structural, not graph luck: the forced top-20 is exact at this scale.
         ;; (At scale, graph approximation can shift this either way -- missing nearby restricted docs
         ;; lessens the permission drop, missing nearby permitted docs worsens it -- so only the SQL-stage
         ;; effect is pinned here.)
         (testing "a half-selective filter compounds with permissions for the post-filtering strategy only"
           (let [created-by [(mt/user->id :crowberto)]]
             (testing "naive :hnsw under-fetches at the SQL stage, then again at the permission stage"
               (is (= {:raw-count 10 :returned 6} (run! :hnsw :rasta :created-by created-by))))
             (testing "filter-first and iterative variants under-fetch only at the permission stage"
               (doseq [variant [:brute-force :hnsw-iterative-relaxed :hnsw-iterative-strict]]
                 (testing variant
                   (is (= {:raw-count 20 :returned 16} (run! variant :rasta :created-by created-by)))))))))))))

;;;; graph approximation: a 32-d densely packed dataset where HNSW genuinely misses

;; a separate 32-d index because graph approximation error needs dimensionality, not tree size: a 4-d graph
;; stays exact even with thousands of packed fillers
(def ^:private packed-index
  "The index for [[graph-approximation-test]]'s 32-d packed dataset."
  (semantic.index/default-index {:provider "mock" :model-name "packed" :vector-dimensions 32}
                                :table-name "index_table_packed_test"))

(defn- make-packed-dataset
  "`n` filler cards packed at near-identical distances from the probe, so the true top-20 differ from any
  approximate top-20 by margins the graph cannot resolve.
  Doc ids are assigned in ascending-distance order, so the exact top-k is simply ids 1..k."
  [{:keys [seed n]}]
  (let [rng  (Random. (long seed))
        rows (mapv (fn [i]
                     {:id     (inc i)
                      :name   (format "packed card %04d" (inc i))
                      :vector (vector-at-distance rng 32 (+ 0.10 (* 2e-5 i)))})
                   (range n))]
    {:docs       (vec (for [{:keys [id name]} rows]
                        {:model           "card"
                         :id              id
                         :name            name
                         :searchable_text name
                         :embeddable_text name
                         :created_at      #t "2025-01-01T12:00:00Z"
                         :creator_id      (mt/user->id :rasta)
                         :archived        false
                         :legacy_input    {:id id :model "card" :name name}
                         :metadata        {:title name}}))
     :embeddings (into {probe-text (into [1.0] (repeat 31 0.0))} (map (juxt :name :vector)) rows)
     :exact-ids  (mapv :id rows)}))

(deftest graph-approximation-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [semantic-search-results-limit results-limit]
      (let [ds (make-packed-dataset {:seed 42 :n 2000})]
        (semantic.tu/with-mock-embeddings (:embeddings ds)
          (semantic.tu/with-test-db! {}
            (binding [*index* packed-index]
              (semantic.index/create-index-table-if-not-exists! (semantic.env/get-pgvector-datasource!)
                                                                packed-index)
              (drop-hnsw-index!)
              (semantic.tu/upsert-index! (:docs ds) :index packed-index :serial? true)
              (jdbc/execute! (semantic.env/get-pgvector-datasource!)
                             [(str "ANALYZE " (:table-name packed-index))])
              (semantic.tu/with-only-semantic-weights
                (mt/with-dynamic-fn-redefs [semantic.index/filter-read-permitted identity]
                  (let [exact-top (take 20 (:exact-ids ds))
                        recall20  (fn [variant & {:as extra-ctx}]
                                    (recall-at 20 exact-top (query-ids! variant extra-ctx)))]
                    (testing "without an index, retrieval stays exact even at 32 dims"
                      (is (= exact-top (query-ids! :no-index))))
                    (build-hnsw-index!)
                    ;; the graph differs every build, so these cells assert bands; each edge sits several
                    ;; misses beyond everything observed across dozens of independently built graphs
                    ;; (the observed range is noted per cell) -- a value at 1.0 or near 0 means the cell broke
                    (testing "naive :hnsw genuinely misses: recall@20 lands in a band strictly below 1"
                      ;; observed 0.5-0.85
                      (is (<= 0.3 (recall20 :hnsw) 0.95)))
                    (testing "iterative scans with ef_search 16 (below the limit of 20) miss more"
                      ;; observed 0.35-0.6
                      (is (<= 0.15 (recall20 :hnsw-iterative-relaxed) 0.85))
                      ;; observed 0.15-0.55, below relaxed on every graph measured: strict_order discards
                      ;; more per visit in exchange for emission order, which the outer sort makes worthless
                      ;; in this pipeline (the gap can shrink to one miss, so no cross-assertion)
                      (is (<= 0.05 (recall20 :hnsw-iterative-strict) 0.8)))
                    (testing "a saturating ef_search dials approximation away again, on the same graph"
                      (is (= exact-top (query-ids! :hnsw-iterative-relaxed
                                                   :vector-search-ef-search 200))))))))))))))
