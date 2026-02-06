(ns metabase-enterprise.metabot-v3.tools.llm-representations
  "LLM representation utilities for formatting entities as XML.
   Matches Python AI Service patterns exactly for consistency."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.prompts :as prompts]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [selmer.parser :as selmer]))

(set! *warn-on-reflection* true)

(def ^:private llm-template-name "llm_representations.selmer")

(defn- escape-xml
  "Escape XML special characters in a string.
   Only needed for content that bypasses Selmer's auto-escaping (marked with |safe)."
  [s]
  (when s
    (-> (str s)
        (str/replace "&" "&amp;")
        (str/replace "<" "&lt;")
        (str/replace ">" "&gt;")
        (str/replace "\"" "&quot;"))))

(defn- database-type-or-unknown
  "Return database type or 'unknown' if nil."
  [database-type]
  (or database-type "unknown"))

(defn- database-engine-or-unknown
  "Return database engine or 'unknown' if nil."
  [database-engine]
  (or database-engine "unknown"))

(defn- type-flags
  "Build template flags for a single representation type."
  [type]
  {:is_field (= type :field)
   :is_collection (= type :collection)
   :is_related_table (= type :related_table)
   :is_metric (= type :metric)
   :is_table (= type :table)
   :is_model (= type :model)
   :is_query_results (= type :query_results)
   :is_query (= type :query)
   :is_visualization (= type :visualization)
   :is_chart (= type :chart)
   :is_question (= type :question)
   :is_text_card (= type :text_card)
   :is_viz_card (= type :viz_card)
   :is_dashboard (= type :dashboard)
   :is_database_schema (= type :database_schema)
   :is_database (= type :database)
   :is_user (= type :user)
   :is_search_result (= type :search_result)
   :is_search_results (= type :search_results)
   :is_field_values_metadata (= type :field_values_metadata)
   :is_field_metadata (= type :field_metadata)
   :is_get_metadata_result (= type :get_metadata_result)})

(defn- render-llm-template
  "Render a Selmer template with the supplied context."
  [type context]
  (let [template (prompts/get-cached-llm-representations-template)
        payload (merge (type-flags type) context)]
    (if template
      (try
        (-> (selmer/render template payload)
            str/trim)
        (catch Exception e
          (log/error e "Error rendering LLM representations template" {:type type})
          (pr-str payload)))
      (do
        (log/warn "LLM representations template missing" {:template llm-template-name})
        (pr-str payload)))))

(defn format-fields-table
  "Format fields as markdown table for LLM.
   Matches Python render_table output format.
   Note: This output is used with |safe in templates, so we must escape manually."
  [fields & [{:keys [columns] :or {columns {:name "Field Name"
                                            :field_id "Field ID"
                                            :type "Type"
                                            :database_type "Database Type"
                                            :description "Description"}}}]]
  (when (seq fields)
    (let [col-keys (keys columns)
          headers (vals columns)]
      (str "| " (str/join " | " headers) " |\n"
           "|" (str/join "|" (repeat (count headers) "---")) "|\n"
           (str/join "\n"
                     (map (fn [field]
                            (str "| "
                                 (str/join " | "
                                           (map (fn [k]
                                                  (escape-xml
                                                   (let [v (get field k)]
                                                     (cond
                                                       (nil? v) ""
                                                       (= k :type) (if (keyword? v) (clojure.core/name v) (str v))
                                                       (= k :base-type) (if (keyword? v) (clojure.core/name v) (str v))
                                                       :else (str v)))))
                                                col-keys))
                                 " |"))
                          fields))))))

(defn field->xml
  "Format a field/column as XML element.
   Matches Python Column.llm_representation exactly."
  [{:keys [field_id name display_name base-type database_type description]}]
  (render-llm-template
   :field
   {:field_id            field_id
    ;; Uses |safe in template to preserve literal \" quotes, so we escape the name for XML safety
    :field_name_quoted   (str "\\\"" (escape-xml name) "\\\"")
    :field_display_name  (or display_name name)
    :field_base_type     (when base-type (clojure.core/name base-type))
    :field_database_type (database-type-or-unknown database_type)
    :field_description   description}))

(defn collection->xml
  "Format collection for LLM consumption.
   Matches Python Collection.llm_representation exactly."
  [{:keys [name description authority_level]}]
  (render-llm-template
   :collection
   {:collection_name            (or name "Our analytics")
    :collection_description     description
    :collection_authority_level authority_level}))

(defn- related-table->xml
  "Format a related table for LLM consumption."
  [{:keys [id name related_by fully_qualified_name fields]}]
  (render-llm-template
   :related_table
   {:related_table_id         (when (some? id) (str id))
    :related_table_name       name
    :related_table_related_by related_by
    :related_table_fqn        fully_qualified_name
    :related_table_fields_xml (when (seq fields) (str/join "" (map field->xml fields)))}))

(defn metric->xml
  "Format metric for LLM consumption.
   Matches Python Metric.get_llm_representation exactly."
  [{:keys [id name description verified queryable-dimensions collection
           default_time_dimension_field]}]
  (render-llm-template
   :metric
   {:metric_id                     (str id)
    :metric_name                   name
    :metric_verified               (boolean verified)
    :metric_description            description
    :metric_collection_xml         (when collection (collection->xml collection))
    :metric_default_time_dimension (:name default_time_dimension_field)
    :metric_dimensions_table       (when (seq queryable-dimensions)
                                     (format-fields-table queryable-dimensions))}))

(defn- fully-qualified-name
  "Get fully qualified name for a table."
  [database_schema name]
  (if database_schema
    (str database_schema "." name)
    name))

(defn table->xml
  "Format table for LLM consumption.
   Matches Python Table.get_llm_representation exactly."
  [{:keys [id name database_id database_engine database_schema
           description fields related_tables]}]
  (let [fqn (fully-qualified-name database_schema name)]
    (render-llm-template
     :table
     {:table_id (str id)
      :table_name name
      :table_database_id (str database_id)
      :table_database_engine (database-engine-or-unknown database_engine)
      :table_fqn fqn
      :table_description description
      :table_fields_xml (when (seq fields) (str/join "" (map field->xml fields)))
      :table_related_tables_xml (when (seq related_tables)
                                  (str/join "" (map related-table->xml related_tables)))})))

(defn- model-fully-qualified-name
  "Get fully qualified name for a model (uses slug format)."
  [id name]
  ;; Python uses: f"{{#{self.id}}}-{slug}"
  ;; We'll use a simplified version
  (let [slug (-> (or name "")
                 u/lower-case-en
                 (str/replace #"[^a-z0-9]+" "-")
                 (str/replace #"^-|-$" ""))]
    (str "{#" id "}-" slug)))

(defn model->xml
  "Format model for LLM consumption.
   Matches Python Model.get_llm_representation exactly.
   Note: Python uses <metabase-model> tag but closes with </model>."
  [{:keys [id name description verified fields database_id database_engine
           related_tables]}]
  (let [fqn (model-fully-qualified-name id name)]
    (render-llm-template
     :model
     {:model_id                 (str id)
      :model_name               name
      :model_verified           (boolean verified)
      :model_database_id        (str database_id)
      :model_database_engine    (database-engine-or-unknown database_engine)
      :model_fqn                fqn
      :model_description        description
      :model_fields_xml         (when (seq fields) (str/join "" (map field->xml fields)))
      :model_related_tables_xml (when (seq related_tables)
                                  (str/join "" (map related-table->xml related_tables)))})))

(defn- format-markdown-row
  "Format a sequence of values as a markdown table row."
  [values]
  (str "| " (str/join " | " values) " |"))

(defn- format-rows-table
  "Format query result rows as a markdown table.
   Note: Uses |safe in template, so values must be escaped."
  [columns rows]
  (let [header    (format-markdown-row (map :name columns))
        data-rows (map (fn [row]
                         (format-markdown-row (map #(escape-xml (str %)) row)))
                       rows)]
    (str header "\n" (str/join "\n" data-rows) "\n")))

(defn query-result->xml
  "Format query result for LLM consumption.
   Matches Python QueryResult.llm_representation exactly."
  [{:keys [result_columns rows]}]
  (render-llm-template
   :query_results
   {:result_columns_table (when (seq result_columns)
                            (format-fields-table result_columns
                                                 {:columns {:name         "Field Name"
                                                            :display_name "Display Name"
                                                            :type         "Type"
                                                            :description  "Description"}}))
    :result_rows_table    (when (and (seq rows) (seq result_columns))
                            (format-rows-table result_columns rows))}))

(defn query->xml
  "Format query for LLM consumption.
   Matches Python Query.llm_representation exactly."
  [{:keys [query-type query-id database_id query-content result]}]
  (render-llm-template
   :query
   {:query_type (clojure.core/name (or query-type :unknown))
    :query_id query-id
    :query_database_id (str database_id)
    :query_content query-content
    :query_results_xml (when result (query-result->xml result))}))

(defn visualization->xml
  "Format visualization/chart for LLM consumption.
   Matches Python Visualization.get_llm_representation exactly."
  [{:keys [chart-id queries visualization_settings]}]
  (render-llm-template
   :visualization
   {:visualization_chart_id chart-id
    :visualization_queries_xml (when (seq queries)
                                 (str/join "" (map query->xml queries)))
    :visualization_settings_text (when visualization_settings
                                   (pr-str visualization_settings))}))

(defn chart->xml
  "Format chart for LLM consumption - simplified version.
   For full chart representation, use visualization->xml."
  [{:keys [chart-id query-id chart-type]}]
  (render-llm-template
   :chart
   {:chart_id chart-id
    :chart_query_id query-id
    :chart_type (if chart-type (clojure.core/name chart-type) "table")}))

(defn question->xml
  "Format question for LLM consumption.
   Matches Python Question.llm_representation exactly."
  [{:keys [id name description verified collection visualization]}]
  (render-llm-template
   :question
   {:question_id (str id)
    :question_verified (boolean verified)
    :question_name name
    :question_description description
    :question_collection_xml (when collection (collection->xml collection))
    :question_visualization_xml (when visualization (visualization->xml visualization))}))

(defn- text-card->xml
  "Format a text card for LLM consumption."
  [{:keys [id order width height text]}]
  (render-llm-template
   :text_card
   {:text_card_id (str id)
    :text_card_order (str order)
    :text_card_width (str width)
    :text_card_height (str height)
    :text_card_text text}))

(defn- viz-card->xml
  "Format a viz card for LLM consumption."
  [{:keys [id order width height title description chart]}]
  (render-llm-template
   :viz_card
   {:viz_card_id (str id)
    :viz_card_order (str order)
    :viz_card_width (str width)
    :viz_card_height (str height)
    :viz_card_title title
    :viz_card_description description
    :viz_card_chart_xml (when chart (visualization->xml chart))}))

(defn- dashcard->xml
  "Format a dashboard card for LLM consumption."
  [card]
  (case (:type card)
    "text" (text-card->xml card)
    :text (text-card->xml card)
    "chart" (viz-card->xml card)
    :chart (viz-card->xml card)
    ;; Default to viz card
    (viz-card->xml card)))

(defn dashboard->xml
  "Format dashboard for LLM consumption.
   Matches Python Dashboard.llm_representation exactly."
  [{:keys [id name description verified collection dashcards]}]
  ;; Group cards by tab and sort
  (let [tabs (group-by :dashboard_tab_id dashcards)
        sorted-tabs (sort-by first tabs)
        tabs-xml (when (seq dashcards)
                   (str "  <tabs>\n"
                        (str/join ""
                                  (map (fn [[tab-id cards]]
                                         (let [sorted-cards (sort-by (juxt :row :col) cards)]
                                           (str "    <tab id=\"" tab-id "\">\n"
                                                "      <content>\n"
                                                (str/join ""
                                                          (map #(str "        " (dashcard->xml %) "\n")
                                                               sorted-cards))
                                                "      </content>\n"
                                                "    </tab>\n")))
                                       sorted-tabs))
                        "  </tabs>\n"))]
    (render-llm-template
     :dashboard
     {:dashboard_id (str id)
      :dashboard_verified (boolean verified)
      :dashboard_name name
      :dashboard_description description
      :dashboard_collection_xml (when collection (collection->xml collection))
      :dashboard_tabs_xml tabs-xml})))

(defn database-schema->xml
  "Format database schema for LLM consumption."
  [{:keys [name description]}]
  (render-llm-template
   :database_schema
   {:database_schema_name name
    :database_schema_description description}))

(defn database->xml
  "Format database for LLM consumption.
   Matches Python Database.llm_representation exactly."
  [{:keys [id name description schemas]}]
  (render-llm-template
   :database
   {:database_id (str id)
    :database_name name
    :database_description description
    :database_schemas_xml (when (seq schemas)
                            (str/join "" (map database-schema->xml schemas)))}))

(defn user->xml
  "Format user for LLM consumption.
   Matches Python DummyGetCurrentUserResultSchema.llm_representation exactly.
   Note: Glossary rows are used with |safe, so we must escape manually."
  [{:keys [id name email glossary]}]
  (let [glossary-rows (when (seq glossary)
                        (str/join "\n"
                                  (map (fn [[term definition]]
                                         (str "| " (escape-xml term) " | " (escape-xml definition) " |"))
                                       glossary)))]
    (render-llm-template
     :user
     {:user_name name
      :user_id (str id)
      :user_email email
      :user_glossary_rows glossary-rows})))

(defn- search-result-tag-name
  "Get the XML tag name for a search result type.
   Maps to Python naming conventions."
  [result-type]
  (case result-type
    :metric "metric"
    :table "table"
    :model "metabase-model"
    :dataset "metabase-model"
    :card "metabase_question"
    :question "metabase_question"
    :dashboard "dashboard"
    :database "database"
    :transform "transform"
    (if result-type
      (clojure.core/name result-type)
      "item")))

(defn search-result->xml
  "Format a single search result as XML element."
  [{:keys [id type name description verified collection]}]
  (render-llm-template
   :search_result
   {:search_tag_name (search-result-tag-name type)
    :search_id (str id)
    :search_name name
    :search_has_verified (some? verified)
    :search_verified verified
    :search_description description
    :search_collection_name (:name collection)}))

(defn search-results->xml
  "Format search results as XML wrapped in search-results element."
  [results]
  (render-llm-template
   :search_results
   {:search_results_xml (str/join "\n" (map search-result->xml results))}))

(defn field-values-metadata->xml
  "Format field values metadata for LLM consumption.
   Matches Python FieldValuesMetadata.llm_representation exactly.
   Note: Tables are used with |safe, so we must escape manually."
  [{:keys [field_values statistics]}]
  (let [sample-values (seq field_values)
        sample-values-table (when sample-values
                              (str "| Value |\n"
                                   "|---|\n"
                                   (str/join "\n"
                                             (map #(str "| " (escape-xml (str %)) " |") field_values))
                                   "\n"))
        stats-map (into {} (filter (fn [[_ v]] (some? v)) statistics))
        stats-table (when (seq stats-map)
                      (str "| statistic | value |\n"
                           "|---|---|\n"
                           (str/join "\n"
                                     (map (fn [[k v]]
                                            (str "| " (clojure.core/name k) " | " v " |"))
                                          stats-map))
                           "\n"))]
    (render-llm-template
     :field_values_metadata
     {:sample_values_table sample-values-table
      :stats_table stats-table})))

(defn field-metadata->xml
  "Format field metadata for LLM consumption.
   Matches Python GetFieldMetadataResultSchema.llm_representation exactly."
  [{:keys [field_id value_metadata]}]
  (render-llm-template
   :field_metadata
   {:field_metadata_field_id field_id
    :field_metadata_value_xml (when value_metadata
                                (field-values-metadata->xml value_metadata))}))

(defn get-metadata-result->xml
  "Format get_metadata result for LLM consumption.
   Matches Python GetMetadataResultSchema.llm_representation exactly."
  [{:keys [metrics tables models errors]}]
  (let [metadata-metrics (when (seq metrics)
                           (str "<metrics>\n"
                                (str/join "\n" (map metric->xml metrics))
                                "\n</metrics>\n"))
        metadata-tables (when (seq tables)
                          (str "<tables>\n"
                               (str/join "\n" (map table->xml tables))
                               "\n</tables>\n"))
        metadata-models (when (seq models)
                          (str "<metabase-models>\n"
                               (str/join "\n" (map model->xml models))
                               "\n</metabase-models>\n"))]
    (render-llm-template
     :get_metadata_result
     {:metadata_has_any (boolean (or metadata-metrics metadata-tables metadata-models))
      :metadata_metrics_xml metadata-metrics
      :metadata_tables_xml metadata-tables
      :metadata_models_xml metadata-models
      :metadata_errors (when (seq errors) (str/join "\n" errors))})))

(def formatters
  {:metric     metric->xml
   :table      table->xml
   :model      model->xml
   :question   question->xml
   :dashboard  dashboard->xml
   :database   database->xml
   :user       user->xml
   :query      query->xml
   :collection collection->xml})

(defn entity->xml
  "Dispatch to appropriate XML formatter based on entity type."
  [entity]
  (if-let [formatter (get formatters (:type entity))]
    (formatter entity)
    (do
      (log/warn "Unknown entity type" {:type (:type entity)})
      (pr-str entity))))
