(ns dev.ensemble-rerank
  "REPL-only experiment: re-fuse the existing per-view `similar_edge` rows under
   alternate rank-assignment strategies and `k` values, without touching the
   materialized ensemble. Used to evaluate whether tie collapse / tie penalty /
   lower-k would surface title-desc-ebr (and other low-weight views) into the
   visible head of the ensemble.

   Entry point: `(run-experiment)` — pulls the top-200 most-viewed cards' base
   edges once, then evaluates several variants and prints a comparison table.

   Nothing here writes to the appdb."
  (:require
   [metabase-enterprise.similarity.fusion :as fusion]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;; -- data load ------------------------------------------------------------

(defn- top-seed-ids
  "Top-`n` most-viewed unarchived cards — same population the diagnostics used."
  [n]
  (mapv :id
        (t2/select [:model/Card :id]
                   :archived false
                   {:order-by [[:view_count :desc]] :limit n})))

(defn- fetch-base-edges
  "Returns `{seed-id -> {view -> [{:to-id :score} ...]}}` with each view list
   already sorted by score desc. Excludes the materialized `:ensemble` rows."
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

(defn- ebr-top1
  "For each seed, the `:to-id` with highest title-desc-ebr score (or nil)."
  [edges]
  (reduce-kv (fn [m seed views]
               (if-let [first-row (first (get views :title-desc-ebr))]
                 (assoc m seed (:to-id first-row))
                 m))
             {}
             edges))

;; -- rank-assignment strategies -------------------------------------------
;;
;; Each strategy takes a score-desc-sorted view list and returns the same rows
;; annotated with `::rank` (1-based) and `::tie-scale` (multiplier on the RRF
;; contribution). Baseline is `:row-number` with tie-scale = 1.

(defn- assign-row-number [rows]
  (mapv (fn [i r] (assoc r ::rank (inc i) ::tie-scale 1.0))
        (range)
        rows))

(defn- assign-tie-collapse
  "Only the first row of each tied-score group keeps a contribution; tied
   followers get tie-scale 0. Equivalent to deduping by score within the view
   before fusing — 11 score=1.0 edges become a single endorsement."
  [rows]
  (loop [acc [], prev-score ##NaN, [r & more] rows, idx 0]
    (if (nil? r)
      acc
      (let [s (:score r)
            tied? (= s prev-score)
            scale (if tied? 0.0 1.0)]
        (recur (conj acc (assoc r ::rank (inc idx) ::tie-scale scale))
               s more (inc idx))))))

(defn- assign-tie-penalty-sqrt
  "Each row's contribution scaled by 1/sqrt(tie-group-size). 11 tied edges each
   contribute weight/(k+rank)/sqrt(11) — total tie-group contribution shrinks
   from ~11x to ~sqrt(11)x. Preserves multi-view reinforcement when the tied
   neighbors also appear in other views."
  [rows]
  (let [tie-sizes (->> rows (group-by :score) (map (fn [[s xs]] [s (count xs)])) (into {}))]
    (mapv (fn [i r]
            (let [size (get tie-sizes (:score r) 1)]
              (assoc r ::rank (inc i) ::tie-scale (/ 1.0 (Math/sqrt (double size))))))
          (range)
          rows)))

(def ^:private strategies
  {:row-number       assign-row-number
   :tie-collapse     assign-tie-collapse
   :tie-penalty-sqrt assign-tie-penalty-sqrt})

;; -- in-memory fusion -----------------------------------------------------

(def ^:private default-weights
  (-> (fusion/ensemble-config) (get [:card :card]) :weights))

(defn- fuse-seed
  "Returns sorted `[{:to-id :score} ...]` for one seed under the given variant."
  [seed-views {:keys [strategy k weights]}]
  (let [strat-fn (strategies strategy)
        ws      (or weights default-weights)]
    (->> seed-views
         (mapcat (fn [[view rows]]
                   (map #(assoc % ::view view) (strat-fn rows))))
         (group-by :to-id)
         (map (fn [[to-id entries]]
                {:to-id to-id
                 :score (reduce + (map (fn [{::keys [view rank tie-scale]}]
                                         (let [w (get ws view 1.0)]
                                           (* w tie-scale (/ 1.0 (+ k rank)))))
                                       entries))}))
         (sort-by :score >)
         vec)))

(defn- ensemble-rank-of
  "1-based rank of `target-to-id` in the fused list, or nil if missing."
  [fused target-to-id]
  (some (fn [[i row]]
          (when (= (:to-id row) target-to-id) (inc i)))
        (map-indexed vector fused)))

;; -- experiment runner ----------------------------------------------------

(defn- variant-stats
  "For one variant, compute the histogram of ensemble ranks of EBR-top-1
   across all seeds that have an EBR top-1."
  [edges-by-seed ebr-top1-by-seed variant]
  (let [ranks (->> ebr-top1-by-seed
                   (keep (fn [[seed target]]
                           (when-let [views (get edges-by-seed seed)]
                             (ensemble-rank-of (fuse-seed views variant) target)))))
        n     (count ranks)
        bucket (fn [pred] (count (filter pred ranks)))]
    {:variant   variant
     :n-seeds   n
     :median    (when (pos? n) (nth (sort ranks) (quot n 2)))
     :mean      (when (pos? n) (/ (double (reduce + ranks)) n))
     :top-1     (bucket #(= % 1))
     :top-5     (bucket #(<= % 5))
     :top-15    (bucket #(<= % 15))
     :top-30    (bucket #(<= % 30))
     :missing   (- (count ebr-top1-by-seed) n)}))

(def ^:private default-variants
  [{:label "baseline (current)"           :strategy :row-number       :k 60}
   {:label "lower k=20"                   :strategy :row-number       :k 20}
   {:label "lower k=10"                   :strategy :row-number       :k 10}
   {:label "tie-collapse, k=60"           :strategy :tie-collapse     :k 60}
   {:label "tie-collapse + k=20"          :strategy :tie-collapse     :k 20}
   {:label "tie-penalty sqrt, k=60"       :strategy :tie-penalty-sqrt :k 60}
   {:label "tie-penalty sqrt + k=20"      :strategy :tie-penalty-sqrt :k 20}])

(defn- fmt-row [{:keys [variant n-seeds median mean top-1 top-5 top-15 top-30]}]
  (let [pct #(format "%5.1f%%" (* 100.0 (/ (double %) n-seeds)))]
    (format "  %-28s  median=%-4s  mean=%-5s  top1=%-6s  top5=%-6s  top15=%-6s  top30=%-6s"
            (:label variant)
            (str median)
            (format "%.1f" mean)
            (pct top-1) (pct top-5) (pct top-15) (pct top-30))))

(defn run-experiment
  "Pull the top-`n` most-viewed seeds' base edges once, then evaluate each
   variant in `variants`. Prints a side-by-side table of the EBR-top-1
   ensemble-rank distribution.

   Options:
     :n         number of seeds (default 200)
     :variants  vector of `{:label :strategy :k [:weights]}` maps. Defaults to
                a 7-variant sweep covering baseline, lower-k, tie-collapse, and
                tie-penalty-sqrt.

   Returns the seq of stats maps so callers can post-process."
  ([] (run-experiment {}))
  ([{:keys [n variants] :or {n 200, variants default-variants}}]
   (let [seeds   (top-seed-ids n)
         edges   (fetch-base-edges seeds)
         ebr-t1  (ebr-top1 edges)
         results (mapv (partial variant-stats edges ebr-t1) variants)]
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println (format "Seeds=%d  with-EBR=%d  (rest have no title-desc-ebr rows for the seed)"
                      n (count ebr-t1)))
     #_{:clj-kondo/ignore [:discouraged-var]}
     (println "  variant                       ensemble rank of EBR top-1 across seeds")
     (doseq [r results]
       #_{:clj-kondo/ignore [:discouraged-var]}
       (println (fmt-row r)))
     results)))

(comment
  ;; Run with defaults
  (run-experiment)

  ;; Single custom variant — useful for sweeping `k` finely
  (run-experiment {:variants [{:label "k=5"  :strategy :row-number :k 5}
                              {:label "k=15" :strategy :row-number :k 15}]})

  ;; Custom weights — e.g. boost EBR
  (run-experiment {:variants [{:label "ebr-w=2.0"
                               :strategy :row-number :k 60
                               :weights {:direct-dependency 1.5
                                         :co-dashboard 1.2
                                         :title-desc-ebr 2.0}}]}))
