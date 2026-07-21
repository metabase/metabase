(ns metabase.explorations.api
  "`/api/exploration` routes."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.app-db.core :as mdb]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.explorations.blocks :as explorations.blocks]
   [metabase.explorations.core :as explorations]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.explorations.models.exploration :as expl.model]
   [metabase.explorations.models.exploration-block :as block]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.explorations.query-plan.context :as qp.context]
   [metabase.explorations.queues :as explorations.queues]
   [metabase.lib-be.core :as lib-be]
   [metabase.queries.core :as queries]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------- helpers -----------------------------------------

(defn- get-exploration-or-404 [id]
  (api/check-404 (t2/select-one :model/Exploration :id id)))

(defn- check-destination-collection-perms!
  "When `updates` moves the exploration to a different `collection_id`, verify the current
  user has write perms on the destination (collection or root). Source-side perms are already
  enforced by the parent `api/write-check` against the exploration itself, which via
  `:perms/use-parent-collection-perms` requires write on the source collection."
  [{old-coll :collection_id} updates]
  (when (and (contains? updates :collection_id)
             (not= old-coll (:collection_id updates)))
    (let [new-coll (:collection_id updates)]
      (if new-coll
        (api/write-check :model/Collection new-coll)
        (api/write-check collection/root-collection)))))

(defn- exploration-query-dim-label
  "Display label for a dimension inside an ExplorationQuery `name`. When `ambiguous?` and the dim
  has a known group, prefixes with the group's display name and the canonical ` → ` separator
  (matches `metabase.lib.display-name/separator`). Otherwise falls back to the dim's display name
  (or id when missing)."
  [dim ambiguous?]
  (let [dn       (or (:display_name dim) (:dimension_id dim))
        group-dn (some-> dim :group :display_name)]
    (if (and ambiguous? (not (str/blank? group-dn)))
      (str group-dn " → " dn)
      dn)))

(defn- blocks-by-thread-id
  "The persisted blocks (`ExplorationBlock`) for `thread-ids`, in authoring order, grouped by
   `:exploration_thread_id`."
  [thread-ids]
  (when (seq thread-ids)
    (group-by :exploration_thread_id
              (t2/select :model/ExplorationBlock
                         :exploration_thread_id [:in thread-ids]
                         {:order-by [[:position :asc] [:id :asc]]}))))

(defn- enrich-block-dimensions
  "Attach each block dimension's `:group` (source) label from `card-dim-by-id` so the read tree
  can qualify same-named dimension headings by their source."
  [blocks card-dim-by-id]
  (mapv (fn [block]
          (update block :dimensions
                  (fn [dims]
                    (mapv #(block/enrich-with-card-group % card-dim-by-id) dims))))
        blocks))

(defn- attach-query-dimension-labels
  "Attach `:dimension_name` to each query on `thread`. Dimension snapshots come from the
  thread's `blocks` (deduped by id); each is enriched with `:group` looked up from
  `card-dim-by-id` (the metric Cards' snapshotted `:dimensions`, the only place that group
  metadata lives), then `exploration-query-dim-label` is applied with ambiguity scoped to the
  thread's dimensions."
  [thread blocks card-dim-by-id]
  (let [thread-dims   (vals (u/index-by :dimension_id (mapcat :dimensions blocks)))
        enriched-dims (mapv #(block/enrich-with-card-group % card-dim-by-id)
                            thread-dims)
        dim-by-id     (u/index-by :dimension_id enriched-dims)
        name-counts   (frequencies (keep :display_name enriched-dims))]
    (update thread :queries
            (fn [queries]
              (some->> queries
                       (mapv (fn [q]
                               (let [dim-id     (:dimension_id q)
                                     dim        (or (get dim-by-id dim-id)
                                                    {:dimension_id dim-id})
                                     ambiguous? (> (get name-counts (:display_name dim) 0) 1)]
                                 (assoc q :dimension_name
                                        (exploration-query-dim-label dim ambiguous?))))))))))

(defn- attach-thread-read-data
  "Compute the read-side nested `:blocks` (each with its `:pages`) and per-query
  `:dimension_name` labels for `thread` from its pre-fetched `blocks`, `pages`, and the shared
  metric-Card lookup maps (`card-name-by-id` for page/heading names, `card-dim-by-id` for
  dimension source metadata)."
  [thread blocks pages card-name-by-id card-dim-by-id]
  (let [enriched-blocks (enrich-block-dimensions blocks card-dim-by-id)
        ;; Label queries first so blocks-tree can name metric-anchored pages "By <dimension>".
        labeled         (attach-query-dimension-labels thread enriched-blocks card-dim-by-id)]
    (assoc labeled :blocks (explorations.blocks/blocks-tree
                            enriched-blocks pages card-name-by-id (:queries labeled)))))

(defn- attach-threads-read-data
  "Batch [[attach-thread-read-data]] across `threads`: select every thread's blocks, their
  pages, and the metric Cards they reference in a fixed number of queries (not per thread,
  which N+1s), then enrich each thread in memory."
  [threads]
  (let [blocks-by-thread (blocks-by-thread-id (map :id threads))
        all-blocks       (mapcat val blocks-by-thread)
        block-ids        (map :id all-blocks)
        pages-by-block   (when (seq block-ids)
                           (group-by :exploration_block_id
                                     (t2/select :model/ExplorationPage
                                                :exploration_block_id [:in block-ids])))
        card-ids         (distinct (mapcat #(map :card_id (:metrics %)) all-blocks))
        cards            (when (seq card-ids)
                           (t2/select [:model/Card :id :name :dimensions] :id [:in card-ids]))
        card-name-by-id  (into {} (map (juxt :id :name)) cards)
        card-dim-by-id   (into {}
                               (mapcat (fn [c] (map (juxt :id identity) (:dimensions c))))
                               cards)]
    (mapv (fn [thread]
            (let [blocks (get blocks-by-thread (:id thread) [])
                  pages  (mapcat #(get pages-by-block (:id %) []) blocks)]
              (attach-thread-read-data thread blocks pages card-name-by-id card-dim-by-id)))
          threads)))

(defn- gate-threads-derived-data
  "Drop every thread's derived read-data — its queries, the block/page tree built from them, and the
  thread name — when the current user's data-access lens isn't compatible with the creator's lens
  that produced it. All three embed verbatim values from the creator's results (discovered top-N
  dimension values in query names and `dataset_query`s; the clicked segment an \"Explore further\"
  thread is named for), and those results are themselves gated where they're streamed. Threads the
  viewer *can* see are enriched as usual. See [[metabase.explorations.derived-perms]]."
  [threads]
  (let [visible-ids (derived-perms/thread-ids-with-visible-derived-data (map :id threads))
        enriched    (u/index-by :id
                                (attach-threads-read-data
                                 (filterv #(contains? visible-ids (:id %)) threads)))]
    (mapv (fn [thread]
            (or (get enriched (:id thread))
                (assoc thread :queries [] :blocks [] :name nil :status "forbidden")))
          threads)))

(defn- thread-status
  "Derived, wire-facing lifecycle status for a hydrated thread, so the FE can tell a successful
  run from a failed/empty/canceled one. One of:

    \"pending\"   — not started yet
    \"running\"   — started, still working
    \"canceled\"  — the user stopped it
    \"empty\"     — terminal, the planner had nothing applicable to chart (NOT an error)
    \"failed\"    — terminal, planning failed or every query errored
    \"completed\" — terminal, at least one chart is available
    \"forbidden\" — terminal, the viewer's data-access lens is incompatible with the creator's
                    (set by [[gate-threads-derived-data]], not [[thread-status]])"
  [{:keys [started_at canceled_at completed_at queries] :as thread}]
  (let [outcome (get-in thread [:query_plan_transcript :outcome])]
    (cond
      (some? canceled_at)                    "canceled"
      (nil? started_at)                      "pending"
      (nil? completed_at)                    "running"
      (= :skip-empty outcome)                "empty"
      (contains? #{:failed :error} outcome)  "failed"
      (some #(= "done" (:status %)) queries) "completed"
      ;; terminal, not canceled/empty/plan-failed, yet no query reached `done`
      ;; (every query errored, or planning left none) — surface it as a failure.
      :else                                  "failed")))

(defn- attach-thread-status
  "Add the wire-facing derived `:status` to a hydrated thread and drop the internal
  `:query_plan_transcript` — [[thread-status]] reads it (for the failed-vs-empty distinction),
  but the FE never does, so it shouldn't ride the wire. Runs before permission-gating, so status
  reflects the thread's real queries."
  [thread]
  (-> thread
      (assoc :status (thread-status thread))
      (dissoc :query_plan_transcript)))

(defn- hydrate-exploration [exploration]
  (-> exploration
      (t2/hydrate :creator :can_write :collection
                  [:threads :queries :timelines])
      (update :threads
              #(some->> % (mapv attach-thread-status) gate-threads-derived-data))))

(defn- positional-rows
  "Stamp `:exploration_thread_id` and a 0-based `:position` onto each row in `rows`."
  [thread-id rows]
  (map-indexed (fn [i row]
                 (assoc row :exploration_thread_id thread-id :position i))
               rows))

(defn- insert-blocks!
  "Persist the FE's Research-plan blocks verbatim — one `ExplorationBlock` row per
   block, in payload order. Each block keeps its own `:metrics`/`:dimensions` selection;
   the planners cross metrics with dimensions only within a block. No dedup across blocks:
   a metric or dimension appearing in two blocks is stored on both."
  [thread-id blocks]
  (when (seq blocks)
    (t2/insert! :model/ExplorationBlock
                (positional-rows thread-id
                                 (map #(select-keys % [:type :metrics :dimensions]) blocks)))))

(defn- insert-thread-timelines!
  "Attach `timeline-ids` to the thread, in payload order. Deduped (`distinct`, keeping first
   occurrence) — a repeated id would otherwise violate the table's unique
   `(exploration_thread_id, timeline_id)` constraint and 500 the create."
  [thread-id timeline-ids]
  (when (seq timeline-ids)
    (t2/insert! :model/ExplorationThreadTimeline
                (positional-rows thread-id
                                 (map (fn [tl-id] {:timeline_id tl-id}) (distinct timeline-ids))))))

(defn- reset-thread-for-rerun!
  "CAS-reset a *terminal* thread (`completed_at` set — natural completion, terminal failure, or
  cancel) back to the freshly-started state a new plan run expects: `started_at` set, every other
  lifecycle timestamp NULL, and zero `exploration_query` rows. On success it enqueues a fresh
  planning message (`explorations.queues/start-thread!`) inside the same transaction, so planning
  re-runs iff the reset committed. Returns true when the reset applied; false when the guarded
  UPDATE matched no row.

  The guard refuses while the thread is still in flight: not yet terminal, or a query worker
  still holds a `running` row (possible on a canceled thread, whose in-flight queries run to
  natural completion). A restart racing in-flight work could otherwise strand query rows a
  still-running planner inserts after the reset, or let an in-flight query worker's completion
  CAS stamp the freshly-reset thread."
  [thread-id]
  (t2/with-transaction [_conn]
    (when (pos? (t2/query-one
                 {:update :exploration_thread
                  :set    {:started_at            (t/offset-date-time)
                           :query_plan_started_at nil
                           :query_plan_transcript nil
                           :analysis_started_at   nil
                           :completed_at          nil
                           :canceled_at           nil}
                  :where  [:and
                           [:= :id thread-id]
                           [:not= :completed_at nil]
                           [:not-exists {:select [1]
                                         :from   [:exploration_query]
                                         :where  [:and
                                                  [:= :exploration_thread_id thread-id]
                                                  [:= :status "running"]]}]]}))
      (t2/delete! :model/ExplorationQuery :exploration_thread_id thread-id)
      ;; Enqueue planning inside the reset transaction so the plan message publishes iff the reset
      ;; commits (:queue/exploration-plan is :transactional :require).
      (explorations.queues/start-thread! thread-id)
      true)))

(defn- stringify-dim-types
  "Turn a block's `:dimensions` back into wire form for re-insertion. The model's read transform
  keywordizes `:effective_type`/`:semantic_type` (e.g. `:type/Date`); the JSON write transform
  would otherwise drop the namespace on a bare keyword, so stringify them first."
  [dimensions]
  (mapv (fn [dim]
          (cond-> dim
            (keyword? (:effective_type dim)) (update :effective_type u/qualified-name)
            (keyword? (:semantic_type dim))  (update :semantic_type u/qualified-name)))
        dimensions))

(defn- format-explore-filter-for-thread-name
  [{:keys [dimension_name display_value value]}]
  (let [value-str (or (some-> display_value str/trim not-empty)
                      (some-> value str))]
    (if (and dimension_name (not (str/blank? value-str)))
      (str dimension_name ": " value-str)
      value-str)))

(defn- explore-further-thread-name
  "Build the sidebar name for an \"Explore further\" thread from enriched `explore_filters`.
  Top-level follow-ups (drilled from the initial investigation) prefix the metric name;
  nested follow-ups use only the formatted filters."
  [card-name enriched-filters top-level-follow-up?]
  (let [formatted (->> enriched-filters
                       (keep format-explore-filter-for-thread-name)
                       (str/join ", ")
                       not-empty)]
    (cond
      (and top-level-follow-up? formatted card-name)
      (str card-name " → " formatted)

      formatted
      formatted

      :else
      card-name)))

;;; ----------------------------------------- schemas -----------------------------------------

(def ^:private MetricSelection
  [:map
   [:card_id ms/PositiveInt]
   [:dimension_mappings {:optional true} [:maybe [:sequential :map]]]])

(def ^:private DimensionSelection
  [:map
   [:dimension_id   ms/NonBlankString]
   [:display_name   {:optional true} [:maybe :string]]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type  {:optional true} [:maybe :string]]])

(def ^:private BlockSelection
  "One Research-plan area on the FE — either a metric area (one primary metric + chosen dimensions)
   or a dimension area (the dimension's group + referencing metrics). Persisted verbatim as one
   `ExplorationBlock` row; the planners cross this block's metrics with this block's
   dimensions only. The sidebar heading is computed read-side (the `:name` of an
   `ExplorationBlockNode`), not supplied here."
  [:map
   ;; Whether the block is anchored on its metric or its dimension. The read side
   ;; uses this to build the sidebar heading + sub-item names.
   [:type       {:optional true} [:maybe [:enum "metric" "dimension"]]]
   [:metrics    {:optional true} [:maybe [:sequential MetricSelection]]]
   [:dimensions {:optional true} [:maybe [:sequential DimensionSelection]]]])

(mr/def ::ExplorationQuerySummary
  "Schema for a query row in API responses. The result blob and `dataset_query` aren't
   asserted here; `interestingness_score`, `contextual_interestingness_score`, and
   `row_count` are left-joined (in `/:id/queries`) or batched-hydrated (in `/:id`) — the
   scores from `exploration_query_result`, `row_count` from the linked `stored_result` —
   and may be nil for pending/errored queries or — for the contextual score — when the LLM
   is unconfigured or the thread had no prompt."
  [:map
   [:id                               ms/PositiveInt]
   [:exploration_thread_id            ms/PositiveInt]
   [:card_id                          ms/PositiveInt]
   [:segment_id                       {:optional true} [:maybe ms/PositiveInt]]
   [:segment_name                     {:optional true} [:maybe :string]]
   [:dimension_id                     [:maybe :string]]
   [:dimension_name                   {:optional true} :string]
   [:query_type                       :string]
   [:display                          {:optional true} [:maybe :string]]
   [:name                             {:optional true} [:maybe :string]]
   [:position                         ms/IntGreaterThanOrEqualToZero]
   [:status                           :string]
   [:error_message                    {:optional true} [:maybe :string]]
   [:started_at                       {:optional true} [:maybe :any]]
   [:finished_at                      {:optional true} [:maybe :any]]
   [:entity_id                        {:optional true} [:maybe :string]]
   [:interestingness_score            {:optional true} [:maybe number?]]
   [:contextual_interestingness_score {:optional true} [:maybe number?]]
   [:row_count                        {:optional true} [:maybe ms/IntGreaterThanOrEqualToZero]]])

(mr/def ::ExplorationPageNode
  "A page within a block: the bundle of queries for one (card, dimension, query_type) under the
   page's stable id. `:query_ids` reference queries on the same thread, sorted by interestingness.
   `:position` is the page's 0-indexed slot among its block's pages. `:name` is the page's short,
   heading-relative label (e.g. `By Category over time`); `:long_name` is the full
   self-describing name (e.g. `Number of Orders by Category over time`) for use without the block
   heading for context."
  [:map
   [:id        ms/PositiveInt]
   [:name      [:maybe :string]]
   [:long_name [:maybe :string]]
   [:position  ms/IntGreaterThanOrEqualToZero]
   [:query_ids [:sequential ms/PositiveInt]]
   [:starred   :boolean]
   [:hidden    :boolean]])

(mr/def ::ExplorationBlockNode
  "A block (the FE's sidebar group): a heading plus its pages. `:type` is whether the block is
   anchored on its metric or its dimension; `:name` is the computed heading (the metric name, or
   `By <dimension>`). `:position` is the block's 0-indexed authoring slot."
  [:map
   [:id              ms/PositiveInt]
   [:type            [:enum "metric" "dimension"]]
   [:name            [:maybe :string]]
   [:position        ms/IntGreaterThanOrEqualToZero]
   [:explore_filters {:optional true}
    [:maybe [:sequential
             [:map
              [:field_ref     [:sequential :any]]
              [:value         :any]
              [:display_value {:optional true} [:maybe :string]]
              [:dimension_name {:optional true} [:maybe :string]]]]]]
   [:pages           [:sequential ::ExplorationPageNode]]])

(mr/def ::HydratedThread
  "Schema for an Exploration thread with hydrated selections and queries."
  [:map
   [:id                         ms/PositiveInt]
   [:exploration_id             ms/PositiveInt]
   [:prompt                     {:optional true} [:maybe :string]]
   [:position                   ms/IntGreaterThanOrEqualToZero]
   [:source_page_id             {:optional true} [:maybe ms/PositiveInt]]
   [:started_at                 {:optional true} [:maybe :any]]
   [:canceled_at                {:optional true} [:maybe :any]]
   [:completed_at               {:optional true} [:maybe :any]]
   [:status                     [:enum "pending" "running" "canceled" "empty" "failed" "completed" "forbidden"]]
   [:queries                    {:optional true} [:maybe [:sequential ::ExplorationQuerySummary]]]
   [:blocks                     {:optional true} [:maybe [:sequential ::ExplorationBlockNode]]]
   [:timelines                  {:optional true}
    [:maybe [:sequential
             [:map
              [:timeline_id ms/PositiveInt]
              [:position    {:optional true} ms/IntGreaterThanOrEqualToZero]
              [:timeline    {:optional true} [:maybe :map]]]]]]])

(mr/def ::ExplorationQueryStreamResponse
  "Schema for `GET /query/:id`. On success the body is a streamed dataset (api/csv/json/xlsx),
   so we describe it as `:any`. On a not-yet-done query we return a 409 with a status payload."
  [:or
   :any
   [:map
    [:status [:= 409]]
    [:body   [:map
              [:id            ms/PositiveInt]
              [:status        :string]
              [:error_message {:optional true} [:maybe :string]]
              [:started_at    {:optional true} [:maybe :any]]
              [:finished_at   {:optional true} [:maybe :any]]]]]])

(mr/def ::HydratedExploration
  "Schema for an Exploration with hydrated creator and threads."
  [:map
   [:id            ms/PositiveInt]
   [:name          :string]
   [:description   {:optional true} [:maybe :string]]
   [:creator_id    ms/PositiveInt]
   [:creator       {:optional true} [:maybe :map]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:archived      {:optional true} :boolean]
   [:threads       {:optional true} [:maybe [:sequential ::HydratedThread]]]
   [:created_at    {:optional true} [:maybe :any]]
   [:updated_at    {:optional true} [:maybe :any]]])

(mr/def ::ExplorationSummary
  "Lightweight row for the `GET /mine` list. No threads/queries — just the metadata
  needed to render a list entry, plus `current_user_last_touched_at`, the timestamp the list is
  sorted by (the caller's own most-recent touch of this exploration, composed across the
  exploration's revisions and its creation)."
  [:map
   [:id                           ms/PositiveInt]
   [:name                         ms/NonBlankString]
   [:description                  {:optional true} [:maybe :string]]
   [:creator_id                   ms/PositiveInt]
   ;; The `:creator` batched-hydrate selects a User subset, or `{}` when the creator can't be
   ;; resolved — hence every key is optional.
   [:creator                      {:optional true}
    [:maybe [:map
             [:id         {:optional true} ms/PositiveInt]
             [:email      {:optional true} ms/NonBlankString]
             [:first_name {:optional true} [:maybe :string]]
             [:last_name  {:optional true} [:maybe :string]]]]]
   [:collection_id                {:optional true} [:maybe ms/PositiveInt]]
   ;; `nil` for root-collection explorations; otherwise the hydrated collection (open map — only
   ;; the fields the FE needs are asserted).
   [:collection                   {:optional true}
    [:maybe [:map
             [:id   ms/PositiveInt]
             [:name ms/NonBlankString]]]]
   [:archived                     {:optional true} :boolean]
   [:created_at                   ms/TemporalInstant]
   [:updated_at                   ms/TemporalInstant]
   [:current_user_last_touched_at ms/TemporalInstant]])

(mr/def ::MineResponse
  "Paginated envelope for `GET /mine`, mirroring the collection-items index shape. `:total` is the
  count after the membership, permission, and archived filters; `:limit`/`:offset` echo the
  `offset-paging` middleware (both nil when the request is unpaged)."
  [:map
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:offset [:maybe ms/IntGreaterThanOrEqualToZero]]
   [:data   [:sequential ::ExplorationSummary]]])

(def ^:private CreateExploration
  "Body schema for `POST /api/exploration`.

   The FE sends one entry per Research-plan block (`:blocks` — each a metric/dimension
   area), each persisted verbatim. `:timeline_ids` is thread-scoped (timelines aren't part of
   any metric×dimension cross-product) and lives at the top level, not inside a block."
  [:map
   [:name          expl.model/ExplorationName]
   [:description   {:optional true} [:maybe :string]]
   [:prompt        {:optional true} [:maybe :string]]
   [:collection_id {:optional true} [:maybe ms/PositiveInt]]
   [:blocks        {:optional true} [:maybe [:sequential BlockSelection]]]
   [:timeline_ids  {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

(def ^:private ExploreFilterSpec
  "One segment filter stamped onto a block metric selection's `:explore_filters` vector."
  [:map
   [:field_ref     [:sequential :any]]
   [:value         :any]
   [:display_value {:optional true} [:maybe :string]]
   [:dimension_name {:optional true} [:maybe :string]]])

(def ^:private ExploreFurther
  "Body schema for `POST /api/exploration/:id/explore-further`. `page_id` is the clicked chart's
  page — its block (metric selection + dimensions) is copied verbatim so the new thread re-runs
  the same charts. `explore_filters` is appended to each copied metric selection's existing
  `:explore_filters`."
  [:map
   [:page_id         ms/PositiveInt]
   [:explore_filters [:sequential {:min 1} ExploreFilterSpec]]])

(def ^:private UpdateExploration
  "Body schema for `PUT /api/exploration/:id`. All fields are optional; only the keys the client
  actually includes are forwarded to the underlying `t2/update!`. `collection_id` may be `nil`
  to move the exploration to the root collection (\"Our Analytics\"). `collection_position` may
  be `nil` to unpin the exploration."
  [:map
   [:name                {:optional true} expl.model/ExplorationName]
   [:description         {:optional true} [:maybe :string]]
   [:archived            {:optional true} :boolean]
   [:collection_id       {:optional true} [:maybe ms/PositiveInt]]
   [:collection_position {:optional true} [:maybe ms/PositiveInt]]])

;;; ----------------------------------------- /dimensions schemas + helpers -----------------------------------------

(mr/def ::ExplorationMetric
  "Schema for a metric in the /dimensions response: dimensions referenced by id only."
  [:map
   [:id            ms/PositiveInt]
   [:name          :string]
   [:description   [:maybe :string]]
   [:collection_id [:maybe ms/PositiveInt]]
   [:collection    {:optional true} [:maybe [:map
                                             [:id [:maybe ms/PositiveInt]]
                                             [:name :string]]]]
   [:dimension_ids        [:sequential :any]]
   [:dimension_mappings   {:optional true} [:maybe [:sequential :map]]]
   [:database_id          {:optional true} [:maybe ms/PositiveInt]]
   [:result_column_name   {:optional true} [:maybe :string]]
   [:in_library           {:optional true} :boolean]])

(mr/def ::ExplorationDimensionGroup
  "Schema for a dimension group in the /dimensions response. A group bundles together dimensions that
   refer to the same underlying source (same field/binning) so the FE can show a single user-facing
   entry while still tracking the actual per-metric dimensions needed by `start exploration`."
  [:map
   [:name                       :string]
   [:dimension_interestingness  [:maybe number?]]
   [:dimensions                 [:sequential :map]]])

(mr/def ::DimensionsResponse
  "Schema for GET /dimensions: metrics referencing dimensions by id, plus the grouped dimension list."
  [:map
   [:metrics          [:sequential ::ExplorationMetric]]
   [:dimension_groups [:sequential ::ExplorationDimensionGroup]]])

;;; ----------------------------------------- endpoints -----------------------------------------

(api.macros/defendpoint :post "/" :- ::HydratedExploration
  "Create a new exploration with a single thread, persist the user's selected metrics, dimensions,
  and timelines, and stamp the thread as started. Actual planning is async; this endpoint returns
  immediately with an empty queries list. Clients should poll `GET /:id/queries` until rows appear.

  Accepts the per-area `:blocks` payload (one entry per Research-plan block), persisted
  verbatim, plus a thread-scoped `:timeline_ids`."
  [_route-params
   _query-params
   {:keys [name description prompt collection_id blocks timeline_ids]} :- CreateExploration]
  (api/create-check :model/Exploration {:collection_id collection_id})
  ;; Block metric-card and timeline references are persisted verbatim and read back unfiltered
  ;; (planning context, thread hydration), so attach time is the
  ;; permission boundary: every referenced id must exist (404) and be readable (403) by the creator.
  (doseq [card-id (distinct (mapcat #(map :card_id (:metrics %)) blocks))]
    (api/read-check :model/Card card-id))
  (doseq [timeline-id (distinct timeline_ids)]
    (api/read-check :model/Timeline timeline-id))
  (let [persisted
        (t2/with-transaction [_]
          (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                                   {:name          name
                                                                    :description   description
                                                                    :collection_id collection_id
                                                                    :creator_id    api/*current-user-id*}))
                ;; `started_at` marks the thread as started (past the draft phase). Planning itself
                ;; is kicked off by the `start-thread!` enqueue below — its plan message rides a
                ;; `:transactional :require` queue, so it publishes only once this whole transaction,
                ;; including the dependent block/timeline rows below, commits atomically.
                ;; The plan listener therefore can never observe (or plan) a half-built thread.
                thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                                   {:exploration_id (:id exploration)
                                                                    :prompt         prompt
                                                                    :position       0
                                                                    :started_at     (t/offset-date-time)}))
                tid         (:id thread)]
            (insert-blocks! tid blocks)
            (insert-thread-timelines! tid timeline_ids)
            (explorations.queues/start-thread! tid)
            (t2/select-one :model/Exploration :id (:id exploration))))]
    ;; Published after the transaction commits (matching PUT) so listeners can never observe an
    ;; exploration that isn't visible to other connections yet.
    (events/publish-event! :event/exploration-create
                           {:object persisted :user-id api/*current-user-id*})
    (hydrate-exploration persisted)))

(api.macros/defendpoint :post "/:id/explore-further" :- ::HydratedExploration
  "Start a follow-up investigation scoped to a clicked chart segment.

  The user clicked a bar/point on the chart for `page_id`; we copy that page's block (its metric
  selection + the same dimensions) into a brand-new thread and append each `explore_filters`
  entry onto every metric selection's `:explore_filters` vector. The background planner then
  materializes the same set of charts, but every query is scoped to those filters — and to any
  filters the source block already carried, so drilling from within an already-drilled thread
  keeps the earlier scope (see
  `metabase.explorations.query-plan.context/build-row-context`). Returns immediately with the new
  thread stamped `started_at`; clients poll `GET /:id` for the queries to land, exactly like create."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [page_id explore_filters]} :- ExploreFurther]
  (let [exploration (get-exploration-or-404 id)]
    (api/write-check exploration)
    (let [page          (api/check-404 (t2/select-one :model/ExplorationPage :id page_id))
          block         (api/check-404 (t2/select-one :model/ExplorationBlock
                                                      :id (:exploration_block_id page)))
          src-thread-id (:exploration_thread_id block)
          src-thread    (t2/select-one :model/ExplorationThread :id src-thread-id)
          ;; The clicked page must live in *this* exploration — a page keys off a block off a
          ;; thread off an exploration, and "Explore further" only ever drills a chart the caller
          ;; is already viewing here. Reject anything else with a 404: without this check a caller
          ;; could copy any page in the instance (metric selections, dimension snapshots, card ids,
          ;; and the queries the planner then runs) into an exploration they can write (IDOR).
          _             (api/check-404 (t2/exists? :model/ExplorationThread
                                                   :id src-thread-id :exploration_id id))
          metric-selection (first (:metrics block))
          card-id       (:card_id metric-selection)
          card          (api/check-404 (when card-id (t2/select-one :model/Card :id card-id)))
          card-name     (:name card)
          mp            (lib-be/application-database-metadata-provider (:database_id card))
          enriched-filters (qp.context/enrich-explore-filters mp card block metric-selection explore_filters)
          top-level-follow-up? (nil? (:source_page_id src-thread))
          ;; Append, don't overwrite: a source block that itself came from a prior drill already
          ;; carries `:explore_filters`; `into` keeps that earlier segment scope and adds this one.
          metrics'      (mapv #(update % :explore_filters (fnil into []) enriched-filters)
                              (:metrics block))
          timeline-ids  (t2/select-fn-vec :timeline_id :model/ExplorationThreadTimeline
                                          :exploration_thread_id src-thread-id
                                          {:order-by [[:position :asc] [:id :asc]]})
          next-position (inc (or (t2/select-one-fn :position :model/ExplorationThread
                                                   :exploration_id id
                                                   {:order-by [[:position :desc] [:id :desc]]})
                                 0))]
      (t2/with-transaction [_]
        (let [thread (first (t2/insert-returning-instances!
                             :model/ExplorationThread
                             {:exploration_id id
                              :name           (explore-further-thread-name card-name
                                                                           enriched-filters
                                                                           top-level-follow-up?)
                              :position       next-position
                              ;; drill lineage — lets the sidebar nest this thread
                              ;; under the one owning the drilled page
                              :source_page_id page_id}))
              tid    (:id thread)]
          (t2/insert! :model/ExplorationBlock
                      {:exploration_thread_id tid
                       :type                  (:type block)
                       :metrics               metrics'
                       :dimensions            (stringify-dim-types (:dimensions block))
                       :position              0})
          (insert-thread-timelines! tid timeline-ids)
          ;; Stamp `started_at` last — it's the signal the planning worker claims on.
          (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
          (explorations.queues/start-thread! tid)
          (let [persisted (t2/select-one :model/Exploration :id id)]
            (events/publish-event! :event/exploration-update
                                   {:object persisted :user-id api/*current-user-id*})
            (hydrate-exploration persisted)))))))

(api.macros/defendpoint :get "/dimensions" :- ::DimensionsResponse
  "Hydrated metrics plus a deduplicated dimension list, for the Exploration data modal.

  Optional `q` filters case-insensitively across metric name and dimension display-name."
  [_route-params
   {:keys [q]} :- [:maybe [:map [:q {:optional true} [:maybe ms/NonBlankString]]]]]
  (explorations/exploration-data {:q q}))

(defn- my-explorations-honeysql
  "HoneySQL for the explorations `user-id` created or edited, ordered by that user's most-recent
  touch (descending). \"Touch\" is the union of two streams, all attributed to the user:

    1. the user's `Exploration` revisions (metadata / structure edits),
    2. `exploration.created_at` for explorations the user created — creation is a touch, and
       `created_at` stays reliable even after the creation revision ages out of the
       `revision/max-revisions` cap.

  Membership is the inner join to the per-exploration MAX-timestamp aggregate (`agg`), so an
  exploration appears iff the user produced at least one touch. The MAX is the sort key (no
  `GREATEST`, whose NULL semantics differ across app DBs). `current_user_last_touched_at` is
  therefore non-null for every row. `archived = false` and the read-permission visibility filter
  on `collection_id` (which drops explorations moved into collections the user can no longer see)
  keep the `COUNT(*) OVER ()` total honest. `limit`/`offset` are appended only when paged.

  `my-touches` is embedded as a derived table inside `agg` rather than as a sibling CTE: a second
  `:with` binding that selects from the first (`agg` reading `my_touches`) silently returns no
  rows under our HoneySQL/H2 stack."
  [user-id limit offset]
  (let [my-touches {:union-all
                    [{:select [[:model_id :eid] [:timestamp :ts]]
                      :from   [:revision]
                      :where  [:and [:= :model "Exploration"] [:= :user_id user-id]]}
                     {:select [[:id :eid] [:created_at :ts]]
                      :from   [:exploration]
                      :where  [:= :creator_id user-id]}]}
        agg        {:select   [:eid [[:max :ts] :max_ts]]
                    :from     [[my-touches :my_touches]]
                    :group-by [:eid]}]
    (cond-> {:select   [:exploration.*
                        [:agg.max_ts :current_user_last_touched_at]
                        [[:over [[:count :*] {} :total_count]]]]
             :from     [:exploration]
             :join     [[agg :agg] [:= :agg.eid :exploration.id]]
             :where    [:and
                        [:= :exploration.archived false]
                        (collection/visible-collection-filter-clause :exploration.collection_id)]
             :order-by [[:current_user_last_touched_at :desc] [:exploration.id :desc]]}
      limit  (assoc :limit limit)
      offset (assoc :offset offset))))

;; Declared before `/:id` so the literal route wins — `"mine"` would otherwise fail the
;; `:id` PositiveInt coercion rather than fall through here.
(api.macros/defendpoint :get "/mine" :- ::MineResponse
  "Explorations the current user created or edited, most-recently-touched first, paginated.

  \"Touched\" composes the user's own edits to the exploration and its creation — see
  [[my-explorations-honeysql]]. Explorations that were moved into a collection the user can no
  longer read are excluded, as are archived ones. Returns the collection-items envelope:
  `{:total :limit :offset :data}`."
  []
  (let [limit  (request/limit)
        offset (request/offset)
        rows   (-> (t2/select :model/Exploration (my-explorations-honeysql api/*current-user-id* limit offset))
                   (t2/hydrate :creator :collection))]
    {:total  (or (-> rows first :total_count) 0)
     :limit  limit
     :offset offset
     :data   (mapv #(dissoc % :total_count) rows)}))

(api.macros/defendpoint :get "/:id" :- ::HydratedExploration
  "Fetch an exploration with its thread, selections, and generated queries."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [expl (api/read-check (get-exploration-or-404 id))]
    (hydrate-exploration expl)))

(api.macros/defendpoint :put "/:id" :- ::HydratedExploration
  "Update an exploration's metadata, archive state, or move it to a different collection.

  When `collection_id` changes, the caller must have write perms on the destination collection
  (or the root collection when `collection_id` is nil). Source perms are enforced by
  `api/write-check` against the exploration itself via `:perms/use-parent-collection-perms`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   updates :- UpdateExploration]
  (let [existing (get-exploration-or-404 id)
        updates' (api/updates-with-archived-directly existing updates)]
    (api/write-check existing)
    (check-destination-collection-perms! existing updates')
    (t2/with-transaction [_]
      (when (seq updates')
        (t2/update! :model/Exploration id updates')))
    (let [updated (t2/select-one :model/Exploration :id id)]
      (when (seq updates')
        (events/publish-event! :event/exploration-update
                               {:object updated :user-id api/*current-user-id*}))
      (hydrate-exploration updated))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Hard-delete an exploration. Soft delete is `PUT /api/exploration/:id {archived: true}`.

  Cascades to every `exploration_thread` and `exploration_query` via the on-delete-cascade
  FKs configured in the explorations migration."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [existing (get-exploration-or-404 id)]
    (api/write-check existing)
    (t2/delete! :model/Exploration :id id))
  nil)

(def ^:private query-summary-columns
  "Column projection for `::ExplorationQuerySummary` rows — excludes `dataset_query` and the
  result blob, joins both interestingness scores from `exploration_query_result` and the
  snapshot `row_count` from `stored_result` (reached through the EQR FK — callers must
  left-join both tables)."
  [:exploration_query.id :exploration_query.exploration_thread_id
   :exploration_query.card_id :exploration_query.segment_id
   :exploration_query.dimension_id :exploration_query.query_type
   :exploration_query.name :exploration_query.position
   :exploration_query.status :exploration_query.error_message
   :exploration_query.started_at :exploration_query.finished_at
   :exploration_query.entity_id
   [:exploration_query_result.interestingness_score            :interestingness_score]
   [:exploration_query_result.contextual_interestingness_score :contextual_interestingness_score]
   [:stored_result.row_count                                    :row_count]])

(defn- get-exploration-page-or-404
  [page-id]
  (api/check-404 (t2/select-one :model/ExplorationPage :id page-id)))

(defn- get-thread-or-404
  "Fetch the thread, or 404."
  [thread-id]
  (api/check-404 (t2/select-one :model/ExplorationThread :id thread-id)))

(defn- write-check-thread [thread-id]
  (let [thread (get-thread-or-404 thread-id)]
    (api/write-check (get-exploration-or-404 (:exploration_id thread)))
    thread))

(api.macros/defendpoint :post "/thread/:thread-id/restart" :- ::HydratedExploration
  "Re-run one exploration thread in place, keeping its selections: drops the thread's materialized
  queries and clears the terminal-state gates so the background planner re-claims it. Returns the
  parent exploration. Only a terminal thread (completed, failed, or canceled) can restart; while
  planning, execution, or analysis is still in flight this returns a 409 — cancel the thread
  first, then restart.

  No `:event/exploration-update` is published: nothing on the Exploration row changes, so there
  is no revision to record (the revision push skips unchanged objects)."
  [{:keys [thread-id]} :- [:map [:thread-id ms/PositiveInt]]]
  (let [thread      (get-thread-or-404 thread-id)
        exploration (api/write-check (get-exploration-or-404 (:exploration_id thread)))]
    (when-not (reset-thread-for-rerun! thread-id)
      (throw (ex-info (tru "Exploration is still running; cancel it before restarting.")
                      {:status-code 409})))
    (hydrate-exploration exploration)))

(mr/def ::CanceledThread
  "Schema for the cancel endpoint response — just the state-bearing fields the FE needs to
  reflect the cancellation. EQ status changes are picked up via the existing `/queries` poll."
  [:map
   [:id           ms/PositiveInt]
   [:canceled_at  [:maybe :any]]
   [:completed_at [:maybe :any]]])

(api.macros/defendpoint :post "/thread/:thread-id/cancel" :- ::CanceledThread
  "Cancel an in-flight exploration thread. Stamps `canceled_at` and `completed_at` on the thread,
  and bulk-flips any still-`pending` ExplorationQuery rows to `canceled`. In-flight queries
  currently mid-QP-execution are left to run to natural completion — their result rows are
  orphaned but harmless (timeline scoring skips canceled threads).

  Idempotent: a thread with `completed_at IS NOT NULL` (already terminal — natural completion or
  prior cancel) returns 200 with its existing state. Authorization is the same write check as
  other thread-mutating endpoints."
  [{:keys [thread-id]} :- [:map [:thread-id ms/PositiveInt]]]
  (write-check-thread thread-id)
  (let [now (t/offset-date-time)]
    (t2/with-transaction [_conn]
      ;; CAS gate on `completed_at IS NULL` makes both already-canceled and already-completed
      ;; threads safe no-ops. When this UPDATE matches 0 rows, the thread is already terminal.
      (t2/update! :model/ExplorationThread
                  :id           thread-id
                  :completed_at nil
                  {:canceled_at now
                   :completed_at now})
      ;; Bulk-flip pending → canceled. SKIP LOCKED on Postgres/MySQL skips the row currently
      ;; held by an in-flight QP worker so this API call doesn't block on QP duration; that row
      ;; will commit as `done` (or `error`) naturally. H2 has only one worker (see worker-count
      ;; in the runner) so SKIP LOCKED is unnecessary and unsupported.
      ;;
      ;; Done as a select-then-update rather than `WHERE id IN (subquery on the same table)`:
      ;; MySQL/MariaDB reject updating a table referenced by a subquery in the same statement
      ;; (error 1093). The selected rows stay locked until the surrounding transaction commits,
      ;; so the SKIP LOCKED semantics are preserved.
      (let [pending-ids (map :id
                             (t2/query
                              (cond-> {:select [:id]
                                       :from   [:exploration_query]
                                       :where  [:and
                                                [:= :exploration_thread_id thread-id]
                                                [:= :status "pending"]]}
                                (not= :h2 (mdb/db-type)) (assoc :for [:update :skip-locked]))))]
        (when (seq pending-ids)
          (t2/query
           {:update (t2/table-name :model/ExplorationQuery)
            :set    {:status "canceled"}
            :where  [:in :id pending-ids]})))))
  (t2/select-one [:model/ExplorationThread :id :canceled_at :completed_at] :id thread-id))

(api.macros/defendpoint :get "/:id/queries" :- [:sequential ::ExplorationQuerySummary]
  "Lightweight list of queries for an exploration. Excludes `dataset_query` and the result blob —
  intended for the frontend to poll while pending queries finish. The `interestingness_score`
  column is left-joined from `exploration_query_result` so clients can rank/highlight without a
  second roundtrip; pending or errored queries get `nil`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check (get-exploration-or-404 id))
  (t2/hydrate
   (t2/select (into [:model/ExplorationQuery] query-summary-columns)
              {:left-join [:exploration_thread
                           [:= :exploration_query.exploration_thread_id :exploration_thread.id]
                           :exploration_query_result
                           [:= :exploration_query_result.exploration_query_id :exploration_query.id]
                           :stored_result
                           [:= :stored_result.id :exploration_query_result.stored_result_id]]
               :where     [:= :exploration_thread.exploration_id id]
               :order-by  [[:exploration_query.position :asc]
                           [:exploration_query.id :asc]]})
   :segment_name))

(defn- get-exploration-query-or-404
  "Fetch an `ExplorationQuery` by id and read-check it. The model's `can-read?` delegates up
  through `ExplorationThread` to the parent `Exploration`."
  [query-id]
  (api/read-check (api/check-404 (t2/select-one :model/ExplorationQuery :id query-id))))

(defn- stream-stored-result
  "Replay a worker-serialized QP result (gzipped+nippy bytes from `:model/StoredResult.result_data`)
  through the streaming pipeline so the response is shaped like a normal `/api/dataset` response.
  Reuses
  `qp/with-reducible-deserialized-results` — the same machinery the cache middleware
  uses to replay cached results."
  [export-format ^bytes result-bytes]
  (qp.streaming/streaming-response [rff export-format]
    (qp/with-reducible-deserialized-results
      [[qp-result _] (ByteArrayInputStream. result-bytes)]
      (when qp-result
        (let [data (:data qp-result)]
          (qp.pipeline/*reduce* rff
                                (dissoc data :rows)
                                (or (:rows data) [])))))))

(api.macros/defendpoint :get "/query/:id" :- ::ExplorationQueryStreamResponse
  "Stream the result of a single completed exploration query. The optional `format` query param
  is one of `api`, `json`, `csv`, `xlsx` (default `api`). When the underlying query is still
  pending or has errored, returns a 409 with status info instead of streaming."
  [{:keys [id]}     :- [:map [:id ms/PositiveInt]]
   {:keys [format]} :- [:map
                        [:format {:default :api}
                         [:enum {:decode/api keyword} :api :csv :json :xlsx]]]]
  (let [q (get-exploration-query-or-404 id)]
    (case (:status q)
      "done"
      (let [sr (api/check-404 (eqr/stored-results id))]
        ;; The cached `result_data` was produced under the creator's lens, so a non-creator viewer
        ;; might otherwise see rows the QP would have filtered out for them. Gate against the
        ;; creator's stored data-access token (sandbox/impersonation/routing) + basic data perms.
        (when-not (= api/*current-user-id* (:creator_id sr))
          (queries/assert-can-view-cached-result! sr))
        (stream-stored-result format (:result_data sr)))

      ;; Pending / errored: no blob exists yet and the response is status-only (no rows, no
      ;; derived text), so it carries no data to leak — it rides the exploration's collection
      ;; perms (already enforced by `get-exploration-query-or-404`'s read-check), like seeing a
      ;; dashboard card that's still loading.
      {:status 409
       :body   (select-keys q [:id :status :error_message :started_at :finished_at])})))

(api.macros/defendpoint :put "/page/:id/starred" :- :nil
  "Set whether an exploration page is starred."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [starred]} :- [:map [:starred :boolean]]]
  (let [page (get-exploration-page-or-404 id)]
    (api/write-check page)
    (t2/update! :model/ExplorationPage id {:starred starred}))
  nil)

(api.macros/defendpoint :put "/pages/hidden" :- :nil
  "Set whether one or more exploration pages are hidden from the sidebar. Hiding a single
  page passes a one-element `page_ids`; hiding a whole group passes all its page ids."
  [_route-params
   _query-params
   {:keys [page_ids hidden]} :- [:map
                                 [:page_ids [:sequential ms/PositiveInt]]
                                 [:hidden :boolean]]]
  (doseq [id page_ids]
    (api/write-check (get-exploration-page-or-404 id)))
  (when (seq page_ids)
    (t2/update! :model/ExplorationPage :id [:in page_ids] {:hidden hidden}))
  nil)

;;; ----------------------------------------- routes -----------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/exploration/` routes."
  (api.macros/ns-handler *ns* +auth))
