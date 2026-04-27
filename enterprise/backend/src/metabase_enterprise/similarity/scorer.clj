(ns metabase-enterprise.similarity.scorer
  "Registry and shared helpers for similarity views.

   Each view namespace calls `register-view!` at load time with a map containing
   `:typed-pairs` and `:compute!`. The batch runner iterates the registry to find
   all available views.")

(defonce ^:private registry (atom {}))

(defn register-view!
  "Register a view definition under `view-name`. The map must contain:

   - `:typed-pairs` — set of `[from-type to-type]` keyword pairs, or the sentinel
     `:all-from-dependency` for views projected from the polymorphic dependency
     table.
   - `:compute!`    — `(fn [opts]) → row-count`. Synchronous, side-effecting,
     expected to run inside the runner-owned transaction.

   Idempotent: reloading a view namespace replaces its prior entry."
  [view-name view-def]
  (swap! registry assoc view-name view-def)
  view-name)

(defn lookup
  "Return the registered view definition for `view-name`, or nil."
  [view-name]
  (get @registry view-name))

(defn registered-views
  "Return the set of currently-registered view-name keywords."
  []
  (set (keys @registry)))

(defn all-views
  "Return the full registry map. Iteration target for the batch runner."
  []
  @registry)

(defn symmetric-edges
  "Given an undirected pair, return the two `:model/SimilarEdge`-shaped maps that
   denormalize symmetry in the table. Symmetric views (co-dashboard, source-table-jaccard)
   store both `(A, B)` and `(B, A)` so the query API can lookup neighbors by
   `from_entity_*` alone.

   Required keys: `:from-type :from-id :to-type :to-id :view :score
   :contributing-data :last-computed-at`."
  [{:keys [from-type from-id to-type to-id view score contributing-data last-computed-at]}]
  (let [common {:view              view
                :score             score
                :contributing_data contributing-data
                :last_computed_at  last-computed-at}]
    [(merge common {:from_entity_type from-type :from_entity_id from-id
                    :to_entity_type   to-type   :to_entity_id   to-id})
     (merge common {:from_entity_type to-type   :from_entity_id to-id
                    :to_entity_type   from-type :to_entity_id   from-id})]))
