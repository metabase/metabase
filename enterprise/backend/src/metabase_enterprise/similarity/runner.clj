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
   Returns `{:view ..., :inserted N, :duration-ms M, :status :ok|:error}`.

   `mark-running!` runs outside the transaction so a failed compute leaves the
   status row showing `:error` rather than rolling back to its prior state.
   `delete!` + `compute!` together inside the transaction form the atomic swap
   — if `compute!` throws, the prior view edges are preserved."
  [view-name & {:keys [batch-size] :or {batch-size 500}}]
  (assert-registered! view-name)
  (let [view-def (scorer/lookup view-name)
        timer    (u/start-timer)]
    (try
      (similar-edge-status/mark-running! view-name)
      (let [inserted (t2/with-transaction [_]
                       (t2/delete! :model/SimilarEdge :view view-name)
                       ((:compute! view-def) {:batch-size batch-size}))]
        (similar-edge-status/mark-ok! view-name)
        (let [dur (u/since-ms timer)]
          (log/infof "Similarity view %s: rebuilt %d edges in %.0f ms"
                     view-name inserted dur)
          {:view view-name :inserted inserted :duration-ms dur :status :ok}))
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
