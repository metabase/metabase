(ns metabase-enterprise.similarity.views.ensemble
  "Materialized RRF fusion over per-view rows in `similar_edge`.

   For each typed pair in `fusion/ensemble-config`, we:
   1. Pull base-view rows from `similar_edge`.
   2. Tie-collapse: within each `(from_entity, view)`, drop all-but-one row per
      tied score group. The 200-card diagnostic showed that `co-dashboard`
      routinely produces 5–10+ tied score-1.0 edges from a single dashboard
      cluster, and `ROW_NUMBER`-based ranking treated each as an independent
      endorsement, packing the ensemble head with one cluster's followers and
      crowding out other views (notably `title-desc-ebr`).
   3. Rank each surviving row within `(from_entity, view)` by score-desc.
   4. Sum `weight(view) / (k + rank)` over views per `(from, to)` candidate.
   5. Apply a `top-K-per-source` cap on the fused list.
   6. Insert the survivors back as `view = :ensemble`.

   Tie-collapse is a bridge-fix until Phase 8's community detection lands —
   communities will keep all cluster members as candidates and let
   `dedupe-by-community` choose a representative at retrieval time. Until
   then, dropping tied followers is a cheap proxy that materially improves
   ensemble visibility for non-clustered views.

   The whole pipeline runs as a single SQL statement per typed pair using
   window functions; the JVM only ferries rows from the result cursor into
   `t2/insert!` batches. `metabase-enterprise.similarity.fusion/fuse-ranks`
   exists as the unit-testable reference impl and as a JVM-side fallback if
   the SQL path hits a portability issue. The JVM impl does *not* tie-collapse
   — it expects pre-deduped ranked lists from the caller; this divergence is
   intentional since tie-collapse is a SQL-side policy applied to raw edges.

   Postgres-only. The CTE chain stacks two window-bearing CTEs (`:base` →
   `:deduped` → `:ranked`); H2's planner returns 0 rows from that shape, so
   tests for this view are gated on `(= :postgres (mdb/db-type))`. Postgres is
   the appdb engine for the PoC, so this is acceptable."
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
    {:with [[:base
             {:select [:from_entity_type :from_entity_id
                       :to_entity_type   :to_entity_id
                       :view :score
                       ;; Per-tied-score-group position; only `tie_position=1`
                       ;; survives the `:deduped` filter below. ORDER BY
                       ;; `:to_entity_id` makes the choice deterministic across
                       ;; runs (lowest id wins inside a tie group).
                       [[:over [[:row_number]
                                {:partition-by [:from_entity_type :from_entity_id
                                                :view :score]
                                 :order-by     [[:to_entity_id]]}]]
                        :tie_position]]
              :from   [:similar_edge]
              :where  [:and
                       [:= :from_entity_type from-name]
                       [:= :to_entity_type   to-name]
                       [:in :view view-names]]}]
            [:deduped
             {:select [:from_entity_type :from_entity_id
                       :to_entity_type   :to_entity_id
                       :view :score]
              :from   [:base]
              :where  [:= :tie_position [:inline 1]]}]
            [:ranked
             {:select [:from_entity_type :from_entity_id
                       :to_entity_type   :to_entity_id
                       :view :score
                       [[:over [[:row_number]
                                {:partition-by [:from_entity_type :from_entity_id :view]
                                 :order-by     [[:score :desc]]}]]
                        :within_view_rank]]
              :from   [:deduped]}]
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
