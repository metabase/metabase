(ns metabase.explorations.groups
  "Compute auto-derived groups over a thread's `ExplorationQuery` rows.

   Today's heuristic emits a two-level tree:

     - Top level: one `\"sidebar\"` group per `card_id` — the metric. Always emitted,
       even when a thread has only one metric, so the FE has a uniform shape to render.
       Its `:query_ids` is empty; queries live on the leaf children below.

     - Leaves: the original `[card_id dimension_id]` bundles. They keep `\"singleton\"`
       / `\"page\"` and now point at their parent metric via `:parent_group_id`.

   `metabase.explorations.api/generate-queries!` always emits an unsegmented base row
   (`segment_id = nil`) per (metric, dim) pair, so a leaf group's display name is taken
   from that base row.

   `auto-groups` is a pure function over already-hydrated query rows plus a
   `{card_id -> metric-name}` map. No DB access. Future user-defined groups will layer
   in alongside (`:type \"user\"`) without changing the response shape.")

(set! *warn-on-reflection* true)

(defn- metric-group-id
  "Stable per-thread metric-level group id. Treated as opaque by the FE."
  [card-id]
  (str "auto:metric:" card-id))

(defn- leaf-group-id
  "Stable per-thread leaf group id derived from `[card_id dimension_id]`. Treated as
   opaque by the FE; the format is illustrative, not parsed."
  [card-id dim-id]
  (str "auto:" card-id ":" dim-id))

(defn- leaf-group-name
  "Pick the display name for a leaf group: prefer the base (unsegmented) query's `:name`,
   fall back to the first query's `:name`."
  [queries]
  (let [base (some #(when (nil? (:segment_id %)) %) queries)]
    (or (:name base) (:name (first queries)))))

(defn- max-score
  "Max `:interestingness_score` across `queries`, or `nil` if none scored."
  [queries]
  (let [scores (keep :interestingness_score queries)]
    (when (seq scores) (apply max scores))))

(defn- sort-key
  "Sort siblings by max interestingness desc, with no-score groups last and `:id` as
   the stable tiebreak."
  [{::keys [max-score] :keys [id]}]
  (if max-score [0 (- max-score) id] [1 0 id]))

(defn auto-groups
  "Given a seq of hydrated `ExplorationQuery` rows for a single thread plus a
   `{card_id -> metric-name}` map, return a vector of auto-group maps:

       {:id              \"auto:metric:<card_id>\" | \"auto:<card_id>:<dim_id>\"
        :parent_group_id <metric-group-id> | nil
        :position        <0-indexed slot in the returned vector>
        :type            \"auto\"
        :display_type    \"sidebar\" | \"singleton\" | \"page\"
        :name            <metric name | base-query name | nil>
        :query_ids       [<id> <id> ...]}

   The returned vector is the flat depth-first view of a tree:
   - Top-level metric groups (`display_type \"sidebar\"`, `parent_group_id nil`) sorted
     by max interestingness across all queries derived from that metric.
   - Each metric group is immediately followed by its leaf `[card_id dim_id]` children
     (`display_type \"singleton\"` / `\"page\"`), sorted by max interestingness within
     that metric.

   Metric-level groups carry `:query_ids = []`; the queries live on the leaf children
   linked by `:parent_group_id`. `:position` is the 0-indexed slot in the returned
   vector — the FE may use it for ordering, or walk `:parent_group_id` to build the
   tree directly."
  [queries card-names]
  (let [;; Step 1: leaf (card, dim) groups, scored and tagged with their card_id.
        leaves-by-card  (->> (group-by (juxt :card_id :dimension_id) queries)
                             (map (fn [[[card-id dim-id] qs]]
                                    {:id              (leaf-group-id card-id dim-id)
                                     :parent_group_id (metric-group-id card-id)
                                     :type            "auto"
                                     :display_type    (if (= 1 (count qs)) "singleton" "page")
                                     :name            (leaf-group-name qs)
                                     :query_ids       (mapv :id qs)
                                     ::card-id        card-id
                                     ::max-score      (max-score qs)}))
                             (group-by ::card-id))
        ;; Step 2: metric-level groups, one per distinct card_id. Score them against
        ;; every query under that metric so top-level ordering reflects the metric's
        ;; best chart.
        metric-groups   (->> (group-by :card_id queries)
                             (map (fn [[card-id qs]]
                                    {:id              (metric-group-id card-id)
                                     :parent_group_id nil
                                     :type            "auto"
                                     :display_type    "sidebar"
                                     :name            (get card-names card-id)
                                     :query_ids       []
                                     ::card-id        card-id
                                     ::max-score      (max-score qs)})))
        sorted-metrics  (sort-by sort-key metric-groups)
        ;; Step 3: interleave each metric group with its sorted leaf children.
        depth-first     (mapcat (fn [{::keys [card-id] :as metric}]
                                  (cons metric (sort-by sort-key (get leaves-by-card card-id))))
                                sorted-metrics)]
    (into [] (comp (map-indexed #(assoc %2 :position %1))
                   (map #(dissoc % ::card-id ::max-score)))
          depth-first)))
