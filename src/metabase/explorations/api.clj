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
   [metabase.documents.core :as documents]
   [metabase.events.core :as events]
   [metabase.explorations.ai-summary :as ai-summary]
   [metabase.explorations.blocks :as explorations.blocks]
   [metabase.explorations.core :as explorations]
   [metabase.explorations.derived-perms :as derived-perms]
   [metabase.explorations.models.exploration :as expl.model]
   [metabase.explorations.models.exploration-block :as block]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.queries.core :as queries]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.util :as u]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.io ByteArrayInputStream)))

(set! *warn-on-reflection* true)

;;; ----------------------------------------- helpers -----------------------------------------

(def ^:private default-document-name
  "Base name for auto-created exploration documents. Appended with \" 2\", \" 3\", etc. when
  duplicates exist on a thread."
  "Scratchpad")

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

(defn- thread-ids-of-exploration-query
  "HoneySQL subquery selecting every thread id belonging to an exploration. Used as the
  `:in` clause for the thread-doc cascades below."
  [exploration-id]
  {:select [:id] :from [:exploration_thread] :where [:= :exploration_id exploration-id]})

(defn- cascade-collection-id-to-thread-documents!
  "Propagate an Exploration's new `collection_id` to all documents attached to its threads.
  Mirrors the dashboard-question cascade in `dashboards_rest/api.clj`."
  [exploration-id new-coll-id]
  (t2/update! :model/Document
              :exploration_thread_id [:in (thread-ids-of-exploration-query exploration-id)]
              {:collection_id new-coll-id}))

(defn- cascade-archived-to-thread-documents!
  "Propagate an Exploration's archive flip to all documents attached to its threads.
  Mirrors `dashboards_rest/api.clj` (parent-archive cascade for dashboard questions):
  on archive, flip every doc that wasn't already archived directly; on unarchive,
  flip every doc that was cascade-archived. Docs with `archived_directly=true`
  (user-archived) are never touched."
  [exploration-id new-archived?]
  (let [thread-ids (thread-ids-of-exploration-query exploration-id)]
    (if new-archived?
      (t2/update! :model/Document
                  :exploration_thread_id [:in thread-ids]
                  :archived              false
                  {:archived true :archived_directly false})
      (t2/update! :model/Document
                  :exploration_thread_id [:in thread-ids]
                  :archived              true
                  :archived_directly     false
                  {:archived false}))))

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
                (assoc thread :queries [] :blocks [] :name nil)))
          threads)))

(defn- hydrate-exploration [exploration]
  (-> exploration
      (t2/hydrate :creator :can_write :collection
                  [:threads :queries :documents :timelines])
      (update :threads #(some->> % gate-threads-derived-data))))

(defn- insert-thread-default-documents!
  "Insert the default Scratchpad doc, plus an AI-summary placeholder when configured."
  ([thread-id coll-id]
   (insert-thread-default-documents! thread-id coll-id {}))
  ([thread-id coll-id {:keys [include-ai-summary?] :or {include-ai-summary? true}}]
   (t2/insert! :model/Document
               {:name                  default-document-name
                :document              {:type "doc" :content []}
                :content_type          documents/prose-mirror-content-type
                :creator_id            api/*current-user-id*
                :collection_id         coll-id
                :exploration_thread_id thread-id})
   (when (and include-ai-summary? (ai-summary/current-user-can-create-ai-summary?))
     (ai-summary/create-placeholder-doc! thread-id api/*current-user-id* coll-id))))

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

(defn- reset-ai-summary-doc!
  [thread-id]
  (when-let [doc-id (t2/select-one-fn :ai_summary_document_id :model/ExplorationThread :id thread-id)]
    (t2/update! :model/Document doc-id {:document (ai-summary/placeholder-pm-doc)})))

(defn- reset-thread-for-rerun!
  [thread-id]
  (t2/delete! :model/ExplorationQuery :exploration_thread_id thread-id)
  (reset-ai-summary-doc! thread-id)
  (t2/update! :model/ExplorationThread thread-id
              {:started_at            (t/offset-date-time)
               :query_plan_started_at nil
               :query_plan_transcript nil
               :analysis_started_at   nil
               :completed_at          nil
               :canceled_at           nil}))

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

(def ^:private leading-aggregation-prefix-re
  "Strips a metric name's leading aggregation words (\"Number of \", \"Count of \", \"Sum of \",
  \"Total \", \"Average \") so `Number of bugs` reduces to the bare noun `bugs`."
  #"(?i)^(number|count|sum|total|average|avg)\s+(of\s+)?")

(defn- explore-further-thread-name
  "Build the sidebar name for an \"Explore further\" thread from the metric Card name and the
  clicked `values` — e.g. card `Number of bugs` + value `open` → `Open bugs`.

  A click carries one value per breakout the chart has, so a grouped bar or a table/map cell
  yields several: all of them are joined, the same way the block's chart titles join them (see
  `metabase.explorations.blocks`), so `Number of bugs` clicked at (`open`, `2024`) becomes
  `Open / 2024 bugs`. Naming the thread after only one of the clicked values would describe a
  narrower scope than the queries actually run under. Falls back to the card name when no value
  is usable."
  [card-name values]
  (let [head (->> values
                  (keep #(some-> % str str/trim not-empty))
                  (map u/capitalize-first-char)
                  (str/join " / ")
                  not-empty)]
    (if (nil? head)
      card-name
      (let [noun (str/replace (or card-name "") leading-aggregation-prefix-re "")]
        (str/trim (str head " " noun))))))

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
   asserted here; `interestingness_score` and `contextual_interestingness_score` are
   left-joined (in `/:id/queries`) or batched-hydrated (in `/:id`) from
   `exploration_query_result` and may be nil for pending/errored queries or — for the
   contextual score — when the LLM is unconfigured or the thread had no prompt."
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
   [:timeline_interestingness         {:optional true} [:maybe [:sequential
                                                                [:map
                                                                 [:timeline_id           ms/PositiveInt]
                                                                 [:interestingness_score {:optional true} [:maybe number?]]]]]]])

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
   [:id       ms/PositiveInt]
   [:type     [:enum "metric" "dimension"]]
   [:name     [:maybe :string]]
   [:position ms/IntGreaterThanOrEqualToZero]
   [:pages    [:sequential ::ExplorationPageNode]]])

(mr/def ::ExplorationDocument
  "Schema for a document attached to an exploration thread."
  [:map
   [:id                    ms/PositiveInt]
   [:name                  :string]
   [:exploration_thread_id ms/PositiveInt]
   [:creator_id            ms/PositiveInt]
   [:content_type          :string]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]])

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
   [:ai_summary_document_id     {:optional true} [:maybe ms/PositiveInt]]
   [:queries                    {:optional true} [:maybe [:sequential ::ExplorationQuerySummary]]]
   [:blocks                     {:optional true} [:maybe [:sequential ::ExplorationBlockNode]]]
   [:documents                  {:optional true} [:maybe [:sequential ::ExplorationDocument]]]
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
  "Lightweight row for the `GET /mine` list. No threads/queries/documents — just the metadata
  needed to render a list entry, plus `current_user_last_touched_at`, the timestamp the list is
  sorted by (the caller's own most-recent touch of this exploration, composed across the
  exploration's revisions, its attached documents' revisions, and its creation)."
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
   [:field_ref [:sequential :any]]
   [:value     :any]])

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
  and timelines, and stamp the thread as started. The background planning worker (see
  `metabase.explorations.query-plan`) picks the thread up, calls an LLM to decide which charts
  to materialize, and inserts the `exploration_query` rows. This endpoint returns immediately
  with an empty queries list; clients should poll `GET /:id/queries` until rows appear.

  Accepts the per-area `:blocks` payload (one entry per Research-plan block), persisted
  verbatim, plus a thread-scoped `:timeline_ids`."
  [_route-params
   _query-params
   {:keys [name description prompt collection_id blocks timeline_ids]} :- CreateExploration]
  (api/create-check :model/Exploration {:collection_id collection_id})
  ;; Block metric-card and timeline references are persisted verbatim and read back unfiltered
  ;; (planning context, AI-summary name/event lookups, thread hydration), so attach time is the
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
                coll-id     (:collection_id exploration)
                thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                                   {:exploration_id (:id exploration)
                                                                    :prompt         prompt
                                                                    :position       0}))
                tid         (:id thread)]
            (insert-thread-default-documents! tid coll-id)
            (insert-blocks! tid blocks)
            (insert-thread-timelines! tid timeline_ids)
            ;; Setting `started_at` is the signal to the background planning worker that this
            ;; thread is ready to plan + execute. The worker's claim predicate matches threads
            ;; with `started_at IS NOT NULL` and `query_plan_started_at IS NULL`.
            (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
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
          ;; The clicked page must live in *this* exploration — a page keys off a block off a
          ;; thread off an exploration, and "Explore further" only ever drills a chart the caller
          ;; is already viewing here. Reject anything else with a 404: without this check a caller
          ;; could copy any page in the instance (metric selections, dimension snapshots, card ids,
          ;; and the queries the planner then runs) into an exploration they can write (IDOR).
          _             (api/check-404 (t2/exists? :model/ExplorationThread
                                                   :id src-thread-id :exploration_id id))
          card-id       (:card_id (first (:metrics block)))
          card-name     (when card-id (t2/select-one-fn :name :model/Card :id card-id))
          ;; Append, don't overwrite: a source block that itself came from a prior drill already
          ;; carries `:explore_filters`; `into` keeps that earlier segment scope and adds this one.
          metrics'      (mapv #(update % :explore_filters (fnil into []) explore_filters)
                              (:metrics block))
          timeline-ids  (t2/select-fn-vec :timeline_id :model/ExplorationThreadTimeline
                                          :exploration_thread_id src-thread-id
                                          {:order-by [[:position :asc] [:id :asc]]})
          next-position (inc (or (t2/select-one-fn :position :model/ExplorationThread
                                                   :exploration_id id
                                                   {:order-by [[:position :desc] [:id :desc]]})
                                 0))
          coll-id       (:collection_id exploration)]
      (t2/with-transaction [_]
        (let [thread (first (t2/insert-returning-instances!
                             :model/ExplorationThread
                             {:exploration_id id
                              :name           (explore-further-thread-name card-name
                                                                           (map :value explore_filters))
                              :position       next-position
                              ;; drill lineage — lets the sidebar nest this thread
                              ;; under the one owning the drilled page
                              :source_page_id page_id}))
              tid    (:id thread)]
          (insert-thread-default-documents! tid coll-id {:include-ai-summary? false})
          (t2/insert! :model/ExplorationBlock
                      {:exploration_thread_id tid
                       :type                  (:type block)
                       :metrics               metrics'
                       :dimensions            (stringify-dim-types (:dimensions block))
                       :position              0})
          (insert-thread-timelines! tid timeline-ids)
          ;; Stamp `started_at` last — it's the signal the planning worker claims on.
          (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
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
  touch (descending). \"Touch\" is the union of three streams, all attributed to the user:

    1. the user's `Exploration` revisions (metadata / structure edits),
    2. the user's `Document` revisions for documents attached to the exploration's threads
       (scratchpad / AI-summary edits, mapped back via `exploration_thread`),
    3. `exploration.created_at` for explorations the user created — creation is a touch, and
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
                     {:select [[:t.exploration_id :eid] [:dr.timestamp :ts]]
                      :from   [[:revision :dr]]
                      :join   [[:document :d]           [:= :d.id :dr.model_id]
                               [:exploration_thread :t] [:= :t.id :d.exploration_thread_id]]
                      :where  [:and [:= :dr.model "Document"] [:= :dr.user_id user-id]]}
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

  \"Touched\" composes the user's own edits to the exploration, to its attached documents
  (scratchpad / AI-summary), and its creation — see [[my-explorations-honeysql]]. Explorations
  that were moved into a collection the user can no longer read are excluded, as are archived
  ones. Returns the collection-items envelope: `{:total :limit :offset :data}`."
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
  `api/write-check` against the exploration itself via `:perms/use-parent-collection-perms`.

  Moving an exploration cascades the new `collection_id` onto every document attached to its
  threads. Archiving or unarchiving the exploration cascades the new `archived` flag onto those
  same documents (skipping any that were directly user-archived, mirroring the dashboard /
  dashboard-question pattern)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   updates :- UpdateExploration]
  (let [existing            (get-exploration-or-404 id)
        updates'            (api/updates-with-archived-directly existing updates)
        moving?             (and (contains? updates' :collection_id)
                                 (not= (:collection_id existing) (:collection_id updates')))
        archiving-changing? (and (contains? updates' :archived)
                                 (not= (:archived existing) (:archived updates')))]
    (api/write-check existing)
    (check-destination-collection-perms! existing updates')
    (t2/with-transaction [_]
      (when (seq updates')
        (t2/update! :model/Exploration id updates'))
      (when moving?
        (cascade-collection-id-to-thread-documents! id (:collection_id updates')))
      (when archiving-changing?
        (cascade-archived-to-thread-documents! id (:archived updates'))))
    (let [updated (t2/select-one :model/Exploration :id id)]
      (when (seq updates')
        (events/publish-event! :event/exploration-update
                               {:object updated :user-id api/*current-user-id*}))
      (hydrate-exploration updated))))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Hard-delete an exploration. Soft delete is `PUT /api/exploration/:id {archived: true}`.

  Cascades to every `exploration_thread`, `exploration_query`, and attached `document`
  via the on-delete-cascade FKs configured in the explorations migration."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [existing (get-exploration-or-404 id)]
    (api/write-check existing)
    (t2/delete! :model/Exploration :id id))
  nil)

(def ^:private query-summary-columns
  "Column projection for `::ExplorationQuerySummary` rows — excludes `dataset_query` and the
  result blob, joins both interestingness scores from `exploration_query_result`."
  [:exploration_query.id :exploration_query.exploration_thread_id
   :exploration_query.card_id :exploration_query.segment_id
   :exploration_query.dimension_id :exploration_query.query_type
   :exploration_query.name :exploration_query.position
   :exploration_query.status :exploration_query.error_message
   :exploration_query.started_at :exploration_query.finished_at
   :exploration_query.entity_id
   [:exploration_query_result.interestingness_score            :interestingness_score]
   [:exploration_query_result.contextual_interestingness_score :contextual_interestingness_score]])

(defn- get-exploration-page-or-404
  [page-id]
  (api/check-404 (t2/select-one :model/ExplorationPage :id page-id)))

(def ^:private document-summary-columns
  [:id :name :exploration_thread_id :creator_id :content_type :created_at :updated_at :archived])

(defn- get-thread-or-404
  "Fetch the thread, or 404."
  [thread-id]
  (api/check-404 (t2/select-one :model/ExplorationThread :id thread-id)))

(defn- read-check-thread [thread-id]
  (let [thread (get-thread-or-404 thread-id)]
    (api/read-check (get-exploration-or-404 (:exploration_id thread)))
    thread))

(defn- write-check-thread [thread-id]
  (let [thread (get-thread-or-404 thread-id)]
    (api/write-check (get-exploration-or-404 (:exploration_id thread)))
    thread))

(api.macros/defendpoint :post "/thread/:thread-id/restart" :- ::HydratedExploration
  "Re-run one exploration thread in place, keeping its selections: drops the thread's materialized
  queries, resets its AI Summary doc to the placeholder, and clears the terminal-state gates so the
  background planner re-claims it. Returns the parent exploration."
  [{:keys [thread-id]} :- [:map [:thread-id ms/PositiveInt]]]
  (let [thread      (get-thread-or-404 thread-id)
        exploration (api/write-check (get-exploration-or-404 (:exploration_id thread)))]
    (t2/with-transaction [_]
      (reset-thread-for-rerun! thread-id)
      (events/publish-event! :event/exploration-update
                             {:object exploration :user-id api/*current-user-id*})
      (hydrate-exploration exploration))))

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
  orphaned but harmless (timeline scoring and AI Summary both skip canceled threads).

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

(api.macros/defendpoint :get "/thread/:thread-id/documents" :- [:sequential ::ExplorationDocument]
  "List all documents owned by an exploration thread, ordered by creation time."
  [{:keys [thread-id]} :- [:map [:thread-id ms/PositiveInt]]]
  (read-check-thread thread-id)
  (t2/select (into [:model/Document] document-summary-columns)
             :exploration_thread_id thread-id
             :archived false
             {:order-by [[:created_at :asc] [:id :asc]]}))

(defn- next-document-name
  "Return the next auto-incremented name for [[default-document-name]] on `thread-id`.
  Bare name counts as 1, so the sequence is: Scratchpad, Scratchpad 2, Scratchpad 3, ..."
  [thread-id]
  (let [base    default-document-name
        pattern (re-pattern (str base " (\\d+)"))
        names   (->> (t2/select-fn-set :name :model/Document
                                       :exploration_thread_id thread-id
                                       :archived false
                                       :name [:like (str base "%")])
                     (keep (fn [n]
                             (if (= n base)
                               1
                               (when-let [m (re-matches pattern n)]
                                 (parse-long (second m)))))))]
    (if (empty? names)
      base
      (str base " " (inc (apply max names))))))

(api.macros/defendpoint :post "/thread/:thread-id/documents" :- ::ExplorationDocument
  "Create an additional empty document on an exploration thread."
  [{:keys [thread-id]} :- [:map [:thread-id ms/PositiveInt]]]
  (write-check-thread thread-id)
  (let [doc-id (t2/insert-returning-pk! :model/Document
                                        {:name                  (next-document-name thread-id)
                                         :document              {:type "doc" :content []}
                                         :content_type          documents/prose-mirror-content-type
                                         :creator_id            api/*current-user-id*
                                         :exploration_thread_id thread-id})]
    (t2/select-one (into [:model/Document] document-summary-columns) :id doc-id)))

(defn- get-thread-document-or-404
  "Fetch a document that belongs to the given thread, or 404."
  [thread-id document-id]
  (api/check-404 (t2/select-one :model/Document
                                :id document-id
                                :exploration_thread_id thread-id
                                :archived false)))

(defn- append-chart-nodes
  "Append a static `cardEmbed` node referencing `card-id` (the per-document materialized
  Card carrying display / visualization_settings / dataset_query) and `stored-result-id`
  (the cached snapshot the static renderer reads bytes from) to the end of a prose-mirror
  document body. The embed is wrapped in a `resizeNode` to match the FE schema for all
  `cardEmbed` nodes (live and static).

  `chart-href` is written onto the node so the FE turns the embed's title into a link back
  to the chart's page in the exploration (instead of the saved-Card URL the title would
  otherwise navigate to).

  Tolerates a missing/non-doc root by replacing it with an empty doc."
  [doc card-id stored-result-id chart-href]
  (let [base  (if (and (map? doc) (= "doc" (:type doc)))
                doc
                {:type "doc" :content []})
        embed {:type    "resizeNode"
               :content [{:type  "cardEmbed"
                          :attrs (cond-> {:id card-id :name nil :stored_result_id stored-result-id}
                                   chart-href (assoc :chart_href chart-href))}]}]
    (update base :content (fnil into []) [embed])))

(api.macros/defendpoint :post "/thread/:thread-id/documents/:document-id/append" :- ::ExplorationDocument
  "Append a static `cardEmbed` representing a *composite chart* — built from one or more
  `ExplorationQuery` snapshots combined into a single qp-result — to the end of the document
  body.

  The body `:exploration_query_ids` is the FE-rendered SeriesGroup's full set (one entry
  for single-query charts; multiple for combined cartesian / heat-map charts). The BE
  combines those source snapshots (`metabase.explorations.composite/combine`) into one
  ephemeral `stored_result` and materialises one ephemeral `report_card` referencing it.
  The cardEmbed node remains single-card.

  - `chart_href` is written onto the node so the FE makes the embed's card title a link
    back to the source chart in the exploration view.
  - `display` / `visualization_settings` are FE-computed render settings (from
    `buildSeries` / `getDisplay`); the BE bakes them onto the ephemeral card. Either may
    be omitted — the legacy `pick-display+viz-settings` recompute fills the gap.

  All source EQs must belong to `thread-id`. Each append produces a fresh ephemeral card;
  the same source snapshot can back many embeds, possibly across documents."
  [{:keys [thread-id document-id]} :- [:map
                                       [:thread-id   ms/PositiveInt]
                                       [:document-id ms/PositiveInt]]
   _query-params
   {:keys [exploration_query_ids display visualization_settings]}
   :- [:map
       [:exploration_query_ids   [:sequential {:min 1} ms/PositiveInt]]
       [:display                 {:optional true} [:maybe :string]]
       [:visualization_settings  {:optional true} [:maybe :map]]]]
  (write-check-thread thread-id)
  (let [doc (get-thread-document-or-404 thread-id document-id)]
    ;; Every requested EQ must exist and belong to this thread — validate in one query.
    (api/check-404 (= (count (distinct exploration_query_ids))
                      (t2/count :model/ExplorationQuery
                                :id [:in exploration_query_ids]
                                :exploration_thread_id thread-id)))
    (t2/with-transaction [_conn]
      (let [{:keys [card-id stored-result-id primary-eq]}
            (eqr/create-ephemeral-card-for-exploration-queries!
             exploration_query_ids (:id doc) (:collection_id doc)
             @api/*current-user*
             {:display                display
              :visualization-settings visualization_settings})
            exp-id     (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread-id)
            chart-href (explorations.blocks/page-url exp-id (:page_id primary-eq))
            new-body (-> (:document doc)
                         (append-chart-nodes card-id stored-result-id chart-href)
                         documents/add-ids-to-nodes)]
        (t2/update! :model/Document (:id doc) {:document new-body})))
    (t2/select-one (into [:model/Document] document-summary-columns) :id (:id doc))))

(api.macros/defendpoint :get "/:id/queries" :- [:sequential ::ExplorationQuerySummary]
  "Lightweight list of queries for an exploration. Excludes `dataset_query` and the result blob —
  intended for the frontend to poll while pending queries finish. The `interestingness_score`
  column is left-joined from `exploration_query_result` so clients can rank/highlight without a
  second roundtrip; pending or errored queries get `nil`. Per-`(query, timeline)` scores are
  batched-hydrated as `:timeline_interestingness` so the client can highlight relevant timelines
  for the focused chart."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check (get-exploration-or-404 id))
  (t2/hydrate
   (t2/select (into [:model/ExplorationQuery] query-summary-columns)
              {:left-join [:exploration_thread
                           [:= :exploration_query.exploration_thread_id :exploration_thread.id]
                           :exploration_query_result
                           [:= :exploration_query_result.exploration_query_id :exploration_query.id]]
               :where     [:= :exploration_thread.exploration_id id]
               :order-by  [[:exploration_query.position :asc]
                           [:exploration_query.id :asc]]})
   :segment_name
   :timeline_interestingness))

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
