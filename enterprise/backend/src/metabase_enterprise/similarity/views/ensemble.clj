(ns metabase-enterprise.similarity.views.ensemble
  "Materialized RRF fusion over per-view rows in `similar_edge`.

   For each typed pair in `fusion/ensemble-config`, we:
   1. Rank each row within `(from_entity, view)` by score-desc using SQL
      `RANK()`. Tied scores share a rank — all tied members enter the
      ensemble and contribute equal RRF weight, with a gap after the tie
      group (1, 1, 1, 4, ...).
   2. Sum `weight(view) / (k + rank)` over views per `(from, to)` candidate.
   3. Apply a `top-K-per-source` cap on the fused list.
   4. Insert the survivors back as `view = :ensemble`.

   Cluster amplification — e.g. a 10-card dashboard producing 9 score-1.0
   `co-dashboard` edges from one seed — is managed by two complementary
   mechanisms: per-view weight calibration in `fusion/ensemble-config`
   (`co-dashboard` ships at 0.8 to compensate for cluster size) and
   retrieval-time community dedup in `api/dedupe-by-community` over the
   Phase 8 Louvain partition.

   An earlier iteration of this pipeline included a `:deduped` CTE that
   filtered tied rows down to the lowest `to_entity_id` per tie group. That
   was removed because it was destructive: locked-out rows were unreachable
   from `api/neighbors` regardless of any retrieval-time flag, and they were
   invisible to Phase 8's PageRank/Louvain (which both read `view='ensemble'`
   in `graph/edge_loader.clj`), so the community partition itself was being
   computed over an edge-pruned graph. The harness in
   `dev.ensemble-fusion-strategy` quantified the head-balance shift and
   confirmed weight recalibration recovers diversity without destroying
   coverage. See the Phase 7 follow-up entry in
   `notes/classifiers/card-similarity-graph-index-impl-progress.md`.

   The whole pipeline runs as a single SQL statement per typed pair using
   window functions; the JVM only ferries rows from the result cursor into
   `t2/insert!` batches. `metabase-enterprise.similarity.fusion/fuse-ranks`
   exists as the unit-testable reference impl and as a JVM-side fallback if
   the SQL path hits a portability issue. The JVM impl ranks ties via
   `map-indexed` (ROW_NUMBER-equivalent), while the SQL path uses `RANK()`;
   the two differ only when the input has tied scores. The SQL path is the
   production codepath and is what shapes the materialized index.

   Postgres-only. The CTE chain stacks window-bearing CTEs (`:ranked` →
   `:fused` → `:final`); H2's planner returns 0 rows from that shape, so
   tie-behavior tests for this view are gated on
   `(= :postgres (mdb/db-type))`. Postgres is the appdb engine for the PoC,
   so this is acceptable."
  (:require
   [java-time.api :as t]
   [metabase-enterprise.similarity.fusion :as fusion]
   [metabase-enterprise.similarity.scorer :as scorer]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- weight-case-expr
  "Build a HoneySQL `:case` expression mapping view-name → weight, with a
   fallthrough of 1.0 for any view not in `weights`."
  [weights]
  (into [:case]
        (concat
         (mapcat (fn [[view w]]
                   [[:= :view (name view)] [:inline (double w)]])
                 weights)
         [:else [:inline 1.0]])))

(defn- fuse-typed-pair-query
  "HoneySQL query that returns capped, fused rows for a single typed pair.
   Each row carries `{:from_entity_type :from_entity_id :to_entity_type
   :to_entity_id :score}`."
  [[from-type to-type] {:keys [views weights k top-k-per-source]}]
  (let [view-names    (mapv name views)
        from-name     (name from-type)
        to-name       (name to-type)
        case-expr     (weight-case-expr weights)
        k-int         (long (or k 60))
        cap           (long (or top-k-per-source 50))]
    {:with [[:ranked
             {:select [:from_entity_type :from_entity_id
                       :to_entity_type   :to_entity_id
                       :view :score
                       ;; SQL RANK(): tied scores share a rank, with a gap
                       ;; after the tie group (1, 1, 1, 4, ...). All tied
                       ;; members survive into fusion and contribute equal
                       ;; RRF weight; cluster amplification is managed via
                       ;; per-view weight calibration in `fusion/ensemble-config`
                       ;; and retrieval-time community dedup.
                       [[:over [[:rank]
                                {:partition-by [:from_entity_type :from_entity_id :view]
                                 :order-by     [[:score :desc]]}]]
                        :within_view_rank]]
              :from   [:similar_edge]
              :where  [:and
                       [:= :from_entity_type from-name]
                       [:= :to_entity_type   to-name]
                       [:in :view view-names]]}]
            [:fused
             {:select   [:from_entity_type :from_entity_id
                         :to_entity_type   :to_entity_id
                         [[:sum [:/ case-expr
                                 [:+ [:inline k-int] :within_view_rank]]]
                          :score]]
              :from     [:ranked]
              :group-by [:from_entity_type :from_entity_id
                         :to_entity_type   :to_entity_id]}]
            [:final
             {:select [:from_entity_type :from_entity_id
                       :to_entity_type   :to_entity_id
                       :score
                       [[:over [[:row_number]
                                {:partition-by [:from_entity_type :from_entity_id]
                                 :order-by     [[:score :desc]]}]]
                        :pos]]
              :from   [:fused]}]]
     :select [:from_entity_type :from_entity_id
              :to_entity_type   :to_entity_id
              :score]
     :from   [:final]
     :where  [:<= :pos [:inline cap]]}))

(defn- ->edge
  "Translate a single fused-row map into a `:model/SimilarEdge`-shaped insert
   row. The `view`/`from_entity_type`/`to_entity_type` keyword coercion happens
   on the way in via the model's transforms."
  [{:keys [from_entity_type from_entity_id to_entity_type to_entity_id score]} now]
  {:from_entity_type  (keyword from_entity_type)
   :from_entity_id    from_entity_id
   :to_entity_type    (keyword to_entity_type)
   :to_entity_id      to_entity_id
   :view              :ensemble
   :score             (double score)
   :contributing_data nil
   :last_computed_at  now})

(defn- run-typed-pair! [now batch-size [typed-pair cfg]]
  (transduce
   (comp (map #(->edge % now))
         (partition-all batch-size))
   (completing
    (fn [total batch]
      (t2/insert! :model/SimilarEdge batch)
      (+ total (count batch))))
   0
   (t2/reducible-query (fuse-typed-pair-query typed-pair cfg))))

(defn- compute! [{:keys [batch-size] :or {batch-size 500}}]
  (let [now (t/offset-date-time)]
    (reduce (fn [total entry]
              (+ total (run-typed-pair! now batch-size entry)))
            0
            (fusion/ensemble-config))))

(scorer/register-view! :ensemble
                       {:phase       :fusion
                        :typed-pairs (set (keys (fusion/ensemble-config)))
                        :compute!    compute!})
