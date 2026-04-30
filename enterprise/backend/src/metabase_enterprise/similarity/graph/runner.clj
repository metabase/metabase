(ns metabase-enterprise.similarity.graph.runner
  "Per-job runner for Phase 8 graph algorithms.

   Mirrors the lifecycle of `metabase-enterprise.similarity.runner/run-view!`
   but writes to `similarity_pagerank` and `similarity_community`. Status keys
   share the existing `similar_edge_status` table — its `view varchar(60)`
   column accepts arbitrary keyword job names. PR jobs are 4 (`:pagerank-full`,
   `:pagerank-card`, `:pagerank-dashboard`, `:pagerank-table`) and Louvain
   jobs are 3 (`:louvain-card`, `:louvain-dashboard`, `:louvain-table` —
   communities are per-type only).

   Atomic swap: `delete!` filtered by scope + `insert!` happen inside one
   transaction. Compute (PR / Louvain) runs JVM-side outside the transaction,
   keeping the transaction window short. `mark-running!` fires before
   compute starts and outside the txn so a failed compute leaves an `:error`
   status row rather than rolling back to its prior state."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.graph.edge-loader :as edge-loader]
   [metabase-enterprise.similarity.graph.louvain :as louvain]
   [metabase-enterprise.similarity.graph.pagerank :as pagerank]
   [metabase-enterprise.similarity.models.similar-edge-status :as ses]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def jobs
  "Static graph-job registry. Each entry: status-key → {:scope ... :kind ...}.
   `:scope` is the per-type (or `:full`) filter on `view='ensemble'` rows;
   `:kind` selects the compute path. Public so REPL callers and tests can
   list available jobs."
  {:pagerank-full      {:scope :full      :kind :pagerank}
   :pagerank-card      {:scope :card      :kind :pagerank}
   :pagerank-dashboard {:scope :dashboard :kind :pagerank}
   :pagerank-table     {:scope :table     :kind :pagerank}
   :louvain-card       {:scope :card      :kind :louvain}
   :louvain-dashboard  {:scope :dashboard :kind :louvain}
   :louvain-table      {:scope :table     :kind :louvain}})

(def ^:private insert-batch-size
  "Per-batch row count for `t2/insert!`. Postgres caps a prepared statement
   at 65,535 parameters; at 6-7 columns per row, 500 keeps us well under
   that ceiling. Mirrors `views/ensemble.clj`'s default."
  500)

(defn- insert-batched!
  [model rows]
  (doseq [batch (partition-all insert-batch-size rows)]
    (t2/insert! model batch)))

(defn- run-pagerank! [{:keys [scope]}]
  (let [reducible (edge-loader/load-directed-edges {:scope scope})
        graph     (pagerank/build-graph reducible scope)
        result    (pagerank/pagerank graph)
        rows      (pagerank/ranked-rows (:scores result) scope (t/offset-date-time))
        n         (count rows)]
    (t2/with-transaction [_]
      (t2/delete! :model/SimilarityPagerank :scope (name scope))
      (when (pos? n)
        (insert-batched! :model/SimilarityPagerank rows)))
    {:inserted   n
     :iterations (:iterations result)
     :converged? (:converged? result)}))

(defn- run-louvain! [{:keys [scope]}]
  (let [reducible (edge-loader/load-undirected-edges {:scope scope})
        graph     (louvain/build-graph reducible)
        {:keys [partition modularity iterations]} (louvain/louvain graph)
        centrality (louvain/within-community-pagerank graph partition)
        rows      (louvain/community-rows partition centrality scope
                                          (t/offset-date-time))
        n         (count rows)
        n-comm    (count (set (vals partition)))]
    (t2/with-transaction [_]
      (t2/delete! :model/SimilarityCommunity :scope (name scope))
      (when (pos? n)
        (insert-batched! :model/SimilarityCommunity rows)))
    {:inserted      n
     :modularity    modularity
     :iterations    iterations
     :n-communities n-comm}))

(defn run-job!
  "Run a single graph job: mark-running, compute outside the transaction,
   atomically delete + insert inside one transaction, mark-ok / record-error.
   Returns `{:job ... :status :ok|:error :inserted N :duration-ms M ...}`."
  [job-name]
  (when-not (contains? jobs job-name)
    (throw (ex-info "Unknown graph job"
                    {:job job-name :registered (vec (sort (keys jobs)))})))
  (let [{:keys [kind] :as job} (get jobs job-name)
        timer                  (u/start-timer)]
    (ses/mark-running! job-name)
    (try
      (let [extra (case kind
                    :pagerank (run-pagerank! job)
                    :louvain  (run-louvain! job))
            dur   (u/since-ms timer)]
        (ses/mark-ok! job-name)
        (log/infof "Similarity graph job %s: rebuilt in %.0f ms (%s)"
                   job-name dur (pr-str (dissoc extra :inserted)))
        (merge {:job job-name :status :ok :duration-ms dur} extra))
      (catch Throwable t
        (ses/record-error! job-name t)
        (log/errorf t "Similarity graph job %s failed" job-name)
        {:job         job-name
         :inserted    0
         :duration-ms (u/since-ms timer)
         :status      :error
         :error       (.getMessage t)}))))

(defn run-all!
  "Run every registered graph job, PageRank first then Louvain. Returns a
   vector of per-job result maps in execution order."
  [& _opts]
  (let [job-names (keys jobs)
        order     (concat (filter #(= :pagerank (:kind (jobs %))) job-names)
                          (filter #(= :louvain  (:kind (jobs %))) job-names))]
    (mapv run-job! order)))
