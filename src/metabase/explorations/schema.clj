(ns metabase.explorations.schema
  "Malli schemas for the explorations module."
  (:require
   [malli.util :as mut]
   [metabase.interestingness.chart.types :as chart.types]
   [metabase.lib.schema :as lib.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.metrics.core :as metrics]
   [metabase.query-permissions.core :as query-perms]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::exploration.update
  "An Exploration by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:name                {:optional true} [:maybe :string]]
   [:description         {:optional true} [:maybe :string]]
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:archived_directly   {:optional true} [:maybe :boolean]]
   [:collection_position {:optional true} [:maybe :int]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration.create
  "What a caller gives to create an Exploration: the columns of an update without the `:id`."
  (mut/dissoc ::exploration.update :id))

(mr/def ::exploration
  "An Exploration as selected from the app DB: every column of `:exploration`."
  ::exploration.update)

(mr/def ::exploration.revision
  "An Exploration as a Revision stores it: its tracked columns."
  [:select-keys ::exploration [:name :description :collection_id :archived]])

(mr/def ::exploration-block.metric.explore-filter
  "One entry of a block metric selection's `:explore_filters` vector, decoded."
  [:multi {:dispatch :operator}
   ["=" [:map {:closed true}
         [:operator       [:= "="]]
         [:field_ref      [:ref :metabase.lib.schema.parameter/dimension.target]]
         [:value          [:maybe [:or :string number? :boolean]]]
         [:display_value  ms/NonBlankString]
         [:dimension_name {:optional true} [:maybe :string]]]]
   ["between" [:map {:closed true}
               [:operator       [:= "between"]]
               [:field_ref      [:ref :metabase.lib.schema.parameter/dimension.target]]
               [:values         [:tuple [:maybe [:or :string number? :boolean]]
                                 [:maybe [:or :string number? :boolean]]]]
               [:display_value  ms/NonBlankString]
               [:dimension_name {:optional true} [:maybe :string]]]]])

(mr/def ::exploration-block.metric
  "One entry of the `:metrics` column of an ExplorationBlock, decoded."
  [:map {:closed true}
   [:card_id ms/PositiveInt]
   [:dimension_mappings {:optional true} [:maybe [:sequential ::metrics/dimension-mapping]]]
   [:explore_filters    {:optional true} [:maybe [:sequential ::exploration-block.metric.explore-filter]]]])

(mr/def ::exploration-block.dimension
  "One entry of the `:dimensions` column of an ExplorationBlock, decoded."
  [:map {:closed true}
   [:dimension-id   ms/UUIDString]
   [:display-name   {:optional true} [:maybe :string]]
   [:effective-type {:optional true} [:maybe :string]]
   [:semantic-type  {:optional true} [:maybe :string]]])

(mr/def ::exploration-block.update
  "An ExplorationBlock by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
   [:metrics               {:optional true} [:maybe [:sequential ::exploration-block.metric]]]
   [:dimensions            {:optional true} [:maybe [:sequential ::exploration-block.dimension]]]
   [:position              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-block.create
  "What a caller gives to create an ExplorationBlock: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-block.update :id))

(mr/def ::exploration-block
  "An ExplorationBlock as selected from the app DB: every column of `:exploration_block`."
  ::exploration-block.update)

(mr/def ::exploration-page.update
  "An ExplorationPage by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:entity_id            {:optional true} [:maybe :string]]
   [:exploration_block_id {:optional true} [:maybe ms/PositiveInt]]
   [:card_id              {:optional true} [:maybe ::lib.schema.id/card]]
   [:dimension_id         {:optional true} [:maybe :string]]
   [:query_type           {:optional true} [:maybe [:or :keyword :string]]]
   [:position             {:optional true} [:maybe :int]]
   [:starred              {:optional true} [:maybe :boolean]]
   [:hidden               {:optional true} [:maybe :boolean]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-page.create
  "What a caller gives to create an ExplorationPage: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-page.update :id))

(mr/def ::exploration-page
  "An ExplorationPage as selected from the app DB: every column of `:exploration_page`."
  ::exploration-page.update)

(mr/def ::exploration-query.visualization-settings
  "The `:visualization_settings` column of an ExplorationQuery, decoded."
  ::lib.schema.visualization/visualization-settings)

(mr/def ::exploration-query.dataset-query
  "The `:dataset_query` column of an ExplorationQuery, decoded."
  ::lib.schema/query)

(mr/def ::exploration-query.params
  "The `:params` column of an ExplorationQuery, decoded."
  [:map {:closed true}
   [:segment_id  {:optional true} [:maybe ms/PositiveInt]]
   [:k           {:optional true} [:maybe :int]]
   [:value_index {:optional true} [:maybe nat-int?]]])

(mr/def ::exploration-query.data-access-token
  "The `:data_access_token` column of an ExplorationQuery, decoded."
  ::exploration-thread.data-access-token)

(mr/def ::exploration-query.resolved-source-ids
  "The `:resolved_source_ids` column of an ExplorationQuery, decoded."
  ::exploration-thread.resolved-source-ids)

(mr/def ::exploration-query.update.stamped-together
  "An ExplorationQuery update with its `dataset_query`, `data_access_token` and `resolved_source_ids` all or none."
  [:fn {:error/message "dataset_query, data_access_token and resolved_source_ids go together or not at all"}
   (fn [changes]
     (let [ks [:dataset_query :data_access_token :resolved_source_ids]]
       (or (not-any? #(contains? changes %) ks)
           (every? #(contains? changes %) ks))))])

(mr/def ::exploration-query-result.chart-stats
  "The `:chart_stats` column of an ExplorationQueryResult, decoded."
  ::chart.types/chart-stats)

(mr/def ::exploration-query-result.update
  "An ExplorationQueryResult by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_query_id             {:optional true} [:maybe ms/PositiveInt]]
   [:stored_result_id                 {:optional true} [:maybe ms/PositiveInt]]
   [:created_at                       {:optional true} [:maybe ms/TemporalInstant]]
   [:interestingness_score            {:optional true} [:maybe number?]]
   [:contextual_interestingness_score {:optional true} [:maybe number?]]
   [:chart_stats                      {:optional true} [:maybe ::exploration-query-result.chart-stats]]
   [:metric_description               {:optional true} [:maybe :string]]
   [:chart_description                {:optional true} [:maybe :string]]])

(mr/def ::exploration-query-result.create
  "What a caller gives to create an ExplorationQueryResult: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-query-result.update :id))

(mr/def ::exploration-query-result
  "An ExplorationQueryResult as selected from the app DB: every column of `:exploration_query_result`."
  ::exploration-query-result.update)

(mr/def ::exploration-thread.query-plan-transcript.plan-item
  "One entry of the `:plan` a query planner emits."
  [:map {:closed true}
   [:block_id     ms/PositiveInt]
   [:metric_id    ms/PositiveInt]
   [:dimension_id ms/UUIDString]
   [:variant      :string]
   [:params       {:optional true} [:map {:closed true}
                                    [:segment_id {:optional true} ms/PositiveInt]
                                    [:k          {:optional true} :int]]]
   [:rationale    {:optional true} [:maybe :string]]])

(mr/def ::exploration-thread.query-plan-transcript.planner-notes
  "The planner-implementation-specific `:transcript` a query planner emits (see
  `metabase.explorations.query-plan.planner/plan!`); shape is per-implementation, only `:mechanical` exists today."
  [:or
   [:map {:closed true}
    [:reason   :string]
    [:n-blocks :int]]
   [:map {:closed true}
    [:strategy :string]
    [:n-items  :int]
    [:n-blocks :int]]])

(mr/def ::exploration-thread.query-plan-transcript.body
  "The `:transcript` entry of a query-plan transcript, decoded."
  [:map {:closed true}
   [:outcome      {:optional true} [:maybe [:enum :ok :failed :skip-not-applicable]]]
   [:rationale    {:optional true} [:maybe :string]]
   [:plan         {:optional true} [:maybe [:sequential ::exploration-thread.query-plan-transcript.plan-item]]]
   [:final-errors {:optional true} [:maybe [:sequential :string]]]
   [:planner-notes {:optional true} [:maybe ::exploration-thread.query-plan-transcript.planner-notes]]])

(mr/def ::exploration-thread.query-plan-transcript
  "The `:query_plan_transcript` column of an ExplorationThread, decoded."
  [:map {:closed true}
   [:generated-at {:optional true} [:maybe :string]]
   [:thread-id    {:optional true} [:maybe ms/PositiveInt]]
   [:planner      {:optional true} [:maybe :keyword]]
   [:outcome      {:optional true} [:maybe [:enum :ok :skip-empty :failed :error]]]
   [:rows-count   {:optional true} [:maybe :int]]
   [:note         {:optional true} [:maybe :keyword]]
   [:error        {:optional true} [:maybe :string]]
   [:transcript   {:optional true} [:maybe ::exploration-thread.query-plan-transcript.body]]])

(def ^:private DataAccessToken
  "A digested effective-data-access token: sandbox/impersonation/routing fingerprints, keyed by table or database
  id."
  [:map {:closed true}
   [:sandbox       {:optional true} [:map-of ::lib.schema.id/table :string]]
   [:impersonation {:optional true} [:map-of ::lib.schema.id/database :string]]
   [:routing       {:optional true} [:map-of ::lib.schema.id/database :string]]])

(mr/def ::exploration-thread.data-access-token
  "The `:data_access_token` column of an ExplorationThread, decoded."
  DataAccessToken)

(mr/def ::exploration-thread.resolved-source-ids
  "The `:resolved_source_ids` column of an ExplorationThread, decoded."
  query-perms/ResolvedSourceIds)

(mr/def ::exploration-thread.update
  "An ExplorationThread by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_id        {:optional true} [:maybe ms/PositiveInt]]
   [:name                  {:optional true} [:maybe :string]]
   [:prompt                {:optional true} [:maybe :string]]
   [:position              {:optional true} [:maybe :int]]
   [:source_page_id        {:optional true} [:maybe ms/PositiveInt]]
   [:started_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id             {:optional true} [:maybe :string]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:completed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:analysis_started_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:query_plan_started_at {:optional true} [:maybe ms/TemporalInstant]]
   [:query_plan_transcript {:optional true} [:maybe ::exploration-thread.query-plan-transcript]]
   [:canceled_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:data_access_token     {:optional true} [:maybe ::exploration-thread.data-access-token]]
   [:resolved_source_ids   {:optional true} [:maybe ::exploration-thread.resolved-source-ids]]])

(mr/def ::exploration-thread.create
  "What a caller gives to create an ExplorationThread: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-thread.update :id))

(mr/def ::exploration-thread
  "An ExplorationThread as selected from the app DB: every column of `:exploration_thread`."
  ::exploration-thread.update)

(mr/def ::exploration-query.update
  "An ExplorationQuery by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id  {:optional true} [:maybe ms/PositiveInt]]
   [:page_id                {:optional true} [:maybe ms/PositiveInt]]
   [:name                   {:optional true} [:maybe :string]]
   [:card_id                {:optional true} [:maybe ::lib.schema.id/card]]
   [:database_id            {:optional true} [:maybe ::lib.schema.id/database]]
   [:segment_id             {:optional true} [:maybe ::lib.schema.id/segment]]
   [:dimension_id           {:optional true} [:maybe :string]]
   [:query_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:display                {:optional true} [:maybe [:or :keyword :string]]]
   [:visualization_settings {:optional true} [:maybe ::exploration-query.visualization-settings]]
   [:dataset_query          {:optional true} [:maybe ::exploration-query.dataset-query]]
   [:params                 {:optional true} [:maybe ::exploration-query.params]]
   [:position               {:optional true} [:maybe :int]]
   [:status                 {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message          {:optional true} [:maybe :string]]
   [:started_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:finished_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id              {:optional true} [:maybe :string]]
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:data_access_token      {:optional true} [:maybe ::exploration-query.data-access-token]]
   [:resolved_source_ids    {:optional true} [:maybe ::exploration-query.resolved-source-ids]]])

(mr/def ::exploration-query.create
  "What a caller gives to create an ExplorationQuery: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-query.update :id))

(mr/def ::exploration-query
  "An ExplorationQuery as selected from the app DB: every column of `:exploration_query`."
  ::exploration-query.update)

(mr/def ::exploration-thread-timeline.update
  "An ExplorationThreadTimeline by its `id` with the columns to change, each optional."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
   [:timeline_id           {:optional true} [:maybe ms/PositiveInt]]
   [:position              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-thread-timeline.create
  "What a caller gives to create an ExplorationThreadTimeline: the columns of an update without the `:id`."
  (mut/dissoc ::exploration-thread-timeline.update :id))

(mr/def ::exploration-thread-timeline
  "An ExplorationThreadTimeline as selected from the app DB: every column of `:exploration_thread_timeline`."
  ::exploration-thread-timeline.update)
