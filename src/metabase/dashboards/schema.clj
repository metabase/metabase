(ns metabase.dashboards.schema
  (:require
   [metabase.actions.schema]
   [metabase.collections.schema]
   [metabase.content-verification.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.schema.common :as lib.schema.common]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.parameter :as lib.schema.parameter]
   [metabase.lib.schema.visualization :as lib.schema.visualization]
   [metabase.models.schema :as models.schema]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.timeline.schema]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(mr/def ::parameters
  [:sequential
   ;; the same as the normal parameters schema, but type is optional here.
   [:merge
    ::parameters.schema/parameter
    [:map
     [:type {:optional true} [:ref ::lib.schema.parameter/type]]]]])

(mr/def ::dashboard.name
  ms/NonBlankString)

(mr/def ::write-opts
  "The options of the write functions of a Dashboard and of its parts: `:writer`, who writes when it matters (a revert,
  a SerDes import or a replacement), the user's own write by default; `:context`, the context of the events."
  [:maybe [:map {:closed true}
           [:writer  {:optional true} [:enum :import :replacement :revert]]
           [:context {:optional true} [:maybe :metabase.events.schema/context]]]])

(mr/def ::dashboard.width
  [:enum "fixed" "full"])

(mr/def ::dashboard-card.size
  ms/PositiveInt)

(mr/def ::dashboard-card.position
  ms/IntGreaterThanOrEqualToZero)

(mr/def ::dashboard-card-series.position
  ms/IntGreaterThanOrEqualToZero)

(mr/def ::dashboard-tab.name
  ms/NonBlankString)

(mr/def ::dashboard-tab.position
  ms/IntGreaterThanOrEqualToZero)

(mr/def ::dashboard.parameter
  "One entry of the `:parameters` column of a Dashboard, decoded."
  ::parameters.schema/parameter)

(mr/def ::dashboard
  "A Dashboard as selected from the app DB: every column of `:report_dashboard` (see `::dashboard.update`) plus
  `:id` and the keys some callers hydrate onto it."
  [:merge
   ::dashboard.update
   [:map {:closed true}
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
                                                   [:map {:closed true}
                                                    [:timestamp  [:maybe ms/TemporalInstant]]
                                                    [:id         [:maybe ms/PositiveInt]]
                                                    [:first_name [:maybe :string]]
                                                    [:last_name  [:maybe :string]]
                                                    [:email      [:maybe :string]]]]]]])

(mr/def ::dashboard.update
  "What an update of a Dashboard takes: its `:id` and every other column of `:report_dashboard`, all optional."
  [:map {:closed true}
   [:id                      ::lib.schema.id/dashboard]
   [:created_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at              {:optional true} [:maybe ms/TemporalInstant]]
   [:name                    {:optional true} ::dashboard.name]
   [:description             {:optional true} [:maybe :string]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameters              {:optional true} [:maybe [:sequential ::dashboard.parameter]]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:public_uuid             {:optional true} [:maybe :string]]
   [:made_public_by_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:position                {:optional true} [:maybe :int]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position     {:optional true} [:maybe :int]]
   [:cache_ttl               {:optional true} [:maybe :int]]
   [:entity_id               {:optional true} [:maybe :string]]
   [:auto_apply_filters      {:optional true} :boolean]
   [:width                   {:optional true} ::dashboard.width]
   [:initially_published_at  {:optional true} [:maybe ms/TemporalInstant]]
   [:view_count              {:optional true} [:maybe :int]]
   [:archived_directly       {:optional true} [:maybe :boolean]]
   [:last_viewed_at          {:optional true} [:maybe ms/TemporalInstant]]
   [:embedding_type          {:optional true} [:maybe [:string {:decode/normalize lib.schema.common/normalize-string-key}]]]
   [:public_uuid_prefix      {:optional true} [:maybe :string]]])

(mr/def ::dashboard.create
  "What creating a Dashboard takes: its name, and the columns a caller gives; the columns that follow from the others, as
  the public uuid prefix, are not accepted."
  [:map {:closed true}
   [:name                    ::dashboard.name]
   [:description             {:optional true} [:maybe :string]]
   [:creator_id              {:optional true} [:maybe ::lib.schema.id/user]]
   [:parameters              {:optional true} [:maybe [:sequential ::dashboard.parameter]]]
   [:points_of_interest      {:optional true} [:maybe :string]]
   [:caveats                 {:optional true} [:maybe :string]]
   [:show_in_getting_started {:optional true} [:maybe :boolean]]
   [:public_uuid             {:optional true} [:maybe :string]]
   [:made_public_by_id       {:optional true} [:maybe ::lib.schema.id/user]]
   [:enable_embedding        {:optional true} [:maybe :boolean]]
   [:embedding_params        {:optional true} [:maybe ms/EmbeddingParams]]
   [:archived                {:optional true} [:maybe :boolean]]
   [:archived_directly       {:optional true} [:maybe :boolean]]
   [:position                {:optional true} [:maybe :int]]
   [:collection_id           {:optional true} [:maybe ::lib.schema.id/collection]]
   [:collection_position     {:optional true} [:maybe :int]]
   [:cache_ttl               {:optional true} [:maybe :int]]
   [:entity_id               {:optional true} [:maybe :string]]
   [:auto_apply_filters      {:optional true} :boolean]
   [:width                   {:optional true} ::dashboard.width]
   [:embedding_type          {:optional true} [:maybe [:string {:decode/normalize lib.schema.common/normalize-string-key}]]]])

(mr/def ::dashboard-card.parameter-mapping
  "One entry of the `:parameter_mappings` column of a DashboardCard, decoded."
  ::parameters.schema/parameter-mapping)

(mr/def ::dashboard-card.visualization-settings
  "The `:visualization_settings` column of a DashboardCard, decoded."
  ::lib.schema.visualization/visualization-settings)

(mr/def ::dashboard-card
  "A DashboardCard as selected from the app DB: every column of `:report_dashboardcard`, plus the keys some callers
  hydrate onto it."
  [:merge
   ::dashboard-card.update
   [:map {:closed true}
    [:id                     ::lib.schema.id/dashcard]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]
    [:card                   {:optional true} [:maybe [:ref ::queries.schema/card]]]
    [:series                 {:optional true} [:maybe [:sequential [:ref ::queries.schema/card]]]]
    ;; hydrated onto public and embedded dashcards only
    [:timeline_events        {:optional true} [:maybe [:sequential [:ref :metabase.timeline.schema/timeline-event]]]]
    [:action                 {:optional true} [:maybe [:merge
                                                       :metabase.actions.schema/action
                                                       [:map {:closed true}
                                                        [:database_enabled_actions {:optional true} :boolean]]]]]]])

(mr/def ::dashboard-card.update
  "What an update (or insert) of a DashboardCard accepts: every column of `:report_dashboardcard` except `id`, all optional."
  [:map {:closed true}
   [:created_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at             {:optional true} [:maybe ms/TemporalInstant]]
   [:size_x                 {:optional true} [:maybe ::dashboard-card.size]]
   [:size_y                 {:optional true} [:maybe ::dashboard-card.size]]
   [:row                    {:optional true} [:maybe ::dashboard-card.position]]
   [:col                    {:optional true} [:maybe ::dashboard-card.position]]
   [:card_id                {:optional true} [:maybe ::lib.schema.id/card]]
   [:dashboard_id           {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:parameter_mappings     {:optional true} [:maybe [:sequential ::dashboard-card.parameter-mapping]]]
   [:visualization_settings {:optional true} [:maybe ::dashboard-card.visualization-settings]]
   [:entity_id              {:optional true} [:maybe :string]]
   [:action_id              {:optional true} [:maybe ::lib.schema.id/action]]
   [:dashboard_tab_id       {:optional true} [:maybe ::lib.schema.id/dashboard-tab]]
   [:inline_parameters      {:optional true} [:maybe [:sequential :string]]]])

(mr/def ::dashboard-card-series
  "A DashboardCardSeries as selected from the app DB: every column of `:dashboardcard_series`."
  ::dashboard-card-series.update)

(mr/def ::dashboard-card-series.update
  "What an update of a DashboardCardSeries takes: its `:id` and every other column of `:dashboardcard_series`, all optional."
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:dashboardcard_id {:optional true} [:maybe ::lib.schema.id/dashcard]]
   [:card_id          {:optional true} [:maybe ::lib.schema.id/card]]
   [:position         {:optional true} ::dashboard-card-series.position]])

(mr/def ::dashboard-card-series.create
  "What creating a DashboardCardSeries takes: its DashboardCard, its Card and its position."
  [:map {:closed true}
   [:dashboardcard_id ::lib.schema.id/dashcard]
   [:card_id          ::lib.schema.id/card]
   [:position         ::dashboard-card-series.position]])

(mr/def ::dashboard-tab
  "A DashboardTab as selected from the app DB: every column of `:dashboard_tab`."
  ::dashboard-tab.update)

(mr/def ::dashboard-tab.update
  "What an update of a DashboardTab takes: its `:id` and every other column of `:dashboard_tab`, all optional."
  [:map {:closed true}
   [:id           ms/PositiveInt]
   [:dashboard_id {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:name         {:optional true} ::dashboard-tab.name]
   [:position     {:optional true} ::dashboard-tab.position]
   [:entity_id    {:optional true} [:maybe :string]]
   [:created_at   {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at   {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::dashcard.revision
  "A DashboardCard as a Revision stores it among the cards of a Dashboard: its tracked columns, its `:id` and the ids of
  the Cards of its series, which an older snapshot may lack."
  [:schema
   {:decode/normalize (fn [dashcard]
                        (cond-> dashcard
                          (map? dashcard) (update :series #(or % []))))}
   [:merge
    [:select-keys ::dashboard-card.update
     [:card_id :action_id :dashboard_id :dashboard_tab_id :row :col :size_x :size_y :parameter_mappings
      :inline_parameters :visualization_settings]]
    [:map {:closed true}
     [:id     {:optional true} ::lib.schema.id/dashcard]
     [:series {:optional true} [:sequential ::lib.schema.id/card]]]]])

(mr/def ::dashboard-tab.revision
  "A DashboardTab as a Revision stores it among the tabs of a Dashboard: its tracked columns and its `:id`."
  [:merge
   [:select-keys ::dashboard-tab.update [:name :position :dashboard_id]]
   [:map {:closed true}
    [:id {:optional true} ::lib.schema.id/dashboard-tab]]])

(mr/def ::dashboard.revision
  "A Dashboard as a Revision stores it: its tracked columns, its cards and its tabs. A snapshot recorded before tabs
  existed holds none, and one without parameters holds none."
  [:schema
   {:decode/normalize (fn [snapshot]
                        (cond-> snapshot
                          (map? snapshot) (-> (update :cards #(or % []))
                                              (update :tabs #(or % []))
                                              (update :parameters #(or % [])))))}
   [:merge
    [:select-keys ::dashboard.update
     [:name :description :archived :archived_directly :auto_apply_filters :cache_ttl :collection_id :parameters :width]]
    [:map {:closed true}
     [:cards {:optional true} [:sequential [:ref ::dashcard.revision]]]
     [:tabs  {:optional true} [:sequential [:ref ::dashboard-tab.revision]]]]]])

(mr/def ::external-dashboard
  "A Dashboard as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::dashboard [:archived :archived_directly :auto_apply_filters :caveats :collection_position
                               :description :embedding_params :enable_embedding :embedding_type :entity_id :name
                               :points_of_interest :position :public_uuid :show_in_getting_started :width
                               :collection_id :creator_id :made_public_by_id :parameters]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:tabs {:optional true} [:maybe [:sequential [:ref ::external-dashboard-tab]]]]
     [:dashcards {:optional true} [:maybe [:sequential [:ref ::external-dashboard-card]]]]]]])

(mr/def ::dashboard-tab.create
  "What creating a DashboardTab takes: its Dashboard, its name and its position, and an entity id to keep."
  [:map {:closed true}
   [:dashboard_id ::lib.schema.id/dashboard]
   [:name         ::dashboard-tab.name]
   [:position     ::dashboard-tab.position]
   [:entity_id    {:optional true} [:maybe :string]]])

(mr/def ::external-dashboard-tab
  "A DashboardTab as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::dashboard-tab [:entity_id :name :position]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])

(mr/def ::external-dashboard-card
  "A DashboardCard as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::dashboard-card [:col :entity_id :inline_parameters :row :size_x :size_y :card_id :action_id
                                    :dashboard_tab_id :parameter_mappings :visualization_settings]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]
     [:series {:optional true} [:maybe [:sequential [:ref ::external-dashboard-card-series]]]]]]])

(mr/def ::external-dashboard-card-series
  "A DashboardCardSeries as serialization writes it, with portable references in place of ids."
  [:schema {:registry lib-be.schema/external-registry}
   [:merge
    [:select-keys ::dashboard-card-series [:position :card_id]]
    [:map {:closed true}
     [:serdes/meta {:optional true} ::models.schema/external-meta]]]])
