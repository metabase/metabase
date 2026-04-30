(ns metabase-enterprise.similarity.graph.edge-loader
  "Streaming edge loaders for Phase 8 graph algorithms.

   PageRank and Louvain both consume the materialized `view='ensemble'` rows
   from `similar_edge`. They want different shapes and filters:

   - PageRank wants the unfiltered directed graph — popular destinations are
     the whole point. `load-directed-edges` defaults `:min-score` to 0 and
     leaves `:top-k-target` nil.
   - Louvain wants a tamed undirected graph: parallel edges A→B / B→A summed,
     hubs capped via per-target top-K, weak tail trimmed via a min-score
     floor. Without these, hub bridges fuse otherwise-separate clusters into
     one mega-community.

   Postgres-targeted. The CTE chain stacks `:base` + `:ranked` window-bearing
   queries, which can return zero rows on H2's planner (same caveat that bites
   `views/ensemble.clj`). Tests are gated on `(= :postgres (mdb/db-type))`."
  (:require
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- scope-clause
  "Build the where-clause fragment that restricts `similar_edge` rows to a
   scope. `:full` returns nil so callers can splice without a false branch."
  [scope]
  (case scope
    :full      nil
    :card      [:and
                [:= :from_entity_type "card"]
                [:= :to_entity_type   "card"]]
    :dashboard [:and
                [:= :from_entity_type "dashboard"]
                [:= :to_entity_type   "dashboard"]]
    :table     [:and
                [:= :from_entity_type "table"]
                [:= :to_entity_type   "table"]]))

(defn- base-cte
  "Inner SELECT over `similar_edge` filtered to `view='ensemble'`, the scope,
   and the score floor."
  [scope min-score]
  (let [where (cond-> [:and
                       [:= :view "ensemble"]
                       [:>= :score [:inline (double (or min-score 0.0))]]]
                (scope-clause scope) (conj (scope-clause scope)))]
    {:select [:from_entity_type :from_entity_id
              :to_entity_type   :to_entity_id
              :score]
     :from   [:similar_edge]
     :where  where}))

(defn directed-edges-query
  "Returns a HoneySQL query streaming directed ensemble edges for PageRank.

   When `:top-k-target` is nil (the PR default), skip the ranked CTE and
   select the base directly — preserves the unfiltered tail. When non-nil,
   apply an in-degree cap via `ROW_NUMBER() OVER (PARTITION BY to_entity_*)`."
  [{:keys [scope min-score top-k-target]}]
  (if (nil? top-k-target)
    (base-cte scope min-score)
    {:with   [[:base (base-cte scope min-score)]
              [:ranked
               {:select [:from_entity_type :from_entity_id
                         :to_entity_type   :to_entity_id
                         :score
                         [[:over [[:row_number]
                                  {:partition-by [:to_entity_type :to_entity_id]
                                   :order-by     [[:score :desc]]}]]
                          :in_rank]]
                :from   [:base]}]]
     :select [:from_entity_type :from_entity_id
              :to_entity_type   :to_entity_id
              :score]
     :from   [:ranked]
     :where  [:<= :in_rank [:inline (long top-k-target)]]}))

(defn undirected-edges-query
  "Returns a HoneySQL query streaming undirected, summed-parallel edges for
   Louvain. Self-loops (`from_entity_id = to_entity_id`) are filtered out.

   `LEAST`/`GREATEST` is expressed as two `:case` ternaries to dodge
   dialect differences. The top-K-per-target filter from
   `directed-edges-query` is applied first, then the symmetric pair is
   formed in this outer SELECT."
  [{:keys [min-score top-k-target] :or {min-score 0.02 top-k-target 50} :as opts}]
  (let [directed (directed-edges-query (assoc opts
                                              :min-score    min-score
                                              :top-k-target top-k-target))]
    {:with     [[:directed directed]]
     :select   [[[:case
                  [:< :from_entity_id :to_entity_id] :from_entity_id
                  :else :to_entity_id]
                 :u]
                [[:case
                  [:< :from_entity_id :to_entity_id] :to_entity_id
                  :else :from_entity_id]
                 :v]
                [[:sum :score] :w]]
     :from     [:directed]
     :where    [:not= :from_entity_id :to_entity_id]
     :group-by [[[:case
                  [:< :from_entity_id :to_entity_id] :from_entity_id
                  :else :to_entity_id]]
                [[:case
                  [:< :from_entity_id :to_entity_id] :to_entity_id
                  :else :from_entity_id]]]}))

(defn load-directed-edges
  "Reducible of directed ensemble edges for a PageRank job. Each element is a
   map with keys `:from_entity_type :from_entity_id :to_entity_type
   :to_entity_id :score`."
  [opts]
  (t2/reducible-query (directed-edges-query opts)))

(defn load-undirected-edges
  "Reducible of undirected, summed-parallel ensemble edges for a Louvain job.
   Each element is a map with keys `:u :v :w` where `u < v` and `w` is the
   summed weight across both directions. Self-loops are excluded."
  [opts]
  (t2/reducible-query (undirected-edges-query opts)))
