(ns metabase.explorations.api
  "`/api/exploration` routes."
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.collections.models.collection :as collection]
   [metabase.documents.core :as documents]
   [metabase.events.core :as events]
   [metabase.explorations.ai-summary :as ai-summary]
   [metabase.explorations.core :as explorations]
   [metabase.explorations.groups :as explorations.groups]
   [metabase.explorations.models.exploration :as expl.model]
   [metabase.explorations.models.exploration-query-result :as eqr]
   [metabase.queries.core :as queries]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.codec :as codec]
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
      (when new-coll
        (api/check-400 (t2/exists? :model/Collection :id new-coll :archived false)))
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

(defn- attach-thread-groups [thread]
  (let [card-names (into {} (keep (fn [{:keys [card_id card]}]
                                    (when-let [n (:name card)] [card_id n])))
                         (:metrics thread))]
    (assoc thread :groups (explorations.groups/auto-groups (:queries thread) card-names))))

(defn- attach-query-dimension-labels
  "Attach `:dimension_name` to each query on `thread`. Each thread dimension is enriched with
  `:group` looked up from the metric Cards' snapshotted `:dimensions` (the only place group
  metadata lives), then `exploration-query-dim-label` is applied with ambiguity scoped to the
  thread's own dimension set."
  [thread]
  (let [card-dim-by-id (into {}
                             (mapcat (fn [{:keys [card]}]
                                       (map (juxt :id identity) (:dimensions card))))
                             (:metrics thread))
        enriched-dims  (mapv (fn [d]
                               (if-let [group (get-in card-dim-by-id [(:dimension_id d) :group])]
                                 (assoc d :group group)
                                 d))
                             (:dimensions thread))
        dim-by-id      (into {} (map (juxt :dimension_id identity)) enriched-dims)
        name-counts    (frequencies (keep :display_name enriched-dims))]
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

(defn- hydrate-exploration [exploration]
  (-> exploration
      (t2/hydrate :creator :can_write :collection
                  [:threads [:metrics :card] :dimensions :timelines :queries :documents])
      (update :threads #(some->> % (mapv attach-thread-groups)))
      (update :threads #(some->> % (mapv attach-query-dimension-labels)))))

(defn- insert-thread-default-documents!
  "Insert the default Scratchpad doc, plus an AI-summary placeholder when configured."
  [thread-id coll-id]
  (t2/insert! :model/Document
              {:name                  default-document-name
               :document              {:type "doc" :content []}
               :content_type          documents/prose-mirror-content-type
               :creator_id            api/*current-user-id*
               :collection_id         coll-id
               :exploration_thread_id thread-id})
  (when (ai-summary/ai-summary-available?)
    (ai-summary/create-placeholder-doc! thread-id api/*current-user-id* coll-id)))

(defn- positional-rows
  "Stamp `:exploration_thread_id` and a 0-based `:position` onto each row in `rows`."
  [thread-id rows]
  (map-indexed (fn [i row]
                 (assoc row :exploration_thread_id thread-id :position i))
               rows))

(defn- insert-thread-metrics! [thread-id metrics]
  (when (seq metrics)
    (t2/insert! :model/ExplorationThreadMetric (positional-rows thread-id metrics))))

(defn- insert-thread-dimensions! [thread-id dimensions]
  (when (seq dimensions)
    (t2/insert! :model/ExplorationThreadDimension (positional-rows thread-id dimensions))))

(defn- insert-thread-timelines! [thread-id timeline-ids]
  (when (seq timeline-ids)
    (t2/insert! :model/ExplorationThreadTimeline
                (positional-rows thread-id
                                 (map (fn [tl-id] {:timeline_id tl-id}) timeline-ids)))))

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
   [:user_interestingness             {:optional true} [:maybe [:enum 0 1 2]]]
   [:entity_id                        {:optional true} [:maybe :string]]
   [:interestingness_score            {:optional true} [:maybe number?]]
   [:contextual_interestingness_score {:optional true} [:maybe number?]]
   [:timeline_interestingness         {:optional true} [:maybe [:sequential
                                                                [:map
                                                                 [:timeline_id           ms/PositiveInt]
                                                                 [:interestingness_score {:optional true} [:maybe number?]]]]]]])

(mr/def ::ExplorationQueryGroup
  "Schema for an auto-derived group bundling related queries on a single thread.
   `:query_ids` references queries that exist on the same thread. `:parent_group_id`
   references another group's `:id` within the same `:groups` list (nil = top
   level). Type is just `auto` for now but will allow for user-defined groups at some
   point down the road.

   `:display_type` tells the FE how to render the group:
     - `\"singleton\"` — exactly one query; sidebar shows it as a single row
     - `\"page\"`      — multiple queries to render together on one page when opened
     - `\"sidebar\"`   — group expands/collapses inline as a dropdown in the sidebar

   The current heuristic emits a two-level tree: one `\"sidebar\"` group per metric
   (top level, `:parent_group_id = nil`, `:query_ids = []` — its queries live on the
   linked children below) and the existing `(card, dim)` `\"singleton\"`/`\"page\"`
   leaves as children pointing at their metric via `:parent_group_id`."
  [:map
   [:id              :string]
   [:parent_group_id [:maybe :string]]
   [:position        ms/IntGreaterThanOrEqualToZero]
   [:type            [:enum "auto"]]
   [:display_type    [:enum "page" "singleton" "sidebar"]]
   [:name            [:maybe :string]]
   [:query_ids       [:sequential ms/PositiveInt]]])

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
   [:started_at                 {:optional true} [:maybe :any]]
   [:ai_summary_document_id     {:optional true} [:maybe ms/PositiveInt]]
   [:metrics                    {:optional true} [:maybe [:sequential :map]]]
   [:dimensions                 {:optional true} [:maybe [:sequential :map]]]
   [:timelines                  {:optional true} [:maybe [:sequential :map]]]
   [:queries                    {:optional true} [:maybe [:sequential ::ExplorationQuerySummary]]]
   [:groups                     {:optional true} [:maybe [:sequential ::ExplorationQueryGroup]]]
   [:documents                  {:optional true} [:maybe [:sequential ::ExplorationDocument]]]])

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

(def ^:private CreateExploration
  [:map
   [:name         expl.model/ExplorationName]
   [:description  {:optional true} [:maybe :string]]
   [:prompt       {:optional true} [:maybe :string]]
   [:metrics      {:optional true} [:maybe [:sequential MetricSelection]]]
   [:dimensions   {:optional true} [:maybe [:sequential DimensionSelection]]]
   [:timeline_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

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
   [:result_column_name   {:optional true} [:maybe :string]]])

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
  with an empty queries list; clients should poll `GET /:id/queries` until rows appear."
  [_route-params
   _query-params
   {:keys [name description prompt metrics dimensions timeline_ids]} :- CreateExploration]
  (t2/with-transaction [_]
    (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                             {:name        name
                                                              :description description
                                                              :creator_id  api/*current-user-id*}))
          coll-id     (:collection_id exploration)
          thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                             {:exploration_id (:id exploration)
                                                              :prompt         prompt
                                                              :position       0}))
          tid         (:id thread)]
      (insert-thread-default-documents! tid coll-id)
      (insert-thread-metrics! tid metrics)
      (insert-thread-dimensions! tid dimensions)
      (insert-thread-timelines! tid timeline_ids)
      ;; Setting `started_at` is the signal to the background planning worker that this
      ;; thread is ready to plan + execute. The worker's claim predicate matches threads
      ;; with `started_at IS NOT NULL` and `query_plan_started_at IS NULL`.
      (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
      (let [persisted (t2/select-one :model/Exploration :id (:id exploration))]
        (events/publish-event! :event/exploration-create
                               {:object persisted :user-id api/*current-user-id*})
        (hydrate-exploration persisted)))))

(api.macros/defendpoint :get "/dimensions" :- ::DimensionsResponse
  "Hydrated metrics plus a deduplicated dimension list, for the Exploration data modal.

  Optional `q` filters case-insensitively across metric name and dimension display-name."
  [_route-params
   {:keys [q]} :- [:maybe [:map [:q {:optional true} [:maybe ms/NonBlankString]]]]]
  (explorations/exploration-data {:q q}))

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
  api/generic-204-no-content)

(def ^:private query-summary-columns
  "Column projection for `::ExplorationQuerySummary` rows — excludes `dataset_query` and the
  result blob, joins both interestingness scores from `exploration_query_result`."
  [:exploration_query.id :exploration_query.exploration_thread_id
   :exploration_query.card_id :exploration_query.segment_id
   :exploration_query.dimension_id :exploration_query.query_type
   :exploration_query.name :exploration_query.position
   :exploration_query.status :exploration_query.error_message
   :exploration_query.started_at :exploration_query.finished_at
   :exploration_query.user_interestingness
   :exploration_query.entity_id
   [:exploration_query_result.interestingness_score            :interestingness_score]
   [:exploration_query_result.contextual_interestingness_score :contextual_interestingness_score]])

(defn- query-summary
  "Fetch a single `::ExplorationQuerySummary` row by `exploration_query.id`."
  [query-id]
  (t2/select-one (into [:model/ExplorationQuery] query-summary-columns)
                 {:left-join [:exploration_query_result
                              [:= :exploration_query_result.exploration_query_id :exploration_query.id]]
                  :where     [:= :exploration_query.id query-id]}))

(def ^:private document-summary-columns
  [:id :name :exploration_thread_id :creator_id :content_type :created_at :updated_at :archived])

(defn- get-thread-or-404
  "Fetch the thread and its parent exploration, or 404."
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

(defn- chart-page-url
  "Relative URL of a chart's leaf-group page in the exploration detail view. The group id
  follows [[metabase.explorations.groups/leaf-group-id]]; the route segment is
  percent-encoded to match the client's `encodeURIComponent`."
  [exploration-id card-id dimension-id]
  (str "/question/research/" exploration-id
       "/group/" (codec/url-encode (explorations.groups/leaf-group-id card-id dimension-id))))

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
  "Append a static `cardEmbed` for `exploration_query_id` to the end of the document body.
  Resolves the EQ's `stored_result_id` via the EQR FK chain, materializes a `report_card`
  for this particular document embed (carrying display / visualization_settings /
  dataset_query), and writes both ids into the node attrs. Each append produces a fresh
  Card — the same snapshot can be embedded multiple times, possibly across documents, and
  each embed gets its own Card so settings can diverge later without touching the others.

  The cardEmbed node also carries `chart_href` — the exploration chart-page URL — so the
  FE makes the embed's card title a link back to the source chart in the exploration view
  (instead of the saved-Card URL the title would otherwise navigate to).

  Optional `display` and `visualization_settings` in the request body let the FE pass its
  fully-computed render settings (from `buildSeries` / `getDisplay`) for the materialized
  Card — preserving e.g. `graph.dimensions: [date, breakout]`, `graph.split_panels`,
  `table.pivot`, axis-title clearing on labeled layouts, etc. that the BE's recompute
  step wouldn't produce."
  [{:keys [thread-id document-id]} :- [:map
                                       [:thread-id   ms/PositiveInt]
                                       [:document-id ms/PositiveInt]]
   _query-params
   {:keys [exploration_query_id display visualization_settings]}
   :- [:map
       [:exploration_query_id    ms/PositiveInt]
       [:display                 {:optional true} [:maybe :string]]
       [:visualization_settings  {:optional true} [:maybe :map]]]]
  (write-check-thread thread-id)
  (let [doc        (get-thread-document-or-404 thread-id document-id)
        eq         (api/check-404 (t2/select-one :model/ExplorationQuery :id exploration_query_id))
        _          (api/check-404 (= thread-id (:exploration_thread_id eq)))
        sr-id      (api/check-404
                    (t2/select-one-fn :stored_result_id :model/ExplorationQueryResult
                                      :exploration_query_id exploration_query_id))
        card-id    (eqr/create-card-for-stored-result!
                    sr-id (:id doc) (:collection_id doc) @api/*current-user*
                    {:display-override                display
                     :visualization-settings-override visualization_settings})
        exp-id     (t2/select-one-fn :exploration_id :model/ExplorationThread :id thread-id)
        chart-href (chart-page-url exp-id (:card_id eq) (:dimension_id eq))
        new-body   (append-chart-nodes (:document doc) card-id sr-id chart-href)]
    (t2/update! :model/Document (:id doc) {:document new-body})
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
  `cache.impl/with-reducible-deserialized-results` — the same machinery the cache middleware
  uses to replay cached results."
  [export-format ^bytes result-bytes]
  (qp.streaming/streaming-response [rff export-format]
    (cache.impl/with-reducible-deserialized-results
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
        ;; The cached `result_data` was produced by the creator, so non-creator viewers might
        ;; otherwise see data the QP would have filtered out for them. Block when the viewer
        ;; is sandboxed/impersonated for the snapshot's DB or lacks data perms on it.
        (when-not (= api/*current-user-id* (:creator_id sr))
          (queries/assert-can-view-cached-result! sr))
        (stream-stored-result format (:result_data sr)))

      (do
        (queries/assert-can-view-cached-result! {:id            (:id q)
                                                 :database_id   (:database (:dataset_query q))
                                                 :dataset_query (:dataset_query q)})
        {:status 409
         :body   (select-keys q [:id :status :error_message :started_at :finished_at])}))))

(api.macros/defendpoint :put "/query/:id/interesting" :- ::ExplorationQuerySummary
  "Set the owner's interestingness rating on an exploration query.
  `user_interestingness` is `0` (not interesting), `1` (hmm), or `2` (interesting)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [user_interestingness]} :- [:map [:user_interestingness [:enum 0 1 2]]]]
  (api/write-check (api/check-404 (t2/select-one :model/ExplorationQuery :id id)))
  (t2/update! :model/ExplorationQuery id {:user_interestingness user_interestingness})
  (query-summary id))

(api.macros/defendpoint :delete "/query/:id/interesting" :- ::ExplorationQuerySummary
  "Clear the owner's interestingness rating on an exploration query."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check (api/check-404 (t2/select-one :model/ExplorationQuery :id id)))
  (t2/update! :model/ExplorationQuery id {:user_interestingness nil})
  (query-summary id))

;;; ----------------------------------------- routes -----------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/exploration/` routes."
  (api.macros/ns-handler *ns* +auth))
