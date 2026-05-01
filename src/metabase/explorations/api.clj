(ns metabase.explorations.api
  "`/api/exploration` routes."
  (:require
   [java-time.api :as t]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.explorations.core :as explorations]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.query-processor.middleware.cache.impl :as cache.impl]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
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

(defn- hydrate-exploration [exploration]
  (-> exploration
      (t2/hydrate :creator
                  [:threads :metrics :dimensions :timelines :queries])))

(defn- find-dimension-target
  "Look up the MBQL `target` for a dimension by ID inside a metric's snapshotted dimension_mappings."
  [dimension-id dimension-mappings]
  (some #(when (= (:dimension_id %) dimension-id)
           (:target %))
        dimension-mappings))

(defn- dim-type-isa?
  "True if the dim's snapshot effective_type or semantic_type derives from `parent`. Snapshot
  columns arrive as strings (e.g. `\"type/DateTime\"`), so coerce to keywords before `isa?`."
  [dim parent]
  (boolean
   (some (fn [t]
           (when (some? t)
             (isa? (keyword t) parent)))
         [(:effective_type dim) (:semantic_type dim)])))

(defn- default-bucket-for-dim
  "Pick a default temporal bucket or numeric binning for a dimension based on its snapshot type.
  Returns one of:
    `[:temporal unit]`  — apply via `lib/with-temporal-bucket`
    `[:binning binning]` — apply via `lib/with-binning`
    `nil`               — no bucket; use a bare breakout (current behavior).

  Resolution order matters: DateTime first (it derives from both HasDate and HasTime), then Date,
  then Time. Coordinates come before generic numbers because Coordinate also derives from Number."
  [dim]
  (cond
    (dim-type-isa? dim :type/DateTime)   [:temporal :month]
    (dim-type-isa? dim :type/Date)       [:temporal :day]
    (dim-type-isa? dim :type/Time)       [:temporal :hour]
    (dim-type-isa? dim :type/Coordinate) [:binning {:strategy :default}]
    (dim-type-isa? dim :type/Number)     [:binning {:strategy :default}]
    :else                                nil))

(defn- numeric-fingerprint-bounded?
  "True if `ref-clause` resolves to a column whose `:type/Number` fingerprint has both `:min` and
  `:max`. False for refs that don't resolve to a real Field (native result columns, expressions),
  or whose fingerprint is missing/incomplete — those would crash the QP's binning middleware
  (`metabase.query-processor.middleware.binning/extract-bounds`)."
  [query ref-clause]
  (when-let [col (lib/find-matching-column query -1 ref-clause
                                           (lib/breakoutable-columns query))]
    (let [{mn :min mx :max} (get-in col [:fingerprint :type :type/Number])]
      (and (some? mn) (some? mx)))))

(defn- apply-default-bucket
  "Apply a default temporal bucket / numeric binning to the breakout `ref-clause`, chosen from the
  dim's snapshot effective/semantic type. Numeric binning is gated on the underlying column having
  a usable `:min`/`:max` fingerprint — without it the QP throws at preprocess time. Returns the
  (possibly unchanged) ref."
  [query ref-clause dim]
  (let [[kind v] (default-bucket-for-dim dim)]
    (case kind
      :temporal (lib/with-temporal-bucket ref-clause v)
      :binning  (cond-> ref-clause
                  (numeric-fingerprint-bounded? query ref-clause) (lib/with-binning v))
      nil       ref-clause)))

(defn- build-snapshot-mbql
  "Wrap the metric Card's `:dataset_query` in a Lib query, drop any breakout the metric carries
  (its default temporal dimension, e.g. `created_at`), and add a single breakout for the chosen
  dimension's target. Cards may store their query in legacy MBQL 4 or MBQL 5; `lib/query`
  normalizes both into MBQL 5 so the QP receives a single, well-formed shape. The target is a
  JSON-decoded legacy ref (string operator + string-typed option values), so we run it through
  `lib/normalize` against the ref schema to coerce it into well-formed MBQL 5 before adding the
  breakout. A default temporal bucket / numeric binning is applied to the ref based on the dim's
  snapshot type so date/numeric breakouts produce a useful chart out of the box rather than a
  group-by-every-distinct-value."
  [mp card-dataset-query target dim]
  (let [base-query (-> (lib/query mp card-dataset-query) lib/remove-all-breakouts)
        ref-clause (lib/normalize :metabase.lib.schema.ref/ref target)]
    (lib/breakout base-query (apply-default-bucket base-query ref-clause dim))))

(defn- generate-queries!
  "Materialize `exploration_query` rows for each (metric, dimension) pair where the dimension is
  applicable to the metric — i.e., the metric's snapshotted `dimension_mappings` resolves a
  target for that dimension. Pairs with no mapping are dropped before enqueue, so the worker
  never executes a no-breakout duplicate of the metric's own query.

  For each surviving pair, also fans out one additional row per Segment whose `:table-id`
  matches the metric Card's source table. The unsegmented base row carries `segment_id = nil`;
  segmented rows snapshot the segment as a `:segment` filter clause inside `dataset_query`."
  [thread-id metrics dimensions]
  (when (and (seq metrics) (seq dimensions))
    (let [cards    (t2/select-pk->fn identity [:model/Card :id :name :database_id :dataset_query :card_schema]
                                     :id [:in (distinct (map :card_id metrics))])
          card-ctx (into {} (for [[id card] cards
                                  :let [mp (lib-be/application-database-metadata-provider (:database_id card))]]
                              [id {:mp       mp
                                   :segments (lib/available-segments (lib/query mp (:dataset_query card)))}]))
          rows     (for [metric metrics
                         dim    dimensions
                         :let  [dim-id (:dimension_id dim)
                                card   (get cards (:card_id metric))
                                target (find-dimension-target dim-id (:dimension_mappings metric))]
                         :when (and card target)
                         :let  [{:keys [mp segments]} (get card-ctx (:card_id metric))
                                base (build-snapshot-mbql mp (:dataset_query card) target dim)]
                         seg   (cons nil segments)]
                     {:exploration_thread_id thread-id
                      :card_id               (:card_id metric)
                      :segment_id            (:id seg)
                      :dimension_id          dim-id
                      :name                  (if seg
                                               (tru "{0} by {1} ({2})"
                                                    (:name card)
                                                    (or (:display_name dim) dim-id)
                                                    (:name seg))
                                               (tru "{0} by {1}"
                                                    (:name card)
                                                    (or (:display_name dim) dim-id)))
                      :dataset_query         (cond-> base
                                               seg (lib/filter seg))
                      :status                "pending"})]
      (when (seq rows)
        (t2/insert! :model/ExplorationQuery
                    (map-indexed (fn [i r] (assoc r :position i)) rows))))))

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

(mr/def ::HydratedThread
  "Schema for an Exploration thread with hydrated selections and queries."
  [:map
   [:id                    ms/PositiveInt]
   [:exploration_id        ms/PositiveInt]
   [:prompt                {:optional true} [:maybe :string]]
   [:position              ms/IntGreaterThanOrEqualToZero]
   [:started_at            {:optional true} [:maybe :any]]
   [:metrics               {:optional true} [:maybe [:sequential :map]]]
   [:dimensions            {:optional true} [:maybe [:sequential :map]]]
   [:timelines             {:optional true} [:maybe [:sequential :map]]]
   [:queries               {:optional true} [:maybe [:sequential :map]]]])

(mr/def ::ExplorationQuerySummary
  "Schema for a row from `GET /:id/queries`. Result blob and `dataset_query` are excluded;
   `interestingness_score` is left-joined from `exploration_query_result` and may be nil
   for pending or errored queries."
  [:map
   [:id                    ms/PositiveInt]
   [:exploration_thread_id ms/PositiveInt]
   [:card_id               ms/PositiveInt]
   [:segment_id            {:optional true} [:maybe ms/PositiveInt]]
   [:dimension_id          [:maybe :string]]
   [:name                  {:optional true} [:maybe :string]]
   [:position              ms/IntGreaterThanOrEqualToZero]
   [:status                :string]
   [:error_message         {:optional true} [:maybe :string]]
   [:started_at            {:optional true} [:maybe :any]]
   [:finished_at           {:optional true} [:maybe :any]]
   [:user_interestingness  {:optional true} [:maybe [:enum 0 1 2]]]
   [:entity_id             {:optional true} [:maybe :string]]
   [:interestingness_score {:optional true} [:maybe number?]]])

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
   [:id          ms/PositiveInt]
   [:name        :string]
   [:description {:optional true} [:maybe :string]]
   [:creator_id  ms/PositiveInt]
   [:creator     {:optional true} [:maybe :map]]
   [:threads     {:optional true} [:maybe [:sequential ::HydratedThread]]]
   [:created_at  {:optional true} [:maybe :any]]
   [:updated_at  {:optional true} [:maybe :any]]])

(def ^:private CreateExploration
  [:map
   [:name         ms/NonBlankString]
   [:description  {:optional true} [:maybe :string]]
   [:prompt       {:optional true} [:maybe :string]]
   [:metrics      {:optional true} [:maybe [:sequential MetricSelection]]]
   [:dimensions   {:optional true} [:maybe [:sequential DimensionSelection]]]
   [:timeline_ids {:optional true} [:maybe [:sequential ms/PositiveInt]]]])

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
  and timelines, and materialize one `exploration_query` per (metric, dimension) pair. The query
  rows are inserted with status='pending' for the worker to execute. This is the single
  \"Start exploration\" call from the UI."
  [_route-params
   _query-params
   {:keys [name description prompt metrics dimensions timeline_ids]} :- CreateExploration]
  (t2/with-transaction [_]
    (let [exploration (first (t2/insert-returning-instances! :model/Exploration
                                                             {:name        name
                                                              :description description
                                                              :creator_id  api/*current-user-id*}))
          thread      (first (t2/insert-returning-instances! :model/ExplorationThread
                                                             {:exploration_id (:id exploration)
                                                              :prompt         prompt
                                                              :position       0}))
          tid         (:id thread)
          metric-rows (when (seq metrics)
                        (t2/insert-returning-instances!
                         :model/ExplorationThreadMetric
                         (map-indexed (fn [i m]
                                        (assoc m
                                               :exploration_thread_id tid
                                               :position i))
                                      metrics)))]
      (when (seq dimensions)
        (t2/insert! :model/ExplorationThreadDimension
                    (map-indexed (fn [i d]
                                   (assoc d
                                          :exploration_thread_id tid
                                          :position i))
                                 dimensions)))
      (when (seq timeline_ids)
        (t2/insert! :model/ExplorationThreadTimeline
                    (map-indexed (fn [i tl-id]
                                   {:exploration_thread_id tid
                                    :timeline_id           tl-id
                                    :position              i})
                                 timeline_ids)))
      (generate-queries! tid metric-rows dimensions)
      (t2/update! :model/ExplorationThread tid {:started_at (t/offset-date-time)})
      (hydrate-exploration (t2/select-one :model/Exploration :id (:id exploration))))))

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

(def ^:private query-summary-columns
  "Column projection for `::ExplorationQuerySummary` rows — excludes `dataset_query` and the
  result blob, joins `interestingness_score` from `exploration_query_result`."
  [:exploration_query.id :exploration_query.exploration_thread_id
   :exploration_query.card_id :exploration_query.segment_id
   :exploration_query.dimension_id
   :exploration_query.name :exploration_query.position
   :exploration_query.status :exploration_query.error_message
   :exploration_query.started_at :exploration_query.finished_at
   :exploration_query.user_interestingness
   :exploration_query.entity_id
   [:exploration_query_result.interestingness_score :interestingness_score]])

(defn- query-summary
  "Fetch a single `::ExplorationQuerySummary` row by `exploration_query.id`."
  [query-id]
  (t2/select-one (into [:model/ExplorationQuery] query-summary-columns)
                 {:left-join [:exploration_query_result
                              [:= :exploration_query_result.exploration_query_id :exploration_query.id]]
                  :where     [:= :exploration_query.id query-id]}))

(api.macros/defendpoint :get "/:id/queries" :- [:sequential ::ExplorationQuerySummary]
  "Lightweight list of queries for an exploration. Excludes `dataset_query` and the result blob —
  intended for the frontend to poll while pending queries finish. The `interestingness_score`
  column is left-joined from `exploration_query_result` so clients can rank/highlight without a
  second roundtrip; pending or errored queries get `nil`."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/read-check (get-exploration-or-404 id))
  (t2/select (into [:model/ExplorationQuery] query-summary-columns)
             {:left-join [:exploration_thread
                          [:= :exploration_query.exploration_thread_id :exploration_thread.id]
                          :exploration_query_result
                          [:= :exploration_query_result.exploration_query_id :exploration_query.id]]
              :where     [:= :exploration_thread.exploration_id id]
              :order-by  [[:exploration_query.position :asc]
                          [:exploration_query.id :asc]]}))

(defn- get-exploration-query-or-404
  "Fetch an `ExplorationQuery` by id and read-check it. The model's `can-read?` delegates up
  through `ExplorationThread` to the parent `Exploration`."
  [query-id]
  (api/read-check (api/check-404 (t2/select-one :model/ExplorationQuery :id query-id))))

(defn- stream-stored-result
  "Replay a worker-serialized QP result (gzipped+nippy bytes from
  `:model/ExplorationQueryResult.result_data`) through the streaming pipeline so the response
  is shaped like a normal `/api/dataset` response. Reuses
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
      (let [{:keys [result_data]} (api/check-404
                                   (t2/select-one [:model/ExplorationQueryResult :result_data]
                                                  :exploration_query_id id))]
        (stream-stored-result format result_data))

      {:status 409
       :body   (select-keys q [:id :status :error_message :started_at :finished_at])})))

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
