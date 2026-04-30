(ns metabase-enterprise.similarity.runner
  "Per-view batch runner for similarity scorers.

   Each `run-view!` call is a full rebuild: open a transaction, mark the view
   `:running`, delete its prior rows, recompute, mark `:ok` on success or
   `:error` on failure. Tracing/metrics and Quartz scheduling land in Phase 10."
  (:require
   [metabase-enterprise.similarity.models.similar-edge-status :as similar-edge-status]
   [metabase-enterprise.similarity.scorer :as scorer]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- assert-registered! [view-name]
  (when-not (scorer/lookup view-name)
    (throw (ex-info "No scorer registered for view"
                    {:view view-name
                     :registered (scorer/registered-views)}))))

(defn run-view!
  "Full-rebuild a single view: delete its rows, recompute, and update status.
   Returns `{:view ..., :inserted N, :duration-ms M, :status :ok|:error
   [:skipped? true :skip-reason ... :metrics ...]}`.

   When the view registers a `:density-check`, it runs *before* the rebuild
   transaction. A failing gate short-circuits to `:skipped` — no transient
   `:running` state, no `delete!` of prior rows, last-good edges survive.
   Result map carries `:status :ok :skipped? true` so callers branching on
   success-vs-error don't need to special-case skips.

   On the pass path, `mark-running!` runs outside the transaction so a failed
   compute leaves the status row showing `:error` rather than rolling back to
   its prior state. `delete!` + `compute!` together inside the transaction
   form the atomic swap — if `compute!` throws, the prior view edges are
   preserved."
  [view-name & {:keys [batch-size] :or {batch-size 500}}]
  (assert-registered! view-name)
  (let [view-def      (scorer/lookup view-name)
        density-check (or (:density-check view-def) (constantly {:passed? true}))
        timer         (u/start-timer)]
    (try
      (let [probe (density-check {})]
        (if (:passed? probe)
          (let [compute-opts (merge {:batch-size batch-size} (:compute-opts probe))]
            (similar-edge-status/mark-running! view-name)
            (let [inserted (t2/with-transaction [_]
                             (t2/delete! :model/SimilarEdge :view view-name)
                             ((:compute! view-def) compute-opts))]
              (similar-edge-status/mark-ok! view-name)
              (let [dur (u/since-ms timer)]
                (log/infof "Similarity view %s: rebuilt %d edges in %.0f ms"
                           view-name inserted dur)
                {:view view-name :inserted inserted :duration-ms dur :status :ok})))
          (let [reason  (:reason probe "density gate failed")
                metrics (:metrics probe {})]
            (similar-edge-status/mark-skipped! view-name reason)
            (log/infof "Similarity view %s: density gate failed, skipping. reason=%s metrics=%s"
                       view-name reason metrics)
            {:view        view-name
             :inserted    0
             :duration-ms (u/since-ms timer)
             :status      :ok
             :skipped?    true
             :skip-reason reason
             :metrics     metrics})))
      (catch Throwable t
        (similar-edge-status/record-error! view-name t)
        (log/errorf t "Similarity view %s failed" view-name)
        {:view view-name
         :inserted 0
         :duration-ms (u/since-ms timer)
         :status :error
         :error (.getMessage t)}))))

(defn- views-by-phase
  "Group registered views by `:phase`. Views without an explicit `:phase`
   default to `:base`. Returns `{:base [view-name ...] :fusion [view-name ...]}`."
  []
  (->> (scorer/all-views)
       (group-by (fn [[_ view-def]] (:phase view-def :base)))
       (reduce-kv (fn [acc phase entries]
                    (assoc acc phase (mapv first entries)))
                  {})))

(defn run-all-views!
  "Run every registered view, base phase before fusion phase. Returns a vector
   of per-view result maps in execution order. Fusion-phase views read from
   the rows that base-phase views just produced, so ordering matters."
  [& {:keys [batch-size] :or {batch-size 500}}]
  (let [{:keys [base fusion]} (views-by-phase)]
    (into (mapv #(run-view! % :batch-size batch-size) base)
          (mapv #(run-view! % :batch-size batch-size) fusion))))

(defn run-everything!
  "Composite full rebuild: views (base → fusion) then graph jobs (PageRank →
   Louvain). Returns a vector of per-step result maps in execution order.

   The `require`/`resolve` indirection on `graph.runner/run-all!` keeps this
   namespace free of a hard reference to the graph runner so the cycle
   `runner ↔ graph.runner` (which transitively share `models.similar-edge-
   status`) stays compile-clean. `init.clj` always loads `graph.runner`, so
   the resolve never returns nil at runtime."
  [& {:keys [batch-size] :or {batch-size 500}}]
  (require 'metabase-enterprise.similarity.graph.runner)
  (let [graph-run-all! (resolve 'metabase-enterprise.similarity.graph.runner/run-all!)]
    (into (run-all-views! :batch-size batch-size)
          (graph-run-all!))))
