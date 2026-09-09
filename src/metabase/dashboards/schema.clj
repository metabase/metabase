(ns metabase.dashboards.schema
  (:require
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::dashcard
  [:map
   [:id   {:optional true} ::lib.schema.id/dashcard]
   [:card {:optional true} [:ref ::queries.schema/card]]])

(mr/def ::parameters
  [:sequential
   ;; the same as the normal parameters schema, but type is optional here.
   [:merge
    ::parameters.schema/parameter
    [:map
     [:type {:optional true} [:ref ::lib.schema.parameter/type]]]]])

(mr/def ::dashboard
  [:map
   [:id         {:optional true} ::lib.schema.id/dashboard]
   [:parameters {:optional true} [:maybe ::parameters]]
   [:dashcards  {:optional true} [:maybe [:sequential ::dashcard]]]])

(mr/def ::dashboard.parameter
  "One entry of the `:parameters` column of a Dashboard, decoded."
  :map)

(mr/def ::dashboard.parameters
  "The `:parameters` column of a Dashboard, decoded."
  [:sequential ::dashboard.parameter])

(mr/def ::dashboard
  "A Dashboard as selected from the app DB: every column of `:report_dashboard`."
  [:map {:closed true}
   [:id                      ::lib.schema.id/dashboard]
   [:created_at              ms/TemporalInstant]
   [:updated_at              ms/TemporalInstant]
   [:name                    :string]
   [:description             [:maybe :string]]
   [:creator_id              ::lib.schema.id/user]
   [:parameters              ::dashboard.parameters]
   [:points_of_interest      [:maybe :string]]
   [:caveats                 [:maybe :string]]
   [:show_in_getting_started :boolean]
   [:public_uuid             [:maybe :string]]
   [:made_public_by_id       [:maybe ms/PositiveInt]]
   [:enable_embedding        :boolean]
   [:embedding_params        [:maybe ms/EmbeddingParams]]
   [:archived                :boolean]
   [:position                [:maybe :int]]
   [:collection_id           [:maybe ::lib.schema.id/collection]]
   [:collection_position     [:maybe :int]]
   [:cache_ttl               [:maybe :int]]
   [:entity_id               :string]
   [:auto_apply_filters      :boolean]
   [:width                   :string]
   [:initially_published_at  [:maybe ms/TemporalInstant]]
   [:view_count              :int]
   [:archived_directly       :boolean]
   [:last_viewed_at          ms/TemporalInstant]
   [:embedding_type          [:maybe :string]]
   [:public_uuid_prefix      [:maybe :string]]])

(mr/def ::dashboard.update
  "What an update (or insert) of a Dashboard accepts: every column of `:report_dashboard` except `id`, all optional."
  [:map {:closed true}
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:name                    {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameters              {:optional true} [:maybe ::dashboard.parameters]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:public_uuid             {:optional true} [:maybe :string]]
   [:made_public_by_id       {:optional true} [:maybe ms/PositiveInt]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:position                {:optional true} [:maybe :int]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position     {:optional true} [:maybe :int]]
   [:cache_ttl               {:optional true} [:maybe :int]]
   [:entity_id               {:optional true} [:maybe :string]]
   [:auto_apply_filters      {:optional true} [:maybe :boolean]]
   [:width                   {:optional true} [:maybe :string]]
   [:initially_published_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:view_count              {:optional true} [:maybe :int]]
   [:archived_directly       {:optional true} [:maybe :boolean]]
   [:last_viewed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:embedding_type          {:optional true} [:maybe :string]]
   [:public_uuid_prefix      {:optional true} [:maybe :string]]])

(mr/def ::dashboard-card.parameter-mapping
  "One entry of the `:parameter_mappings` column of a DashboardCard, decoded."
  :map)

(mr/def ::dashboard-card.parameter-mappings
  "The `:parameter_mappings` column of a DashboardCard, decoded."
  [:sequential ::dashboard-card.parameter-mapping])

(mr/def ::dashboard-card.visualization-settings
  "The `:visualization_settings` column of a DashboardCard, decoded."
  :map)

(mr/def ::dashboard-card.inline-parameters
  "The `:inline_parameters` column of a DashboardCard, decoded."
  [:sequential :string])

(mr/def ::dashboard-card
  "A DashboardCard as selected from the app DB: every column of `:report_dashboardcard`."
  [:map {:closed true}
   [:id                     ::lib.schema.id/dashcard]
   [:created_at             ms/TemporalInstant]
   [:updated_at             ms/TemporalInstant]
   [:size_x                 :int]
   [:size_y                 :int]
   [:row                    :int]
   [:col                    :int]
   [:card_id                [:maybe ::lib.schema.id/card]]
   [:dashboard_id           ::lib.schema.id/dashboard]
   [:parameter_mappings     ::dashboard-card.parameter-mappings]
   [:visualization_settings ::dashboard-card.visualization-settings]
   [:entity_id              :string]
   [:action_id              [:maybe ::lib.schema.id/action]]
   [:dashboard_tab_id       [:maybe ms/PositiveInt]]
   [:inline_parameters      [:maybe ::dashboard-card.inline-parameters]]])

(mr/def ::dashboard-card.update
  "What an update (or insert) of a DashboardCard accepts: every column of `:report_dashboardcard` except `id`, all optional."
  [:map {:closed true}
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:size_x                 {:optional true} [:maybe :int]]
   [:size_y                 {:optional true} [:maybe :int]]
   [:row                    {:optional true} [:maybe :int]]
   [:col                    {:optional true} [:maybe :int]]
   [:card_id                {:optional true} [:maybe ::lib.schema.id/card]]
   [:dashboard_id           {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:parameter_mappings     {:optional true} [:maybe ::dashboard-card.parameter-mappings]]
   [:visualization_settings {:optional true} [:maybe ::dashboard-card.visualization-settings]]
   [:entity_id              {:optional true} [:maybe :string]]
   [:action_id              {:optional true} [:maybe ::lib.schema.id/action]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]
   [:inline_parameters      {:optional true} [:maybe ::dashboard-card.inline-parameters]]])

(mr/def ::dashboard-card-series
  "A DashboardCardSeries as selected from the app DB: every column of `:dashboardcard_series`."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:dashboardcard_id ::lib.schema.id/dashcard]
   [:card_id          ::lib.schema.id/card]
   [:position         :int]])

(mr/def ::dashboard-card-series.update
  "What an update (or insert) of a DashboardCardSeries accepts: every column of `:dashboardcard_series` except `id`, all optional."
  [:map {:closed true}
   [:dashboardcard_id {:optional true} [:maybe ::lib.schema.id/dashcard]]
   [:card_id          {:optional true} [:maybe ::lib.schema.id/card]]
   [:position         {:optional true} [:maybe :int]]])

(mr/def ::dashboard-tab
  "A DashboardTab as selected from the app DB: every column of `:dashboard_tab`."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:dashboard_id ::lib.schema.id/dashboard]
   [:name         :string]
   [:position     :int]
   [:entity_id    :string]
   [:created_at   ms/TemporalInstant]
   [:updated_at   ms/TemporalInstant]])

(mr/def ::dashboard-tab.update
  "What an update (or insert) of a DashboardTab accepts: every column of `:dashboard_tab` except `id`, all optional."
  [:map {:closed true}
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:name         {:optional true} [:maybe :string]]
   [:position     {:optional true} [:maybe :int]]
   [:entity_id    {:optional true} [:maybe :string]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
