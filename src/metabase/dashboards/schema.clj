(ns metabase.dashboards.schema
  (:require
   [metabase.actions.schema]
   [metabase.collections.schema]
   [metabase.content-verification.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::parameters
  [:sequential
   ;; the same as the normal parameters schema, but type is optional here.
   [:merge
    ::parameters.schema/parameter
    [:map
     [:type {:optional true} [:ref ::lib.schema.parameter/type]]]]])

(mr/def ::dashboard.parameter
  "One entry of the `:parameters` column of a Dashboard, decoded."
  ::parameters.schema/parameter)

(mr/def ::dashboard
  "A Dashboard as selected from the app DB: every column of `:report_dashboard` (see `::dashboard.update`) plus
  `:id` and the keys some callers hydrate onto it."
  [:merge
   ::dashboard.update
   [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:30"}
    [:id                         ::lib.schema.id/dashboard]
    [:moderation_status          {:optional true} [:maybe [:or :keyword :string]]]
    [:resolved-params            {:optional true} [:maybe [:map-of ms/NonBlankString ::parameters.schema/resolved-parameter]]]
    [:dashcards                  {:optional true} [:maybe [:sequential [:ref ::dashboard-card]]]]
    [:tabs                       {:optional true} [:maybe [:sequential ::dashboard-tab]]]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]
    [:can_write                  {:optional true} :boolean]
    [:can_restore                {:optional true} :boolean]
    [:can_delete                 {:optional true} :boolean]
    [:can_set_cache_policy       {:optional true} :boolean]
    [:param_fields               {:optional true} [:maybe [:map-of :string [:sequential ::queries.schema/param-field]]]]
    [:is_remote_synced           {:optional true} :boolean]
    [:moderation_reviews         {:optional true} [:sequential :metabase.content-verification.schema/moderation-review]]
    [:collection                 {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
    [:last_used_param_values     {:optional true} [:maybe [:map-of :string [:maybe :metabase.users.schema/user-parameter-value.value]]]]
    [:creator                    {:optional true} [:maybe :metabase.users.schema/user]]
    [:last-edit-info             {:optional true} [:maybe
                                                   [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:48"}
                                                    [:timestamp  [:maybe ms/TemporalInstant]]
                                                    [:id         [:maybe ms/PositiveInt]]
                                                    [:first_name [:maybe :string]]
                                                    [:last_name  [:maybe :string]]
                                                    [:email      [:maybe :string]]]]]]])

(mr/def ::dashboard.update
  "What an update (or insert) of a Dashboard accepts: every column of `:report_dashboard` except `id`, all optional."
  [:map {:closed true}
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:name                    {:optional true} [:maybe :string]]
   [:description             {:optional true} [:maybe :string]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameters              {:optional true} [:maybe [:sequential ::dashboard.parameter]]]
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
   [:embedding_type          {:optional true} [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix      {:optional true} [:maybe :string]]])

(mr/def ::dashboard-card.parameter-mapping
  "One entry of the `:parameter_mappings` column of a DashboardCard, decoded."
  ::parameters.schema/parameter-mapping)

(mr/def ::dashboard-card.visualization-settings
  "The `:visualization_settings` column of a DashboardCard, decoded."
  ms/VisualizationSettings)

(mr/def ::dashboard-card
  "A DashboardCard as selected from the app DB: every column of `:report_dashboardcard`, plus the keys some callers
  hydrate onto it."
  [:merge
   ::dashboard-card.update
   [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:99"}
    [:id                     ::lib.schema.id/dashcard]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]
    [:card                   {:optional true} [:maybe [:ref ::queries.schema/card]]]
    [:series                 {:optional true} [:maybe [:sequential [:ref ::queries.schema/card]]]]
    [:action                 {:optional true} [:maybe [:merge
                                                       :metabase.actions.schema/action
                                                       [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:106"}
                                                        [:database_enabled_actions {:optional true} :boolean]]]]]]])

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
   [:parameter_mappings     {:optional true} [:maybe [:sequential ::dashboard-card.parameter-mapping]]]
   [:visualization_settings {:optional true} [:maybe ::dashboard-card.visualization-settings]]
   [:entity_id              {:optional true} [:maybe :string]]
   [:action_id              {:optional true} [:maybe ::lib.schema.id/action]]
   [:dashboard_tab_id       {:optional true} [:maybe ms/PositiveInt]]
   [:inline_parameters      {:optional true} [:maybe [:sequential :string]]]])

(mr/def ::dashboard-card-series
  "A DashboardCardSeries as selected from the app DB: every column of `:dashboardcard_series`."
  [:merge
   ::dashboard-card-series.update
   [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:131"}
    [:id               ms/PositiveInt]]])

(mr/def ::dashboard-card-series.update
  "What an update (or insert) of a DashboardCardSeries accepts: every column of `:dashboardcard_series` except `id`, all optional."
  [:map {:closed true}
   [:dashboardcard_id {:optional true} [:maybe ::lib.schema.id/dashcard]]
   [:card_id          {:optional true} [:maybe ::lib.schema.id/card]]
   [:position         {:optional true} [:maybe :int]]])

(mr/def ::dashboard-tab
  "A DashboardTab as selected from the app DB: every column of `:dashboard_tab`."
  [:merge
   ::dashboard-tab.update
   [:map {:closed true, :probe/id "src/metabase/dashboards/schema.clj:145"}
    [:id           ms/PositiveInt]]])

(mr/def ::dashboard-tab.update
  "What an update (or insert) of a DashboardTab accepts: every column of `:dashboard_tab` except `id`, all optional."
  [:map {:closed true}
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:name         {:optional true} [:maybe :string]]
   [:position     {:optional true} [:maybe :int]]
   [:entity_id    {:optional true} [:maybe :string]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])
