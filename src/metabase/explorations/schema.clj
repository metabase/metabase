(ns metabase.explorations.schema
  "Malli schemas for the explorations module."
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::exploration
  "A Exploration as selected from the app DB: every column of `:exploration`."
  [:map {:closed true}
   [:id                  ms/PositiveInt]
   [:name                :string]
   [:description         [:maybe :string]]
   [:creator_id          ::lib.schema.id/user]
   [:collection_id       [:maybe ::lib.schema.id/collection]]
   [:archived            :boolean]
   [:archived_directly   :boolean]
   [:collection_position [:maybe :int]]
   [:entity_id           [:maybe :string]]
   [:created_at          ms/TemporalInstant]
   [:updated_at          ms/TemporalInstant]])

(mr/def ::exploration.update
  "What an update (or insert) of a Exploration accepts: every column of `:exploration` except `id`, all optional."
  [:map {:closed true}
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

(mr/def ::exploration-block.metric
  "One entry of the `:metrics` column of a ExplorationBlock, decoded."
  :map)

(mr/def ::exploration-block.dimension
  "One entry of the `:dimensions` column of a ExplorationBlock, decoded."
  :map)

(mr/def ::exploration-block
  "A ExplorationBlock as selected from the app DB: every column of `:exploration_block`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id ms/PositiveInt]
   [:metrics               [:maybe [:sequential :map]]]
   [:dimensions            [:maybe [:sequential :map]]]
   [:position              :int]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]])

(mr/def ::exploration-block.update
  "What an update (or insert) of a ExplorationBlock accepts: every column of `:exploration_block` except `id`, all optional."
  [:map {:closed true}
   [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
   [:metrics               {:optional true} [:maybe [:sequential :map]]]
   [:dimensions            {:optional true} [:maybe [:sequential :map]]]
   [:position              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-page
  "A ExplorationPage as selected from the app DB: every column of `:exploration_page`."
  [:map {:closed true}
   [:id                   ms/PositiveInt]
   [:entity_id            [:maybe :string]]
   [:exploration_block_id ms/PositiveInt]
   [:card_id              ::lib.schema.id/card]
   [:dimension_id         :string]
   [:query_type           [:or :keyword :string]]
   [:position             :int]
   [:starred              :boolean]
   [:hidden               :boolean]
   [:created_at           ms/TemporalInstant]
   [:updated_at           ms/TemporalInstant]])

(mr/def ::exploration-page.update
  "What an update (or insert) of a ExplorationPage accepts: every column of `:exploration_page` except `id`, all optional."
  [:map {:closed true}
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

(mr/def ::exploration-query.visualization-settings
  "The `:visualization_settings` column of a ExplorationQuery, decoded."
  :map)

(mr/def ::exploration-query.dataset-query
  "The `:dataset_query` column of a ExplorationQuery, decoded."
  :map)

(mr/def ::exploration-query.params
  "The `:params` column of a ExplorationQuery, decoded."
  :map)

(mr/def ::exploration-query.data-access-token
  "The `:data_access_token` column of a ExplorationQuery, decoded."
  :map)

(mr/def ::exploration-query
  "A ExplorationQuery as selected from the app DB: every column of `:exploration_query`."
  [:map {:closed true}
   [:id                     ms/PositiveInt]
   [:exploration_thread_id  ms/PositiveInt]
   [:page_id                ms/PositiveInt]
   [:name                   [:maybe :string]]
   [:card_id                ::lib.schema.id/card]
   [:database_id            ::lib.schema.id/database]
   [:segment_id             [:maybe ::lib.schema.id/segment]]
   [:dimension_id           :string]
   [:query_type             [:or :keyword :string]]
   [:display                [:maybe [:or :keyword :string]]]
   [:visualization_settings [:maybe ::exploration-query.visualization-settings]]
   [:dataset_query          [:maybe ::exploration-query.dataset-query]]
   [:params                 [:maybe ::exploration-query.params]]
   [:position               :int]
   [:status                 [:or :keyword :string]]
   [:error_message          [:maybe :string]]
   [:started_at             [:maybe ms/TemporalInstant]]
   [:finished_at            [:maybe ms/TemporalInstant]]
   [:entity_id              [:maybe :string]]
   [:created_at             ms/TemporalInstant]
   [:updated_at             ms/TemporalInstant]
   [:data_access_token      [:maybe ::exploration-query.data-access-token]]])

(mr/def ::exploration-query.update
  "What an update (or insert) of a ExplorationQuery accepts: every column of `:exploration_query` except `id`, all optional."
  [:map {:closed true}
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
   [:data_access_token      {:optional true} [:maybe ::exploration-query.data-access-token]]])

(mr/def ::exploration-query-result.chart-stats
  "The `:chart_stats` column of a ExplorationQueryResult, decoded."
  :map)

(mr/def ::exploration-query-result
  "A ExplorationQueryResult as selected from the app DB: every column of `:exploration_query_result`."
  [:map {:closed true}
   [:id                               ms/PositiveInt]
   [:exploration_query_id             ms/PositiveInt]
   [:stored_result_id                 ms/PositiveInt]
   [:created_at                       ms/TemporalInstant]
   [:interestingness_score            [:maybe number?]]
   [:contextual_interestingness_score [:maybe number?]]
   [:chart_stats                      [:maybe ::exploration-query-result.chart-stats]]
   [:metric_description               [:maybe :string]]
   [:chart_description                [:maybe :string]]])

(mr/def ::exploration-query-result.update
  "What an update (or insert) of a ExplorationQueryResult accepts: every column of `:exploration_query_result` except `id`, all optional."
  [:map {:closed true}
   [:exploration_query_id             {:optional true} [:maybe ms/PositiveInt]]
   [:stored_result_id                 {:optional true} [:maybe ms/PositiveInt]]
   [:created_at                       {:optional true} [:maybe ms/TemporalInstant]]
   [:interestingness_score            {:optional true} [:maybe number?]]
   [:contextual_interestingness_score {:optional true} [:maybe number?]]
   [:chart_stats                      {:optional true} [:maybe ::exploration-query-result.chart-stats]]
   [:metric_description               {:optional true} [:maybe :string]]
   [:chart_description                {:optional true} [:maybe :string]]])

(mr/def ::exploration-thread.query-plan-transcript-entry
  "One entry of the `:query_plan_transcript` column of a ExplorationThread, decoded."
  :map)

(mr/def ::exploration-thread.data-access-token
  "The `:data_access_token` column of a ExplorationThread, decoded."
  :map)

(mr/def ::exploration-thread
  "A ExplorationThread as selected from the app DB: every column of `:exploration_thread`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_id        ms/PositiveInt]
   [:name                  [:maybe :string]]
   [:prompt                [:maybe :string]]
   [:position              :int]
   [:source_page_id        [:maybe ms/PositiveInt]]
   [:started_at            [:maybe ms/TemporalInstant]]
   [:entity_id             [:maybe :string]]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:completed_at          [:maybe ms/TemporalInstant]]
   [:analysis_started_at   [:maybe ms/TemporalInstant]]
   [:query_plan_started_at [:maybe ms/TemporalInstant]]
   [:query_plan_transcript [:maybe [:sequential :map]]]
   [:canceled_at           [:maybe ms/TemporalInstant]]
   [:data_access_token     [:maybe ::exploration-thread.data-access-token]]])

(mr/def ::exploration-thread.update
  "What an update (or insert) of a ExplorationThread accepts: every column of `:exploration_thread` except `id`, all optional."
  [:map {:closed true}
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
   [:query_plan_transcript {:optional true} [:maybe [:sequential :map]]]
   [:canceled_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:data_access_token     {:optional true} [:maybe ::exploration-thread.data-access-token]]])

(mr/def ::exploration-thread-timeline
  "A ExplorationThreadTimeline as selected from the app DB: every column of `:exploration_thread_timeline`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id ms/PositiveInt]
   [:timeline_id           ms/PositiveInt]
   [:position              :int]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]])

(mr/def ::exploration-thread-timeline.update
  "What an update (or insert) of a ExplorationThreadTimeline accepts: every column of `:exploration_thread_timeline` except `id`, all optional."
  [:map {:closed true}
   [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
   [:timeline_id           {:optional true} [:maybe ms/PositiveInt]]
   [:position              {:optional true} [:maybe :int]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]])
