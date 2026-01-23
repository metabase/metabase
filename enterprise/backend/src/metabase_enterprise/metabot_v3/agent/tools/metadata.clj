(ns metabase-enterprise.metabot-v3.agent.tools.metadata
  "Metadata tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details-tools]
   [metabase-enterprise.metabot-v3.tools.field-stats :as field-stats-tools]
   [metabase-enterprise.metabot-v3.tools.get-metadata :as metadata-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn ^{:tool-name "list_available_data_sources"} list-available-data-sources-tool
  "List all data sources (metrics and models) available to the metabot instance."
  [_args :- [:map {:closed true}]]
  (entity-details-tools/answer-sources {:metabot-id metabot-v3.config/embedded-metabot-id
                                        :with-field-values? false}))

(mu/defn ^{:tool-name "list_available_fields"} list-available-fields-tool
  "Retrieve metadata for tables, models, and metrics."
  [{:keys [table_ids model_ids metric_ids]} :- [:map {:closed true}
                                                [:table_ids [:sequential :int]]
                                                [:model_ids [:sequential :int]]
                                                [:metric_ids [:sequential :int]]]]
  (metadata-tools/get-metadata {:table-ids table_ids
                                :model-ids model_ids
                                :metric-ids metric_ids}))

(mu/defn ^{:tool-name "get_field_values"} get-field-values-tool
  "Return metadata for a given field of a given data source."
  [{:keys [data_source source_id field_id]} :- [:map {:closed true}
                                                [:data_source [:enum "table" "model" "metric"]]
                                                [:source_id :int]
                                                [:field_id :string]]]
  (field-stats-tools/field-values {:entity-type data_source
                                   :entity-id source_id
                                   :field-id field_id
                                   :limit nil}))
