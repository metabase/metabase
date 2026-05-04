(ns dev.ensemble-fusion-strategy
  "REPL-only A/B harness comparing tie-collapse + ROW_NUMBER (current) against
   RANK / DENSE_RANK (proposed alternative) inside the per-view-rank step of
   ensemble fusion. Both arms then run the same shipped retrieval-time
   pipeline (`overlay/score-with-overlay` → `api/dedupe-by-community` → take k),
   so the comparison surfaces only what changes when within-view ranks change.

   The current SQL pipeline (enterprise/.../similarity/views/ensemble.clj):
     base → deduped (tie_position=1)
          → ranked   (ROW_NUMBER OVER (PARTITION BY from,view ORDER BY score DESC))
          → fused    (Σ weight(v) / (k + rank))
          → final    (top-K-per-source cap, default 50)

   The alternative is one of two SQL diffs:
     a) Drop :deduped, swap ROW_NUMBER → RANK in :ranked  (gaps after ties: 1,1,1,4)
     b) Drop :deduped, swap ROW_NUMBER → DENSE_RANK         (no gaps:           1,1,1,2)

   In-memory we reproduce each by choosing a rank-assignment strategy on
   pre-sorted view rows. The math downstream (Σ w/(k+rank), cap, overlay,
   dedup) is identical, so the only thing that varies is the rank value.

   Phase 5 recall isn't built yet, so the metrics here are diagnostic, not
   deciding. They tell us:
     - whether the choice meaningfully shifts the head (top-k overlap)
     - what each arm's head is composed of (primary-view distribution)
     - how aggressive dedup has to be under each arm (shrinkage rate, distinct
       communities at the cap)
     - whether B's signal-aware representative beats A's id-asc choice when
       arms pick different cluster members (representative-quality)

   Mirrors the structure of `dev/src/dev/ensemble_rerank.clj`. Nothing here
   writes to the appdb."
  (:require
   [clojure.set :as set]
   [metabase-enterprise.similarity.api :as api]
   [metabase-enterprise.similarity.fusion :as fusion]
   [metabase-enterprise.similarity.overlay :as overlay]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; -- data load ------------------------------------------------------------

(defn- top-seed-ids
  "Top-`n` most-viewed unarchived cards. Hubs are where tie-collapse fires
   most aggressively, so they are the load-bearing population for this A/B."
  [n]
  (mapv :id
        (t2/select [:model/Card :id]
                   :archived false
                   {:order-by [[:view_count :desc]] :limit n})))

(defn- fetch-base-edges
  "Returns `{seed-id -> {view -> [{:to-id :score} ...]}}`, each view list
   already sorted score-desc. Excludes materialized `:ensemble` rows."
  [seed-ids]
  (let [rows (t2/select [:model/SimilarEdge
                         :from_entity_id :to_entity_id :view :score]
                        {:where    [:and
                                    [:= :from_entity_type "card"]
                                    [:= :to_entity_type "card"]
                                    [:in :from_entity_id seed-ids]
                                    [:not= :view "ensemble"]]
                         :order-by [[:from_entity_id]
                                    [:view]
                                    [:score :desc]]})]
    (->> rows
         (group-by :from_entity_id)
         (reduce-kv (fn [m seed seed-rows]
                      (assoc m seed
                             (reduce-kv
                              (fn [m2 v vs]
                                (assoc m2 v
                                       (mapv (fn [r] {:to-id (:to_entity_id r)
                                                      :score (double (:score r))})
                                             vs)))
                              {}
                              (group-by :view seed-rows))))
                    {}))))

;; -- rank-assignment strategies -------------------------------------------
;;
;; Each strategy takes a score-desc-sorted view list and returns rows
;; annotated with `::rank`. Arm A drops tied followers (current SQL); arms
;; B / B' keep them and assign rank via RANK / DENSE_RANK.

(defn- assign-tie-collapse-row-number
  "Arm A: SQL `ROW_NUMBER OVER (... ORDER BY to_id ASC)` filtered to
   `tie_position = 1`, then ROW_NUMBER score-desc on survivors. Per tied
   score group keep the row with lowest `:to-id` (matches `views/ensemble.clj`
   line 76's `[:order-by [[:to_entity_id]]]`)."
  [rows]
  (let [survivors (->> rows
                       (group-by :score)
                       (map (fn [[s grp]] [s (apply min-key :to-id grp)]))
                       (sort-by first >)
                       (mapv second))]
    (mapv (fn [i r] (assoc r ::rank (inc i)))
          (range)
          survivors)))

(defn- assign-row-number
  "Naive ROW_NUMBER without tie-collapse: keep all rows, ranks 1..N. Order
   among tied scores is whatever the input gave us (deterministic at the
   data-load layer via the appdb's natural row order)."
  [rows]
  (mapv (fn [i r] (assoc r ::rank (inc i)))
        (range) rows))

(defn- assign-rank
  "Arm B: SQL `RANK()`. Tied rows share rank; gaps after a tie group
   (1, 1, 1, 4)."
  [rows]
  (loop [acc [], prev-score ##NaN, prev-rank 0, idx 0, [r & more] rows]
    (if (nil? r)
      acc
      (let [s (:score r)
            rank (if (= s prev-score) prev-rank (inc idx))]
        (recur (conj acc (assoc r ::rank rank))
               s rank (inc idx) more)))))

(defn- assign-dense-rank
  "Arm B': SQL `DENSE_RANK()`. Tied rows share rank; no gaps after a tie
   group (1, 1, 1, 2)."
  [rows]
  (loop [acc [], prev-score ##NaN, prev-rank 0, [r & more] rows]
    (if (nil? r)
      acc
      (let [s (:score r)
            rank (if (= s prev-score) prev-rank (inc prev-rank))]
        (recur (conj acc (assoc r ::rank rank))
               s rank more)))))

(def ^:private strategies
  {:tie-collapse-row-number assign-tie-collapse-row-number
   :row-number              assign-row-number
   :rank                    assign-rank
   :dense-rank              assign-dense-rank})

;; -- in-memory fusion -----------------------------------------------------

(def ^:private default-cfg
  (-> (fusion/ensemble-config) (get [:card :card])))

(def ^:private default-weights (:weights default-cfg))
(def ^:private default-k (or (:k default-cfg) 60))
(def ^:private default-cap (or (:top-k-per-source default-cfg) 50))

(defn- fuse-seed
  "Run RRF over per-view rows for one seed under given strategy. Applies
   `:top-k-per-source` cap. Returns `[{:to-id :score :contributing [...]}]`
   sorted by score desc.

   Each `:contributing` entry carries `{:view :rank :weight}` so downstream
   metrics can attribute head positions to specific views."
  [seed-views {:keys [strategy k weights top-k-per-source]}]
  (let [strat-fn (strategies strategy)
        ws      (or weights default-weights)
        k       (or k default-k)
        cap     (or top-k-per-source default-cap)]
    (when-not strat-fn
      (throw (ex-info (str "Unknown strategy: " strategy)
                      {:strategy strategy :known (keys strategies)})))
    (->> seed-views
         (mapcat (fn [[view rows]]
                   (let [w (get ws view 1.0)]
                     (map #(assoc % ::view view ::weight w) (strat-fn rows)))))
         (group-by :to-id)
         (map (fn [[to-id entries]]
                {:to-id to-id
                 :score (reduce + (map (fn [e]
                                         (let [w (::weight e)
                                               r (::rank e)]
                                           (/ (double w) (double (+ k r)))))
                                       entries))
                 :contributing (mapv (fn [e]
                                       {:view   (::view e)
                                        :rank   (::rank e)
                                        :weight (::weight e)})
                                     entries)}))
         (sort-by :score >)
         (take cap)
         vec)))

;; -- arm pipeline (fusion → edge rows → overlay → dedup → take k) ---------

(defn- ->ensemble-edge
  "Synthesize a `:model/SimilarEdge`-shaped row from a fused candidate. The
   shape matches `api/load-edges` output so `overlay/score-with-overlay` and
   `api/dedupe-by-community` accept it without modification."
  [seed-id {:keys [to-id score contributing]}]
  {:from_entity_type :card
   :from_entity_id   seed-id
   :to_entity_type   :card
   :to_entity_id     to-id
   :view             :ensemble
   :score            (double score)
   ;; namespaced so overlay/dedup pass-through preserves it for metrics
   ::contributing    contributing})

(defn- arm-pipeline
  "Run one arm end-to-end for one seed. Returns
     {:pre-cap-count <int>      ; rows before top-K-per-source cap
      :post-cap-count <int>     ; rows entering the post-processing stack
      :pre-dedup <vec>          ; rows after overlay, before dedup
      :post-dedup <vec>         ; rows after dedup
      :head <vec>}              ; final top-`k` rows
   with `:fused_score`/`:overlay_multiplier` decoration applied per the
   shipped overlay path."
  [seed-id seed-views variant]
  (let [{:keys [k overlay? dedup?] :or {k 20 overlay? true dedup? true}} variant
        ;; Run uncapped and capped fusions separately so we capture both row
        ;; counts (storage-cost diagnostic). The cap is what production sees.
        uncapped-cfg (assoc variant :top-k-per-source Long/MAX_VALUE)
        uncapped     (fuse-seed seed-views uncapped-cfg)
        capped       (vec (take (or (:top-k-per-source variant) default-cap)
                                uncapped))
        edge-rows    (mapv #(->ensemble-edge seed-id %) capped)
        overlaid     (cond-> edge-rows
                       (and overlay? (seq edge-rows))
                       (overlay/score-with-overlay {}))
        deduped      (cond-> overlaid
                       (and dedup? (seq overlaid))
                       api/dedupe-by-community)
        head         (vec (take k deduped))]
    {:pre-cap-count  (count uncapped)
     :post-cap-count (count capped)
     :pre-dedup      overlaid
     :post-dedup     deduped
     :head           head}))

;; -- diagnostic metrics ---------------------------------------------------

(defn- topk-overlap-frac
  "Fraction of `to_entity_id`s shared between two head-of-list lists. 1.0 =
   identical to_id sets, 0.0 = disjoint. NB: this is set-overlap, not
   rank-aware Spearman."
  [a-head b-head]
  (let [a (set (map :to_entity_id a-head))
        b (set (map :to_entity_id b-head))
        denom (max (count a) (count b))]
    (when (pos? denom)
      (/ (double (count (set/intersection a b)))
         (double denom)))))

(defn- primary-view-of
  "Which view contributed the most weight to this fused row. Both
   `score-with-overlay` and `dedupe-by-community` `assoc` over the row,
   preserving the namespaced `::contributing` key set in `->ensemble-edge`."
  [{::keys [contributing]} k]
  (when (seq contributing)
    (->> contributing
         (apply max-key
                (fn [{:keys [rank weight]}]
                  (/ (double weight) (double (+ k rank)))))
         :view)))

(defn- primary-view-distribution
  "Histogram of primary-view across head rows. Returns a sorted seq of
   `{:view :count :pct}` rows."
  [head k]
  (let [n (count head)
        counts (->> head
                    (keep (fn [r] (primary-view-of r k)))
                    frequencies)]
    (->> counts
         (map (fn [[v c]]
                {:view v
                 :count c
                 :pct (if (pos? n) (/ (double c) n) 0.0)}))
         (sort-by :count >)
         vec)))

(defn- shrinkage-rate
  "Fraction of `pre-dedup` rows the dedup pass eliminated. 0.0 = nothing
   collapsed; higher = more cluster duplicates were sitting in the cap."
  [pre-dedup post-dedup]
  (let [n (count pre-dedup)]
    (when (pos? n)
      (- 1.0 (/ (double (count post-dedup)) n)))))

(defn- load-card-communities
  "One-shot lookup of community membership for the given card ids. Mirrors
   `api/load-communities` for `:card` only. Returns `{card-id -> {:scope
   :community-id :centrality}}`."
  [card-ids]
  (when (seq card-ids)
    (let [rows (t2/select :model/SimilarityCommunity
                          :scope       "card"
                          :entity_type "card"
                          :entity_id   [:in (vec card-ids)])]
      (into {}
            (map (fn [r]
                   [(:entity_id r) {:scope        (:scope r)
                                    :community-id (:community_id r)
                                    :centrality   (:centrality r)}]))
            rows))))

(defn- distinct-community-count
  "How many distinct (scope, community-id) pairs the cap-of-50 candidates
   span. Higher = more diverse pool entering the dedup pass. Cards with no
   community row each count as their own pseudo-community."
  [candidates community-by-id]
  (let [communities (->> candidates
                         (map (fn [{:keys [to_entity_id] :as row}]
                                (if-let [c (community-by-id to_entity_id)]
                                  [(:scope c) (:community-id c)]
                                  [::singleton (:to_entity_id row)])))
                         set)]
    (count communities)))

(defn- representative-comparison
  "For each community present in either A's or B's head, compare the chosen
   representative. Returns counts:
     :both-same        — same to_entity_id picked
     :both-differ      — different members; A's pick had higher overlay multiplier
     :both-differ-b    — different members; B's pick had higher multiplier
     :both-differ-tie  — different members; equal multiplier (within 1e-9)
     :only-a / :only-b — community appears in only one arm's head
     :no-community     — head row had no community row at all (singletons)"
  [a-head b-head community-by-id]
  (letfn [(by-community [head]
            (->> head
                 (group-by (fn [r] (some-> r :to_entity_id community-by-id :community-id)))
                 (reduce-kv (fn [m k v]
                              (if (some? k)
                                (assoc m k (first v))
                                m))
                            {})))]
    (let [a-by (by-community a-head)
          b-by (by-community b-head)
          a-no-comm (count (filter #(nil? (community-by-id (:to_entity_id %))) a-head))
          b-no-comm (count (filter #(nil? (community-by-id (:to_entity_id %))) b-head))
          all-comms (set/union (set (keys a-by)) (set (keys b-by)))]
      (reduce
       (fn [acc comm-id]
         (let [a (a-by comm-id)
               b (b-by comm-id)]
           (cond
             (and a b (= (:to_entity_id a) (:to_entity_id b)))
             (update acc :both-same (fnil inc 0))

             (and a b)
             (let [am (or (:overlay_multiplier a) 1.0)
                   bm (or (:overlay_multiplier b) 1.0)]
               (cond
                 (< (Math/abs (- am bm)) 1e-9) (update acc :both-differ-tie (fnil inc 0))
                 (> am bm)                     (update acc :both-differ-a   (fnil inc 0))
                 :else                         (update acc :both-differ-b   (fnil inc 0))))

             a (update acc :only-a (fnil inc 0))
             b (update acc :only-b (fnil inc 0))
             :else acc)))
       {:no-community-a a-no-comm
        :no-community-b b-no-comm}
       all-comms))))

;; -- experiment runner ----------------------------------------------------

(def ^:private default-variants
  [{:label    "A: tie-collapse (current)"
    :strategy :tie-collapse-row-number
    :overlay? true :dedup? true}
   {:label    "B: RANK"
    :strategy :rank
    :overlay? true :dedup? true}
   {:label    "B': DENSE_RANK"
    :strategy :dense-rank
    :overlay? true :dedup? true}])

(defn- mean [xs]
  (when (seq xs) (/ (double (reduce + xs)) (count xs))))

(defn- median [xs]
  (when (seq xs)
    (let [s (vec (sort xs))
          n (count s)]
      (nth s (quot n 2)))))

(defn- aggregate-arm-stats
  "Reduce per-seed arm-pipeline outputs into headline numbers."
  [results-by-seed]
  (let [pre-cap   (mapv :pre-cap-count results-by-seed)
        post-cap  (mapv :post-cap-count results-by-seed)
        shrinkage (->> results-by-seed
                       (keep (fn [{:keys [pre-dedup post-dedup]}]
                               (shrinkage-rate pre-dedup post-dedup))))
        head-sizes (mapv #(count (:head %)) results-by-seed)]
    {:n             (count results-by-seed)
     :pre-cap-mean  (mean pre-cap)
     :post-cap-mean (mean post-cap)
     :head-mean     (mean head-sizes)
     :head-median   (median head-sizes)
     :shrinkage-mean (mean shrinkage)}))

(defn- run-variant
  [edges-by-seed community-by-id variant]
  (->> edges-by-seed
       (reduce-kv
        (fn [m seed seed-views]
          (let [arm (arm-pipeline seed seed-views variant)]
            (assoc m seed
                   (assoc arm
                          :primary-view-dist
                          (primary-view-distribution (:head arm) (:k variant default-k))
                          :pre-cap-distinct-communities
                          (distinct-community-count (:pre-dedup arm) community-by-id)))))
        {})))

(defn- compare-arms
  "Compute pairwise diagnostics: top-k overlap and representative-quality of
   `variant-results` against `baseline-results`. Both are
   `{seed-id -> arm-output-map}`."
  [baseline-results variant-results community-by-id]
  (let [overlaps (->> baseline-results
                      (keep (fn [[seed a]]
                              (when-let [b (variant-results seed)]
                                (topk-overlap-frac (:head a) (:head b))))))
        rep-cmps (->> baseline-results
                      (mapv (fn [[seed a]]
                              (when-let [b (variant-results seed)]
                                (representative-comparison
                                 (:head a) (:head b) community-by-id)))))
        ;; Sum up counts across seeds
        rep-totals (reduce
                    (fn [acc m]
                      (if m (merge-with + acc m) acc))
                    {}
                    rep-cmps)]
    {:overlap-mean   (mean overlaps)
     :overlap-median (median overlaps)
     :rep-totals     rep-totals}))

(defn- print-variant-row
  [{:keys [label]} agg overlap-stats]
  (let [pct #(if % (format "%5.1f%%" (* 100.0 %)) "  --  ")
        fmt-num #(if % (format "%6.1f" (double %)) "  -- ")]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println
     (format "  %-30s  pre-cap=%-6s  post-cap=%-5s  head=%-5s  shrink=%-7s  overlap_vs_A=%-7s"
             label
             (fmt-num (:pre-cap-mean agg))
             (fmt-num (:post-cap-mean agg))
             (fmt-num (:head-mean agg))
             (pct (:shrinkage-mean agg))
             (pct (:overlap-mean overlap-stats))))))

(defn- print-primary-view-table
  [variant variant-results]
  (let [all-rows (mapcat :primary-view-dist (vals variant-results))
        agg      (->> all-rows
                      (group-by :view)
                      (map (fn [[v rows]]
                             {:view  v
                              :count (reduce + (map :count rows))}))
                      (sort-by :count >))
        total    (reduce + (map :count agg))]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "  primary-view distribution under %s (n=%d head positions)"
                     (:label variant) total))
    (doseq [{:keys [view count]} agg]
      #_{:clj-kondo/ignore [:discouraged-var]}
      (println (format "    %-26s  %5d  (%5.1f%%)"
                       (str view) count
                       (if (pos? total) (* 100.0 (/ (double count) total)) 0.0))))))

(defn- print-rep-comparison
  [{:keys [label]} {:keys [rep-totals]}]
  (let [g #(or (get rep-totals %) 0)]
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "  representative comparison: %s vs A" label))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    same community + same pick:        %d" (g :both-same)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    same community, A higher overlay:  %d" (g :both-differ-a)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    same community, B higher overlay:  %d" (g :both-differ-b)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    same community, tied overlay:      %d" (g :both-differ-tie)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    community surfaced only by A:      %d" (g :only-a)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    community surfaced only by B:      %d" (g :only-b)))
    #_{:clj-kondo/ignore [:discouraged-var]}
    (println (format "    no-community head rows (A / B):    %d / %d"
                     (g :no-community-a) (g :no-community-b)))))

(defn run-comparison
  "Pull base edges for the top-`n` most-viewed cards once, run each variant
   through the full pipeline, print a side-by-side comparison table, and
   return the raw per-variant results.

   Options:
     :n         number of seeds (default 200)
     :variants  vector of variant maps; each must have :label, :strategy, and
                may set :overlay?, :dedup?, :k, :weights, :top-k-per-source.
                Defaults to A (tie-collapse) vs B (RANK) vs B' (DENSE_RANK),
                all with overlay+dedup on. The first variant is the baseline
                that overlap and representative-quality are measured against.

   Returns:
     {:seeds <vec>
      :variants <vec of {:variant :results :agg :vs-baseline}>}"
  ([] (run-comparison {}))
  ([{:keys [n variants] :or {n 200 variants default-variants}}]
   (let [say #_{:clj-kondo/ignore [:discouraged-var]} println
         seeds            (top-seed-ids n)
         _                (say (format "Loaded %d seeds; pulling per-view edges..." (count seeds)))
         edges            (fetch-base-edges seeds)
         all-to-ids       (->> edges
                               vals
                               (mapcat vals)
                               (mapcat #(map :to-id %))
                               set)
         _                (say (format "Loaded %d distinct candidate to-ids; loading communities..."
                                       (count all-to-ids)))
         community-by-id  (load-card-communities all-to-ids)
         _                (say (format "Loaded %d card-community rows. Running %d variants..."
                                       (count community-by-id) (count variants)))
         variant-runs     (mapv (fn [variant]
                                  (let [results (run-variant edges community-by-id variant)
                                        agg     (aggregate-arm-stats (vals results))]
                                    {:variant variant
                                     :results results
                                     :agg     agg}))
                                variants)
         baseline         (first variant-runs)
         decorated        (mapv (fn [{:keys [results] :as run}]
                                  (assoc run :vs-baseline
                                         (compare-arms (:results baseline) results community-by-id)))
                                variant-runs)]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "")
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "  variant                         pre-cap        post-cap     head     shrinkage  overlap_vs_A")
     (doseq [{:keys [variant agg vs-baseline]} decorated]
       (print-variant-row variant agg vs-baseline))
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "")
     (doseq [{:keys [variant results]} decorated]
       (print-primary-view-table variant results)
       #_{:clj-kondo/ignore [:discouraged-var]}
       (println ""))
     (doseq [{:keys [variant vs-baseline]} (rest decorated)]
       (print-rep-comparison variant vs-baseline)
       #_{:clj-kondo/ignore [:discouraged-var]}
       (println ""))
     {:seeds seeds :variants decorated})))

(comment
  ;; Default sweep — A vs B vs B', all with overlay+dedup
  (run-comparison)

  ;; Smaller smoke run
  (run-comparison {:n 10})

  ;; Ablation: turn off overlay+dedup so we see raw fusion-only differences
  (run-comparison
   {:n 100
    :variants [{:label "A: tie-collapse, raw" :strategy :tie-collapse-row-number
                :overlay? false :dedup? false}
               {:label "B: RANK, raw"         :strategy :rank
                :overlay? false :dedup? false}
               {:label "B': DENSE_RANK, raw"  :strategy :dense-rank
                :overlay? false :dedup? false}]})

  ;; Cap sweep — does B's storage cost stay manageable at higher caps?
  (run-comparison
   {:n 50
    :variants [{:label "A cap=50"   :strategy :tie-collapse-row-number}
               {:label "B cap=50"   :strategy :rank}
               {:label "B cap=100"  :strategy :rank :top-k-per-source 100}
               {:label "B cap=200"  :strategy :rank :top-k-per-source 200}]})

  ;; Strategy sanity check on a handcrafted fixture
  (assign-tie-collapse-row-number
   [{:to-id 100 :score 1.0} {:to-id 101 :score 1.0} {:to-id 102 :score 1.0}
    {:to-id 200 :score 0.5}])
  ;; => [{:to-id 100 :score 1.0 ::rank 1} {:to-id 200 :score 0.5 ::rank 2}]

  (assign-rank
   [{:to-id 100 :score 1.0} {:to-id 101 :score 1.0} {:to-id 102 :score 1.0}
    {:to-id 200 :score 0.5}])
  ;; => all three at ::rank 1, then 200 at ::rank 4

  (assign-dense-rank
   [{:to-id 100 :score 1.0} {:to-id 101 :score 1.0} {:to-id 102 :score 1.0}
    {:to-id 200 :score 0.5}])
  ;; => all three at ::rank 1, then 200 at ::rank 2
  )
