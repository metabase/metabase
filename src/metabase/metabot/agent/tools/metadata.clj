(ns metabase.metabot.agent.tools.metadata
  "Metadata tool wrappers."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.metabot.config :as metabot-v3.config]
   [metabase.metabot.tools.entity-details :as entity-details-tools]
   [metabase.metabot.tools.field-stats :as field-stats-tools]
   [metabase.metabot.tools.get-metadata :as metadata-tools]
   [metabase.metabot.tools.instructions :as instructions]
   [metabase.metabot.tools.llm-representations :as llm-rep]))

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
  ;; NOTE: keep in sync with read_resource.clj/format-content :field-metadata branch
  [{:keys [field_id value_metadata]}]
  (format-with-instructions
   (llm-rep/field-metadata->xml {:field_id field_id :value_metadata value_metadata})
   instructions/field-metadata-instructions))

(defn- add-output
  "Add :output to a tool result that has :structured-output, using the given format-fn."
  [result format-fn]
  (m/assoc-some result :output (some-> result :structured-output format-fn)))

(defn list-available-data-sources-tool "list-available-data-sources-tool" []
  {:tool-name "list_available_data_sources"
   :doc       "List all data sources (metrics and models) available to the metabot instance."
   :schema    [:=> [:cat [:maybe [:map {:closed true}]]] :any]
   :fn        (fn [_args]
                (add-output
                 (entity-details-tools/answer-sources {:metabot-id metabot-v3.config/embedded-metabot-id
                                                       :with-field-values? false})
                 format-answer-sources-output))})

(def ^:private list-available-fields-schema
  [:map {:closed true}
   [:table_ids [:sequential :int]]
   [:model_ids [:sequential :int]]
   [:metric_ids [:sequential :int]]])

(defn list-available-fields-tool "list-available-fields-tool" []
  {:tool-name "list_available_fields"
   :doc       "Retrieve metadata for tables, models, and metrics."
   :schema    [:=> [:cat list-available-fields-schema] :any]
   :fn        (fn [{:keys [table_ids model_ids metric_ids]}]
                (add-output
                 (metadata-tools/get-metadata {:table-ids table_ids
                                               :model-ids model_ids
                                               :metric-ids metric_ids})
                 format-metadata-output))})

(def ^:private get-field-values-schema
  [:map {:closed true}
   [:data_source [:enum "table" "model" "metric"]]
   [:source_id :int]
   [:field_id :string]])

(defn get-field-values-tool "get-field-values-tool" []
  {:tool-name "get_field_values"
   :doc       "Return metadata for a given field of a given data source."
   :schema    [:=> [:cat get-field-values-schema] :any]
   :fn        (fn [{:keys [data_source source_id field_id]}]
                (add-output
                 (field-stats-tools/field-values {:entity-type data_source
                                                  :entity-id source_id
                                                  :field-id field_id
                                                  :limit nil})
                 format-field-metadata-output))})
