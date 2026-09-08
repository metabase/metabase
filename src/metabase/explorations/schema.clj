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
   [:name                [:or :string :map sequential?]]
   [:description         [:maybe [:or :string :map sequential?]]]
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
   [:name                {:optional true} [:maybe [:or :string :map sequential?]]]
   [:description         {:optional true} [:maybe [:or :string :map sequential?]]]
   [:creator_id          {:optional true} [:maybe ::lib.schema.id/user]]
   [:collection_id       {:optional true} [:maybe ::lib.schema.id/collection]]
   [:archived            {:optional true} [:maybe :boolean]]
   [:archived_directly   {:optional true} [:maybe :boolean]]
   [:collection_position {:optional true} [:maybe :int]]
   [:entity_id           {:optional true} [:maybe :string]]
   [:created_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at          {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-block
  "A ExplorationBlock as selected from the app DB: every column of `:exploration_block`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_thread_id ms/PositiveInt]
   [:metrics               [:maybe [:or :string :map sequential?]]]
   [:dimensions            [:maybe [:or :string :map sequential?]]]
   [:position              :int]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]])

(mr/def ::exploration-block.update
  "What an update (or insert) of a ExplorationBlock accepts: every column of `:exploration_block` except `id`, all optional."
  [:map {:closed true}
   [:exploration_thread_id {:optional true} [:maybe ms/PositiveInt]]
   [:metrics               {:optional true} [:maybe [:or :string :map sequential?]]]
   [:dimensions            {:optional true} [:maybe [:or :string :map sequential?]]]
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
   [:dimension_id         [:or :string :map sequential?]]
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
   [:dimension_id         {:optional true} [:maybe [:or :string :map sequential?]]]
   [:query_type           {:optional true} [:maybe [:or :keyword :string]]]
   [:position             {:optional true} [:maybe :int]]
   [:starred              {:optional true} [:maybe :boolean]]
   [:hidden               {:optional true} [:maybe :boolean]]
   [:created_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at           {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::exploration-query
  "A ExplorationQuery as selected from the app DB: every column of `:exploration_query`."
  [:map {:closed true}
   [:id                     ms/PositiveInt]
   [:exploration_thread_id  ms/PositiveInt]
   [:page_id                ms/PositiveInt]
   [:name                   [:maybe [:or :string :map sequential?]]]
   [:card_id                ::lib.schema.id/card]
   [:database_id            ::lib.schema.id/database]
   [:segment_id             [:maybe ::lib.schema.id/segment]]
   [:dimension_id           [:or :string :map sequential?]]
   [:query_type             [:or :keyword :string]]
   [:display                [:maybe [:or :keyword :string]]]
   [:visualization_settings [:maybe [:or :string :map sequential?]]]
   [:dataset_query          [:maybe [:or :string :map sequential?]]]
   [:params                 [:maybe [:or :string :map sequential?]]]
   [:position               :int]
   [:status                 [:or :keyword :string]]
   [:error_message          [:maybe [:or :string :map sequential?]]]
   [:started_at             [:maybe ms/TemporalInstant]]
   [:finished_at            [:maybe ms/TemporalInstant]]
   [:entity_id              [:maybe :string]]
   [:created_at             ms/TemporalInstant]
   [:updated_at             ms/TemporalInstant]
   [:data_access_token      [:maybe [:or :string :map sequential?]]]])

(mr/def ::exploration-query.update
  "What an update (or insert) of a ExplorationQuery accepts: every column of `:exploration_query` except `id`, all optional."
  [:map {:closed true}
   [:exploration_thread_id  {:optional true} [:maybe ms/PositiveInt]]
   [:page_id                {:optional true} [:maybe ms/PositiveInt]]
   [:name                   {:optional true} [:maybe [:or :string :map sequential?]]]
   [:card_id                {:optional true} [:maybe ::lib.schema.id/card]]
   [:database_id            {:optional true} [:maybe ::lib.schema.id/database]]
   [:segment_id             {:optional true} [:maybe ::lib.schema.id/segment]]
   [:dimension_id           {:optional true} [:maybe [:or :string :map sequential?]]]
   [:query_type             {:optional true} [:maybe [:or :keyword :string]]]
   [:display                {:optional true} [:maybe [:or :keyword :string]]]
   [:visualization_settings {:optional true} [:maybe [:or :string :map sequential?]]]
   [:dataset_query          {:optional true} [:maybe [:or :string :map sequential?]]]
   [:params                 {:optional true} [:maybe [:or :string :map sequential?]]]
   [:position               {:optional true} [:maybe :int]]
   [:status                 {:optional true} [:maybe [:or :keyword :string]]]
   [:error_message          {:optional true} [:maybe [:or :string :map sequential?]]]
   [:started_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:finished_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id              {:optional true} [:maybe :string]]
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:data_access_token      {:optional true} [:maybe [:or :string :map sequential?]]]])

(mr/def ::exploration-query-result
  "A ExplorationQueryResult as selected from the app DB: every column of `:exploration_query_result`."
  [:map {:closed true}
   [:id                               ms/PositiveInt]
   [:exploration_query_id             ms/PositiveInt]
   [:stored_result_id                 ms/PositiveInt]
   [:created_at                       ms/TemporalInstant]
   [:interestingness_score            [:maybe number?]]
   [:contextual_interestingness_score [:maybe number?]]
   [:chart_stats                      [:maybe [:or :string :map sequential?]]]
   [:metric_description               [:maybe [:or :string :map sequential?]]]
   [:chart_description                [:maybe [:or :string :map sequential?]]]])

(mr/def ::exploration-query-result.update
  "What an update (or insert) of a ExplorationQueryResult accepts: every column of `:exploration_query_result` except `id`, all optional."
  [:map {:closed true}
   [:exploration_query_id             {:optional true} [:maybe ms/PositiveInt]]
   [:stored_result_id                 {:optional true} [:maybe ms/PositiveInt]]
   [:created_at                       {:optional true} [:maybe ms/TemporalInstant]]
   [:interestingness_score            {:optional true} [:maybe number?]]
   [:contextual_interestingness_score {:optional true} [:maybe number?]]
   [:chart_stats                      {:optional true} [:maybe [:or :string :map sequential?]]]
   [:metric_description               {:optional true} [:maybe [:or :string :map sequential?]]]
   [:chart_description                {:optional true} [:maybe [:or :string :map sequential?]]]])

(mr/def ::exploration-thread
  "A ExplorationThread as selected from the app DB: every column of `:exploration_thread`."
  [:map {:closed true}
   [:id                    ms/PositiveInt]
   [:exploration_id        ms/PositiveInt]
   [:name                  [:maybe [:or :string :map sequential?]]]
   [:prompt                [:maybe [:or :string :map sequential?]]]
   [:position              :int]
   [:source_page_id        [:maybe ms/PositiveInt]]
   [:started_at            [:maybe ms/TemporalInstant]]
   [:entity_id             [:maybe :string]]
   [:created_at            ms/TemporalInstant]
   [:updated_at            ms/TemporalInstant]
   [:completed_at          [:maybe ms/TemporalInstant]]
   [:analysis_started_at   [:maybe ms/TemporalInstant]]
   [:query_plan_started_at [:maybe ms/TemporalInstant]]
   [:query_plan_transcript [:maybe [:or :string :map sequential?]]]
   [:canceled_at           [:maybe ms/TemporalInstant]]
   [:data_access_token     [:maybe [:or :string :map sequential?]]]])

(mr/def ::exploration-thread.update
  "What an update (or insert) of a ExplorationThread accepts: every column of `:exploration_thread` except `id`, all optional."
  [:map {:closed true}
   [:exploration_id        {:optional true} [:maybe ms/PositiveInt]]
   [:name                  {:optional true} [:maybe [:or :string :map sequential?]]]
   [:prompt                {:optional true} [:maybe [:or :string :map sequential?]]]
   [:position              {:optional true} [:maybe :int]]
   [:source_page_id        {:optional true} [:maybe ms/PositiveInt]]
   [:started_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:entity_id             {:optional true} [:maybe :string]]
   [:created_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at            {:optional true} [:maybe ms/TemporalInstant]]
   [:completed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:analysis_started_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:query_plan_started_at {:optional true} [:maybe ms/TemporalInstant]]
   [:query_plan_transcript {:optional true} [:maybe [:or :string :map sequential?]]]
   [:canceled_at           {:optional true} [:maybe ms/TemporalInstant]]
   [:data_access_token     {:optional true} [:maybe [:or :string :map sequential?]]]])

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
