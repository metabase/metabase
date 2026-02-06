(ns metabase-enterprise.metabot-v3.agent.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details-tools]
   [metabase-enterprise.metabot-v3.tools.field-stats :as field-stats-tools]
   [metabase-enterprise.metabot-v3.tools.get-metadata :as metadata-tools]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.llm-representations :as llm-rep]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- format-with-instructions
  [data instruction-text]
  (str "<result>\n" data "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-answer-sources-output
  [{:keys [metrics models]}]
  (let [content (str (when (seq metrics)
                       (str "<metrics>\n"
                            (str/join "\n" (map llm-rep/metric->xml metrics))
                            "\n</metrics>\n"))
                     (when (seq models)
                       (str "<metabase-models>\n"
                            (str/join "\n" (map llm-rep/model->xml models))
                            "\n</metabase-models>")))]
    (format-with-instructions content instructions/answer-sources-instructions)))

(defn- format-metadata-output
  [structured]
  (llm-rep/get-metadata-result->xml structured))

(defn- format-field-metadata-output
  [{:keys [field_id value_metadata]}]
  (format-with-instructions
   (llm-rep/field-metadata->xml {:field_id field_id :value_metadata value_metadata})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (if-let [structured (:structured-output result)]
    (assoc result :output (format-fn structured))
    result))

(mu/defn ^{:tool-name "list_available_data_sources"} list-available-data-sources-tool
  "List all data sources (metrics and models) available to the metabot instance."
  [_args :- [:map {:closed true}]]
  (add-output
   (entity-details-tools/answer-sources {:metabot-id metabot-v3.config/embedded-metabot-id
                                         :with-field-values? false})
   format-answer-sources-output))

(mu/defn ^{:tool-name "list_available_fields"} list-available-fields-tool
  "Retrieve metadata for tables, models, and metrics."
  [{:keys [table_ids model_ids metric_ids]} :- [:map {:closed true}
                                                [:table_ids [:sequential :int]]
                                                [:model_ids [:sequential :int]]
                                                [:metric_ids [:sequential :int]]]]
  (add-output
   (metadata-tools/get-metadata {:table-ids table_ids
                                 :model-ids model_ids
                                 :metric-ids metric_ids})
   format-metadata-output))

(mu/defn ^{:tool-name "get_field_values"} get-field-values-tool
  "Return metadata for a given field of a given data source."
  [{:keys [data_source source_id field_id]} :- [:map {:closed true}
                                                [:data_source [:enum "table" "model" "metric"]]
                                                [:source_id :int]
                                                [:field_id :string]]]
  (add-output
   (field-stats-tools/field-values {:entity-type data_source
                                    :entity-id source_id
                                    :field-id field_id
                                    :limit nil})
   format-field-metadata-output))
