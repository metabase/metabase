(ns metabase.queries.schema
  (:require
   [metabase.documents.schema :as documents.schema]
   [metabase.lib-be.schema :as lib-be.schema]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.lib.schema.metadata :as lib.schema.metadata]
   [metabase.parameters.schema :as parameters.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
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

(mr/def ::card.partial
  "A possibly partial or hydrated Card instance, as non-db code passes it around: every column optional, extra keys
  allowed. Use [[::card]] for a row read from the app DB and [[::card.update]] for what an update accepts."
  [:map
   [:id                 {:optional true} [:maybe ::lib.schema.id/card]]
   [:collection_id      {:optional true} [:maybe ::lib.schema.id/collection]]
   [:dashboard_id       {:optional true} [:maybe ::lib.schema.id/dashboard]]
   [:database_id        {:optional true} [:maybe ::lib.schema.id/database]]
   [:document_id        {:optional true} [:maybe ::documents.schema/document.id]]
   [:dataset_query      {:optional true} [:maybe ::lib-be.schema/maybe-legacy-or-empty-query]]
   [:description        {:optional true} [:maybe :string]]
   [:name               {:optional true} [:maybe :string]]
   [:parameters         {:optional true} [:maybe [:ref ::parameters.schema/parameters]]]
   [:parameter_mappings {:optional true} [:maybe [:ref ::parameters.schema/parameter-mappings]]]
   [:type               {:optional true} [:maybe ::card.type]]
   [:result_metadata    {:optional true} [:maybe [:ref ::card.result-metadata]]]])

(mu/defn normalize-card :- [:maybe ::card.partial]
  "Normalize a `card` so it satisfies the `::card.partial` schema."
  [card :- [:maybe :map]]
  (lib/normalize ::card.partial card))

(mr/def ::card.dataset-query
  "The `:dataset_query` column of a Card, decoded."
  :map)

(mr/def ::card.visualization-settings
  "The `:visualization_settings` column of a Card, decoded."
  :map)

(mr/def ::card.parameter
  "One entry of the `:parameters` column of a Card, decoded."
  :map)

(mr/def ::card.parameter-mapping
  "One entry of the `:parameter_mappings` column of a Card, decoded."
  :map)

(mr/def ::card.dimension
  "One entry of the `:dimensions` column of a Card, decoded."
  :map)

(mr/def ::card.dimension-mapping
  "One entry of the `:dimension_mappings` column of a Card, decoded."
  :map)

(mr/def ::card
  "A Card as selected from the app DB: every column of `:report_card`, plus `:query_description` added by the model's after-select hook."
  [:map {:closed true}
   [:id                                        ::lib.schema.id/card]
   [:created_at                                ms/TemporalInstant]
   [:updated_at                                ms/TemporalInstant]
   [:name                                      :string]
   [:description                               [:maybe :string]]
   [:display                                   [:or :keyword :string]]
   [:dataset_query                             ::card.dataset-query]
   [:visualization_settings                    ::card.visualization-settings]
   [:creator_id                                ::lib.schema.id/user]
   [:database_id                               ::lib.schema.id/database]
   [:table_id                                  [:maybe ::lib.schema.id/table]]
   [:query_type                                [:maybe [:or :keyword :string]]]
   [:archived                                  :boolean]
   [:collection_id                             [:maybe ::lib.schema.id/collection]]
   [:public_uuid                               [:maybe :string]]
   [:made_public_by_id                         [:maybe ms/PositiveInt]]
   [:enable_embedding                          :boolean]
   [:embedding_params                          [:maybe ms/EmbeddingParams]]
   [:cache_ttl                                 [:maybe :int]]
   [:result_metadata                           [:maybe ::card.result-metadata]]
   [:collection_position                       [:maybe :int]]
   [:entity_id                                 :string]
   [:parameters                                [:maybe [:sequential ::card.parameter]]]
   [:parameter_mappings                        [:maybe [:sequential ::card.parameter-mapping]]]
   [:collection_preview                        :boolean]
   [:metabase_version                          [:maybe :string]]
   [:type                                      ::lib.schema.metadata/card.type]
   [:initially_published_at                    [:maybe ms/TemporalInstant]]
   [:cache_invalidated_at                      [:maybe ms/TemporalInstant]]
   [:last_used_at                              ms/TemporalInstant]
   [:view_count                                :int]
   [:archived_directly                         :boolean]
   [:dataset_query_metrics_v2_migration_backup {:optional true} [:maybe :string]]
   [:source_card_id                            [:maybe ::lib.schema.id/card]]
   [:dashboard_id                              [:maybe ::lib.schema.id/dashboard]]
   [:card_schema                               :int]
   [:document_id                               [:maybe ms/PositiveInt]]
   [:legacy_query                              [:maybe :string]]
   [:embedding_type                            [:maybe [:or :keyword :string]]]
   [:public_uuid_prefix                        [:maybe :string]]
   [:dimensions                                [:maybe [:sequential ::card.dimension]]]
   [:dimension_mappings                        [:maybe [:sequential ::card.dimension-mapping]]]
   [:metabot_conversation_id                   [:maybe :string]]
   [:metabot_chart_id                          [:maybe :string]]
   [:query_description                         {:optional true} [:maybe :string]]])

(mr/def ::card.update
  "What an update (or insert) of a Card accepts: every column of `:report_card` except `id`, all optional, plus `:verified-result-metadata?` consumed by the model's hooks."
  [:map {:closed true}
   [:created_at                                {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at                                {:optional true} [:maybe ms/TemporalInstant]]
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
   [:result_metadata                           {:optional true} [:maybe ::card.result-metadata]]
   [:collection_position                       {:optional true} [:maybe :int]]
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
  [:map {:closed true}
   [:id                        ms/PositiveInt]
   [:updated_at                ms/TemporalInstant]
   [:created_at                ms/TemporalInstant]
   [:card_id                   ::lib.schema.id/card]
   [:parameterized_object_type [:or :keyword :string]]
   [:parameterized_object_id   ms/PositiveInt]
   [:parameter_id              :string]])

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
  :map)

(mr/def ::query
  "A Query as selected from the app DB: every column of `:query`."
  [:map {:closed true}
   [:query_hash             [:or bytes? :string]]
   [:average_execution_time :int]
   [:query                  [:maybe ::query.query]]])

(mr/def ::query.update
  "What an update (or insert) of a Query accepts: every column of `:query` except `id`, all optional."
  [:map {:closed true}
   [:query_hash             {:optional true} [:maybe [:or bytes? :string]]]
   [:average_execution_time {:optional true} [:maybe :int]]
   [:query                  {:optional true} [:maybe ::query.query]]])

(mr/def ::query-execution.lens-params
  "The `:lens_params` column of a QueryExecution, decoded."
  :map)

(mr/def ::query-execution
  "A QueryExecution as selected from the app DB: every column of `:query_execution`, plus `:row_count` added by the model's after-select hook."
  [:map {:closed true}
   [:id                          ms/PositiveInt]
   [:hash                        [:or bytes? :string]]
   [:started_at                  ms/TemporalInstant]
   [:running_time                :int]
   [:result_rows                 :int]
   [:native                      :boolean]
   [:context                     [:maybe [:or :keyword :string]]]
   [:error                       [:maybe :string]]
   [:executor_id                 [:maybe ::lib.schema.id/user]]
   [:card_id                     [:maybe ::lib.schema.id/card]]
   [:dashboard_id                [:maybe ::lib.schema.id/dashboard]]
   [:pulse_id                    [:maybe ::lib.schema.id/pulse]]
   [:database_id                 [:maybe ::lib.schema.id/database]]
   [:cache_hit                   [:maybe :boolean]]
   [:action_id                   [:maybe ::lib.schema.id/action]]
   [:is_sandboxed                [:maybe :boolean]]
   [:cache_hash                  [:maybe [:or bytes? :string]]]
   [:embedding_client            [:maybe :string]]
   [:embedding_sdk_version       [:maybe :string]]
   [:parameterized               [:maybe :boolean]]
   [:transform_id                [:maybe ::lib.schema.id/transform]]
   [:lens_id                     [:maybe :string]]
   [:lens_params                 [:maybe ::query-execution.lens-params]]
   [:auth_method                 [:maybe [:or :keyword :string]]]
   [:tenant_id                   [:maybe ms/PositiveInt]]
   [:is_impersonated             [:maybe :boolean]]
   [:is_db_routed                [:maybe :boolean]]
   [:parameters                  [:maybe :string]]
   [:embedding_hostname          [:maybe :string]]
   [:embedding_path              [:maybe :string]]
   [:user_agent                  [:maybe :string]]
   [:ip_address                  [:maybe :string]]
   [:sanitized_user_agent        [:maybe :string]]
   [:embedding_route             [:maybe :string]]
   [:metabase_version            [:maybe :string]]
   [:embedding_client_identifier [:maybe :string]]
   [:row_count                   {:optional true} :int]])

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
  [:map {:closed true}
   [:id       ms/PositiveInt]
   [:card_id  ::lib.schema.id/card]
   [:table_id [:maybe ::lib.schema.id/table]]
   [:schema   [:maybe :string]]
   [:table    :string]])

(mr/def ::query-table.update
  "What an update (or insert) of a QueryTable accepts: every column of `:query_table` except `id`, all optional."
  [:map {:closed true}
   [:card_id  {:optional true} [:maybe ::lib.schema.id/card]]
   [:table_id {:optional true} [:maybe ::lib.schema.id/table]]
   [:schema   {:optional true} [:maybe :string]]
   [:table    {:optional true} [:maybe :string]]])

(mr/def ::stored-result.dataset-query
  "The `:dataset_query` column of a StoredResult, decoded."
  :map)

(mr/def ::stored-result.data-access-token
  "The `:data_access_token` column of a StoredResult, decoded."
  :map)

(mr/def ::stored-result
  "A StoredResult as selected from the app DB: every column of `:stored_result`."
  [:map {:closed true}
   [:id                ms/PositiveInt]
   [:result_data       [:or bytes? :string]]
   [:creator_id        [:maybe ::lib.schema.id/user]]
   [:database_id       [:maybe ::lib.schema.id/database]]
   [:dataset_query     ::stored-result.dataset-query]
   [:data_access_token [:maybe ::stored-result.data-access-token]]
   [:row_count         [:maybe :int]]
   [:created_at        ms/TemporalInstant]
   [:updated_at        ms/TemporalInstant]])

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
  [:map {:closed true}
   [:id               ms/PositiveInt]
   [:stored_result_id ms/PositiveInt]
   [:exploration_id   [:maybe ms/PositiveInt]]
   [:created_at       ms/TemporalInstant]
   [:updated_at       ms/TemporalInstant]
   [:card_id          [:maybe ::lib.schema.id/card]]])

(mr/def ::stored-result-use.update
  "What an update (or insert) of a StoredResultUse accepts: every column of `:stored_result_use` except `id`, all optional."
  [:map {:closed true}
   [:stored_result_id {:optional true} [:maybe ms/PositiveInt]]
   [:exploration_id   {:optional true} [:maybe ms/PositiveInt]]
   [:created_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:updated_at       {:optional true} [:maybe ms/TemporalInstant]]
   [:card_id          {:optional true} [:maybe ::lib.schema.id/card]]])
