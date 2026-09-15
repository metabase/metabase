(ns metabase.queries.schema
  (:require
   [metabase.content-verification.schema]
   [metabase.documents.schema :as documents.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.permissions.schema :as permissions.schema]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema.schema]
   [potemkin :as p]))

(p/import-vars
 [lib.schema.metadata
  card-types])

(mr/def ::card.type
  ::lib.schema.metadata/card.type)

(mr/def ::card.result-metadata
  [:and
   [:sequential ::lib.schema.metadata/lib-or-legacy-column]
   ;; if the metadata could not be normalized into something valid, then just set it to `nil`. Ideally we shouldn't
   ;; have to do this -- we should try to fix flaws in metadata thru normalization if at all possible.
   [:schema
    {:decode/normalize (fn [xs]
                         (if (or
                              (nil? xs)
                              (mr/validate [:sequential ::lib.schema.metadata/lib-or-legacy-column] xs))
                           xs
                           (do
                             (log/warn "Ignoring invalid Card result_metadata")
                             nil)))}
    :any]])

(mr/def ::card.result-metadata.model-override
  "A model's result metadata column as serialization exports it: only the keys a user can override, which the Card's
  hooks merge onto the metadata computed from its query."
  [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:43"}
   [:name                    :string]
   [:id                      {:optional true} [:maybe ::lib.schema.id/field]]
   [:description             {:optional true} [:maybe :string]]
   [:display_name            {:optional true} [:maybe :string]]
   [:semantic_type           {:optional true} [:maybe ms/FieldSemanticOrRelationType]]
   [:fk_target_field_id      {:optional true} [:maybe ::lib.schema.id/field]]
   [:settings                {:optional true} [:maybe ms/VisualizationSettings]]
   [:visibility_type         {:optional true} [:maybe [:or :keyword :string]]]
   [:lib/source_display_name {:optional true} [:maybe :string]]])

(mr/def ::card
  "Schema for an instance of a `:model/Card`: every real column of `:report_card` (see `::card.update`) plus `:id`,
  the `:persisted/*` columns some queries join in from `persisted_info`, and the keys some callers hydrate onto a
  Card before passing it here."
  [:merge
   ::card.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:60"}
    [:id                    {:optional true} [:maybe ::lib.schema.id/card]]
    [:persisted/active      {:optional true} [:maybe :boolean]]
    [:persisted/definition  {:optional true} [:maybe :string]]
    [:persisted/query_hash  {:optional true} [:maybe :string]]
    [:persisted/state       {:optional true} [:maybe :string]]
    [:persisted/table_name  {:optional true} [:maybe :string]]
    [:dashboardcard_id      {:optional true} [:maybe ::lib.schema.id/dashcard]]
    [:collection            {:optional true} [:maybe :metabase.collections.schema/collection-or-root]]
    [:creator               {:optional true} [:maybe :metabase.users.schema/user]]
    [:dashboard             {:optional true} [:maybe [:ref :metabase.dashboards.schema/dashboard]]]
    [:document              {:optional true} [:maybe ::documents.schema/document]]
    [:last-edit-info        {:optional true} [:maybe
                                              [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:73"}
                                               [:timestamp  [:maybe ms/TemporalInstant]]
                                               [:id         [:maybe ms/PositiveInt]]
                                               [:first_name [:maybe :string]]
                                               [:last_name  [:maybe :string]]
                                               [:email      [:maybe :string]]]]]
    [:moderation_reviews    {:optional true} [:sequential :metabase.content-verification.schema/moderation-review]]
    [:can_delete            {:optional true} :boolean]
    [:can_manage_db         {:optional true} :boolean]
    [:can_restore           {:optional true} :boolean]
    [:can_write             {:optional true} :boolean]
    [:dashboard_count       {:optional true} :int]
    [:query_description     {:optional true} [:maybe :string]]
    [:parameter_usage_count {:optional true} :int]
    [:average_query_time    {:optional true} [:maybe number?]]
    [:last_query_start      {:optional true} [:maybe ms/TemporalInstant]]
    [:based_on_upload       {:optional true} [:maybe ::lib.schema.id/table]]
    [:param_fields          {:optional true} [:maybe [:map-of :string [:sequential ::param-field]]]]
    [:is_remote_synced      {:optional true} :boolean]
    [:authority_level           {:optional true} [:maybe [:or :keyword :string]]]
    [:collection_name           {:optional true} [:maybe :string]]
    [:collection_authority_level {:optional true} [:maybe [:or :keyword :string]]]
    [:dashboard_name            {:optional true} [:maybe :string]]
    [:entity-coll-id            {:optional true} [:maybe ::lib.schema.id/collection]]
    [:moderated-status          {:optional true} [:maybe :string]]
    [:moderated_status          {:optional true} [:maybe :string]]
    [:location                  {:optional true} [:maybe :string]]
    [:dashboard_tab_id          {:optional true} [:maybe ms/PositiveInt]]
    [:in_library                {:optional true} :boolean]
    [:persisted                 {:optional true} :boolean]
    [:query_average_duration    {:optional true} [:maybe number?]]
    [:download_perms            {:optional true} [:maybe [:enum :none :limited :full]]]
    [:in_dashboards             {:optional true} [:maybe [:sequential
                                                          [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:106"}
                                                           [:id                ::lib.schema.id/dashboard]
                                                           [:name              :string]
                                                           [:collection_id     [:maybe ::lib.schema.id/collection]]
                                                           [:description       [:maybe :string]]
                                                           [:archived          :boolean]
                                                           [:enable_embedding  :boolean]]]]]]])

(mr/def ::param-field.name-field
  "A Field trimmed to the columns a parameter widget needs, as the `:name_field` hydration attaches it."
  [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:116"}
   [:id                 ::lib.schema.id/field]
   [:table_id           [:maybe ::lib.schema.id/table]]
   [:display_name       [:maybe :string]]
   [:base_type          [:maybe [:or :keyword :string]]]
   [:effective_type     [:maybe [:or :keyword :string]]]
   [:name               :string]
   [:semantic_type      [:maybe [:or :keyword :string]]]
   [:has_field_values   [:maybe [:or :keyword :string]]]
   [:fk_target_field_id [:maybe ::lib.schema.id/field]]
   [:settings           [:maybe :metabase.warehouse-schema.schema/field.settings]]])

(mr/def ::param-field.target
  "A `::param-field.name-field` further hydrated with its own `:name_field`, as the `:target` hydration attaches it."
  [:merge
   ::param-field.name-field
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:132"}
    [:name_field {:optional true} [:maybe ::param-field.name-field]]]])

(mr/def ::param-field
  "A Field trimmed down to the columns a parameter widget needs, as `:param_fields` hydrates it onto a Card or
  Dashboard."
  [:merge
   ::param-field.target
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:140"}
    [:target     {:optional true} [:maybe ::param-field.target]]
    [:dimensions {:optional true} [:sequential [:merge
                                                :metabase.warehouse-schema.schema/dimension
                                                [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:144"}
                                                 [:human_readable_field {:optional true} [:maybe ::param-field.name-field]]]]]]]])

(mr/def ::card.dataset-query
  "The `:dataset_query` column of a Card, decoded."
  ::lib-be.schema/maybe-legacy-or-empty-query)

(mr/def ::card.visualization-settings
  "The `:visualization_settings` column of a Card, decoded."
  ms/VisualizationSettings)

(mr/def ::card.parameter
  "One entry of the `:parameters` column of a Card, decoded."
  ::parameters.schema/parameter)

(mr/def ::card.parameter-mapping
  "One entry of the `:parameter_mappings` column of a Card, decoded."
  ::parameters.schema/parameter-mapping)

(mr/def ::card.dimension
  "One entry of the `:dimensions` column of a Card, decoded."
  ::lib-metric.schema/dimension)

(mr/def ::card.dimension-mapping
  "One entry of the `:dimension_mappings` column of a Card, decoded."
  ::lib-metric.schema/dimension-mapping)

(mr/def ::card.update
  "What an update (or insert) of a Card accepts: every column of `:report_card` except `id`, all optional, plus `:verified-result-metadata?` consumed by the model's hooks."
  [:map {:closed true}
   [:created_at                                {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                                {:optional true} [:maybe [:or ms/TemporalInstant [:= :updated_at]]]]
   [:name                                      {:optional true} [:maybe :string]]
   [:description                               {:optional true} [:maybe :string]]
   [:display                                   {:optional true} [:maybe [:or :keyword :string]]]
   [:dataset_query                             {:optional true} [:maybe ::card.dataset-query]]
   [:visualization_settings                    {:optional true} [:maybe ::card.visualization-settings]]
   [:creator_id                                {:optional true} [:maybe ::lib.schema.id/user]]
   [:database_id                               {:optional true} [:maybe ::lib.schema.id/database]]
   [:table_id                                  {:optional true} [:maybe ::lib.schema.id/table]]
   [:query_type                                {:optional true} [:maybe [:or :keyword :string]]]
   [:archived                                  {:optional true} [:maybe :boolean]]
   [:collection_id                             {:optional true} [:maybe ::lib.schema.id/collection]]
   [:public_uuid                               {:optional true} [:maybe :string]]
   [:made_public_by_id                         {:optional true} [:maybe ms/PositiveInt]]
   [:enable_embedding                          {:optional true} [:maybe :boolean]]
   [:embedding_params                          {:optional true} [:maybe ms/EmbeddingParams]]
   [:cache_ttl                                 {:optional true} [:maybe :int]]
   [:result_metadata                           {:optional true} [:maybe [:or
                                                                         ::card.result-metadata
                                                                         [:sequential ::card.result-metadata.model-override]]]]
   [:collection_position                       {:optional true} [:maybe [:or :int [:tuple [:enum :+ :-] [:= :collection_position] [:= 1]]]]]
   [:entity_id                                 {:optional true} [:maybe :string]]
   [:parameters                                {:optional true} [:maybe [:sequential ::card.parameter]]]
   [:parameter_mappings                        {:optional true} [:maybe [:sequential ::card.parameter-mapping]]]
   [:collection_preview                        {:optional true} [:maybe :boolean]]
   [:metabase_version                          {:optional true} [:maybe :string]]
   [:type                                      {:optional true} [:maybe ::lib.schema.metadata/card.type]]
   [:initially_published_at                    {:optional true} [:maybe ms/TemporalInstant]]
   [:cache_invalidated_at                      {:optional true} [:maybe ms/TemporalInstant]]
   [:last_used_at                              {:optional true} [:maybe ms/TemporalInstant]]
   [:view_count                                {:optional true} [:maybe :int]]
   [:archived_directly                         {:optional true} [:maybe :boolean]]
   [:dataset_query_metrics_v2_migration_backup {:optional true} [:maybe :string]]
   [:source_card_id                            {:optional true} [:maybe ::lib.schema.id/card]]
   [:dashboard_id                              {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:card_schema                               {:optional true} [:maybe :int]]
   [:document_id                               {:optional true} [:maybe ::documents.schema/document.id]]
   [:legacy_query                              {:optional true} [:maybe :string]]
   [:embedding_type                            {:optional true} [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix                        {:optional true} [:maybe :string]]
   [:dimensions                                {:optional true} [:maybe [:sequential ::card.dimension]]]
   [:dimension_mappings                        {:optional true} [:maybe [:sequential ::card.dimension-mapping]]]
   [:metabot_conversation_id                   {:optional true} [:maybe :string]]
   [:metabot_chart_id                          {:optional true} [:maybe :string]]
   [:verified-result-metadata?                 {:optional true} :boolean]])

(mr/def ::parameter-card
  "A ParameterCard as selected from the app DB: every column of `:parameter_card`."
  [:merge
   ::parameter-card.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:225"}
    [:id                        ms/PositiveInt]]])

(mr/def ::parameter-card.update
  "What an update (or insert) of a ParameterCard accepts: every column of `:parameter_card` except `id`, all optional."
  [:map {:closed true}
   [:updated_at                {:optional true} [:maybe ms/TemporalInstant]]
   [:created_at                {:optional true} [:maybe ms/TemporalInstant]]
   [:card_id                   {:optional true} [:maybe ::lib.schema.id/card]]
   [:parameterized_object_type {:optional true} [:maybe [:or :keyword :string]]]
   [:parameterized_object_id   {:optional true} [:maybe ms/PositiveInt]]
   [:parameter_id              {:optional true} [:maybe :string]]])

(mr/def ::query.query
  "The `:query` column of a Query, decoded."
  [:ref ::lib-be.schema/maybe-legacy-or-internal-query])

(mr/def ::query
  "A Query as selected from the app DB: every column of `:query`."
  [:merge
   ::query.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:246"}]])

(mr/def ::query.update
  "What an update (or insert) of a Query accepts: every column of `:query` except `id`, all optional."
  [:map {:closed true}
   [:query_hash             {:optional true} [:maybe [:or bytes? :string]]]
   [:average_execution_time {:optional true} [:maybe :int]]
   [:query                  {:optional true} [:maybe ::query.query]]])

(mr/def ::query-execution.lens-params
  "The `:lens_params` column of a QueryExecution, decoded."
  [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:257"}
   [:join_step {:optional true} [:maybe :int]]])

(mr/def ::query-execution
  "A QueryExecution as selected from the app DB: every column of `:query_execution`, plus `:row_count` added by the model's after-select hook."
  [:merge
   ::query-execution.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:264"}
    [:id                          ms/PositiveInt]
    [:row_count                   {:optional true} :int]]])

(mr/def ::query-execution.update
  "What an update (or insert) of a QueryExecution accepts: every column of `:query_execution` except `id`, all optional."
  [:map {:closed true}
   [:hash                        {:optional true} [:maybe [:or bytes? :string]]]
   [:started_at                  {:optional true} [:maybe ms/TemporalInstant]]
   [:running_time                {:optional true} [:maybe :int]]
   [:result_rows                 {:optional true} [:maybe :int]]
   [:native                      {:optional true} [:maybe :boolean]]
   [:context                     {:optional true} [:maybe [:or :keyword :string]]]
   [:error                       {:optional true} [:maybe :string]]
   [:executor_id                 {:optional true} [:maybe ::lib.schema.id/user]]
   [:card_id                     {:optional true} [:maybe ::lib.schema.id/card]]
   [:dashboard_id                {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:pulse_id                    {:optional true} [:maybe ::lib.schema.id/pulse]]
   [:database_id                 {:optional true} [:maybe ::lib.schema.id/database]]
   [:cache_hit                   {:optional true} [:maybe :boolean]]
   [:action_id                   {:optional true} [:maybe ::lib.schema.id/action]]
   [:is_sandboxed                {:optional true} [:maybe :boolean]]
   [:cache_hash                  {:optional true} [:maybe [:or bytes? :string]]]
   [:embedding_client            {:optional true} [:maybe :string]]
   [:embedding_sdk_version       {:optional true} [:maybe :string]]
   [:parameterized               {:optional true} [:maybe :boolean]]
   [:transform_id                {:optional true} [:maybe ::lib.schema.id/transform]]
   [:lens_id                     {:optional true} [:maybe :string]]
   [:lens_params                 {:optional true} [:maybe ::query-execution.lens-params]]
   [:auth_method                 {:optional true} [:maybe [:or :keyword :string]]]
   [:tenant_id                   {:optional true} [:maybe ms/PositiveInt]]
   [:is_impersonated             {:optional true} [:maybe :boolean]]
   [:is_db_routed                {:optional true} [:maybe :boolean]]
   [:parameters                  {:optional true} [:maybe :string]]
   [:embedding_hostname          {:optional true} [:maybe :string]]
   [:embedding_path              {:optional true} [:maybe :string]]
   [:user_agent                  {:optional true} [:maybe :string]]
   [:ip_address                  {:optional true} [:maybe :string]]
   [:sanitized_user_agent        {:optional true} [:maybe :string]]
   [:embedding_route             {:optional true} [:maybe :string]]
   [:metabase_version            {:optional true} [:maybe :string]]
   [:embedding_client_identifier {:optional true} [:maybe :string]]])

(mr/def ::query-table
  "A QueryTable as selected from the app DB: every column of `:query_table`."
  [:merge
   ::query-table.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:311"}
    [:id       ms/PositiveInt]]])

(mr/def ::query-table.update
  "What an update (or insert) of a QueryTable accepts: every column of `:query_table` except `id`, all optional."
  [:map {:closed true}
   [:card_id  {:optional true} [:maybe ::lib.schema.id/card]]
   [:table_id {:optional true} [:maybe ::lib.schema.id/table]]
   [:schema   {:optional true} [:maybe :string]]
   [:table    {:optional true} [:maybe :string]]])

(mr/def ::stored-result.dataset-query
  "The `:dataset_query` column of a StoredResult, decoded."
  :metabase.lib.util/query-like)

(mr/def ::stored-result.data-access-token
  "The `:data_access_token` column of a StoredResult, decoded."
  ::permissions.schema/data-access-token)

(mr/def ::stored-result
  "A StoredResult as selected from the app DB: every column of `:stored_result`."
  [:merge
   ::stored-result.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:334"}
    [:id                ms/PositiveInt]]])

(mr/def ::stored-result.update
  "What an update (or insert) of a StoredResult accepts: every column of `:stored_result` except `id`, all optional."
  [:map {:closed true}
   [:result_data       {:optional true} [:maybe [:or bytes? :string]]]
   [:creator_id        {:optional true} [:maybe ::lib.schema.id/user]]
   [:database_id       {:optional true} [:maybe ::lib.schema.id/database]]
   [:dataset_query     {:optional true} [:maybe ::stored-result.dataset-query]]
   [:data_access_token {:optional true} [:maybe ::stored-result.data-access-token]]
   [:row_count         {:optional true} [:maybe :int]]
   [:created_at        {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at        {:optional true} [:maybe ms/TemporalInstant]]])

(mr/def ::stored-result-use
  "A StoredResultUse as selected from the app DB: every column of `:stored_result_use`."
  [:merge
   ::stored-result-use.update
   [:map {:closed true, :probe/id "src/metabase/queries/schema.clj:353"}
    [:id               ms/PositiveInt]]])

(mr/def ::stored-result-use.update
  "What an update (or insert) of a StoredResultUse accepts: every column of `:stored_result_use` except `id`, all optional."
  [:map {:closed true}
   [:stored_result_id {:optional true} [:maybe ms/PositiveInt]]
   [:exploration_id   {:optional true} [:maybe ms/PositiveInt]]
   [:created_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:card_id          {:optional true} [:maybe ::lib.schema.id/card]]])
