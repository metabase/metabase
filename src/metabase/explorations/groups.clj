(ns metabase.explorations.groups
  "Compute auto-derived groups over a thread's `ExplorationQuery` rows.

   Two grouping heuristics run today:

   - `[card_id dimension_id]` bundles queries that share a metric Card and a dimension but
     vary by segment. `metabase.explorations.api/generate-queries!` always emits an
     unsegmented base row (`segment_id = nil`) per (metric, dim) pair, so the group's
     display name is taken from that base row.
   - The `Uninteresting Charts` bin collects every query whose
     `:contextual_interestingness_score` is `0` — the LLM looked at it and judged it
     unrelated to the thread's prompt. These queries are pulled out of their (card, dim)
     bundles before bundling, so each query still belongs to exactly one group.

   `auto-groups` is a pure function over already-hydrated query rows — no DB access.
   Future user-defined groups will layer in alongside (`:type \"user\"`) without
   changing the response shape."
  (:require
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(def ^:private uninteresting-group-id
  "Per-thread id for the singleton 'Uninteresting Charts' bin. Opaque to the FE."
  "auto:uninteresting")

(defn- uninteresting?
  "True when the LLM scored this query a 0 on contextual interestingness — i.e., it
   explicitly judged the chart irrelevant to the thread's prompt. `nil` (unscored, no
   prompt, or LLM unavailable) does NOT count: only an actual 0 sweeps a query into the
   uninteresting bin."
  [q]
  (let [s (:contextual_interestingness_score q)]
    (and (some? s) (zero? s))))

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

       {:id              \"auto:<card_id>:<dim_id>\" | \"auto:uninteresting\"
        :parent_group_id nil
        :position        <0-indexed sibling order>
        :type            \"auto\"
        :display_type    \"singleton\" | \"page\" | \"sidebar\"
        :name            \"<base query name>\" | \"Uninteresting Charts\"
        :query_ids       [<id> <id> ...]}

   `:parent_group_id` references another group's `:id` in the same vector (nil = top
   level). The current heuristics produce a single flat level, so every group emitted
   today carries `nil`, just present to prep for a future where we can have nested groups.

   `:display_type` tells the FE how to render the group:
     - `\"singleton\"` — group has a single query; sidebar shows it as one row
     - `\"page\"`      — group has multiple queries that should render together on one page
     - `\"sidebar\"`   — group expands/collapses inline as a dropdown in the sidebar

   Queries with `:contextual_interestingness_score` of `0` are pulled into a single
   `Uninteresting Charts` bin (`display_type \"sidebar\"`) and removed from their
   (card, dim) bundles — every query still belongs to exactly one group.

   Queries within a group keep their input order (positions). Leaf (card, dim) groups
   are ordered by max `:interestingness_score` (desc), then by group `:id` for a stable
   tiebreak; groups with no scored queries sort last. The uninteresting bin always
   sorts last when present. `:position` is the 0-indexed slot in that ordering."
  [queries]
  (let [{uninteresting true interesting false} (group-by (comp boolean uninteresting?) queries)
        leaf-groups (->> (group-by (juxt :card_id :dimension_id) interesting)
                         (mapv (fn [[[card-id dim-id] qs]]
                                 {:id              (group-id card-id dim-id)
                                  :parent_group_id nil
                                  :type            "auto"
                                  :display_type    (if (= 1 (count qs)) "singleton" "page")
                                  :name            (group-name qs)
                                  :query_ids       (mapv :id qs)
                                  ::max-score      (max-score qs)}))
                         (sort-by (fn [{::keys [max-score] :keys [id]}]
                                    (if max-score [0 (- max-score) id] [1 0 id]))))
        all-groups  (cond-> (vec leaf-groups)
                      (seq uninteresting)
                      (conj {:id              uninteresting-group-id
                             :parent_group_id nil
                             :type            "auto"
                             :display_type    "sidebar"
                             :name            (tru "Uninteresting Charts")
                             :query_ids       (mapv :id uninteresting)
                             ::max-score      nil}))]
    (into [] (comp (map-indexed #(assoc %2 :position %1))
                   (map #(dissoc % ::max-score)))
          all-groups)))
