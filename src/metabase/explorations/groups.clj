(ns metabase.explorations.groups
  "Compute auto-derived groups over a thread's `ExplorationQuery` rows.

   Today the only grouping heuristic is `[card_id dimension_id]`: queries that share a
   metric Card and a dimension but vary by segment are bundled into the same group.
   `metabase.explorations.api/generate-queries!` always emits an unsegmented base row
   (`segment_id = nil`) per (metric, dim) pair, so the group's display name is taken
   from that base row.

   `auto-groups` is a pure function over already-hydrated query rows — no DB access.
   Future user-defined groups will layer in alongside (`:type \"user\"`) without
   changing the response shape.")

(set! *warn-on-reflection* true)

(defn- group-id
  "Stable per-thread auto-group id derived from `[card_id dimension_id]`. Treated as
   opaque by the FE; the format is illustrative, not parsed."
  [card-id dim-id]
  (str "auto:" card-id ":" dim-id))

(defn- group-name
  "Pick the display name for a group: prefer the base (unsegmented) query's `:name`,
   fall back to the first query's `:name`."
  [queries]
  (let [base (some #(when (nil? (:segment_id %)) %) queries)]
    (or (:name base) (:name (first queries)))))

(defn- max-score
  "Max `:interestingness_score` across `queries`, or `nil` if none scored."
  [queries]
  (let [scores (keep :interestingness_score queries)]
    (when (seq scores) (apply max scores))))

(defn auto-groups
  "Given a seq of hydrated `ExplorationQuery` rows for a single thread, return a vector
   of auto-group maps:

       {:id \"auto:<card_id>:<dim_id>\"
        :type \"auto\"
        :name \"<base query name>\"
        :query_ids [<id> <id> ...]}

   Queries within a group keep their input order (positions). Groups are ordered by
   max `:interestingness_score` in the group (desc), then by group `:id` for a stable
   tiebreak; groups with no scored queries sort last."
  [queries]
  (->> (group-by (juxt :card_id :dimension_id) queries)
       (mapv (fn [[[card-id dim-id] qs]]
               {:id         (group-id card-id dim-id)
                :type       "auto"
                :name       (group-name qs)
                :query_ids  (mapv :id qs)
                ::max-score (max-score qs)}))
       (sort-by (fn [{::keys [max-score] :keys [id]}]
                  (if max-score [0 (- max-score) id] [1 0 id])))
       (mapv #(dissoc % ::max-score))))
