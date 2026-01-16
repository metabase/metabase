(ns metabase-enterprise.metabot-v3.tools.llm-representations
  "LLM representation utilities for formatting entities as XML.
   Matches Python AI Service patterns exactly for consistency."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]))

(defn- escape-xml
  "Escape XML special characters in a string."
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

(defn field->xml
  "Format a field/column as XML element.
   Matches Python Column.llm_representation exactly."
  [{:keys [field_id name display_name base-type database_type description]}]
  (let [display-name-or-name (or display_name name)]
    (str "<field id=\"" (escape-xml field_id)
         "\" name=\"\\\"" (escape-xml name) "\\\"\""
         " display_name=\"" (escape-xml display-name-or-name) "\""
         " type=\"" (escape-xml (when base-type (clojure.core/name base-type))) "\""
         " database_type=\"" (escape-xml (database-type-or-unknown database_type)) "\">"
         (when description
           (str "\n## Description\n" (escape-xml description)))
         "</field>")))

(defn format-fields-table
  "Format fields as markdown table for LLM.
   Matches Python render_table output format."
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

(defn collection->xml
  "Format collection for LLM consumption.
   Matches Python Collection.llm_representation exactly."
  [{:keys [name description authority_level]}]
  (str "<collection"
       (if name
         (str " name=\"" (escape-xml name) "\"")
         " name=\"Our analytics\"")
       (when authority_level
         (str " authority_level=\"" (escape-xml authority_level) "\""))
       ">"
       (when description
         (str "\n<description>" (escape-xml description) "</description>"))
       "</collection>"))

(defn- related-table->xml
  "Format a related table for LLM consumption."
  [{:keys [id name related_by fully_qualified_name fields]}]
  (str "<related-table"
       (when id (str " id=\"" id "\""))
       " name=\"" (escape-xml name) "\""
       (when related_by (str " related_by=\"" (escape-xml related_by) "\""))
       " fully_qualified_name=\"" (escape-xml fully_qualified_name) "\">"
       (when (seq fields)
         (str/join "" (map field->xml fields)))
       "</related-table>"))

(defn metric->xml
  "Format metric for LLM consumption.
   Matches Python Metric.get_llm_representation exactly."
  [{:keys [id name description verified queryable-dimensions collection
           default_time_dimension_field]}]
  (str "<metric id=\"" id "\", name=\"" (escape-xml name)
       "\" is_verified=\"" (boolean verified) "\">\n"
       (when collection
         (str "\nThe metric is stored in the following collection:\n"
              (collection->xml collection) "\n"))
       (when default_time_dimension_field
         (str "Default Time Dimension Field: " (:name default_time_dimension_field) "\n"))
       "\n### Metric Description\n" (escape-xml description) "\n"
       (when (seq queryable-dimensions)
         (str "### Dimensions\n"
              "The following dimensions can be used for filter- or group-by operations:\n\n"
              (format-fields-table queryable-dimensions)
              "\n\nBefore using any field in comparisons, filters, or conditions, you should check their metadata and sample values first, using the uri `metabase://metric/" id "/dimensions/{field_id}`.\n"
              "This will help avoid errors due to unexpected data types or formats.\n"))
       "</metric>"))

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
    (str "<table id=\"" id "\", name=\"" (escape-xml name)
         "\" database_id=\"" database_id
         "\" database_engine=\"" (database-engine-or-unknown database_engine)
         "\" fully_qualified_name=\"" (escape-xml fqn) "\">\n"
         "\n### Description\n" (escape-xml description) "\n"
         (when (seq fields)
           (str "\n### Fields\n\n"
                "The following fields are available in this table.\n\n"
                (str/join "" (map field->xml fields)) "\n"))
         (when (seq related_tables)
           (str "### Related Tables\n"
                "Foreign key fields from related tables. Usage patterns:\n"
                "- Can be used directly in notebook queries (non-sql) as if they were part of the table.\n"
                "- For SQL queries: Use \"fieldname\" with explicit JOINs\n\n"
                (str/join "" (map related-table->xml related_tables)) "\n"))
         "\nBefore using any field in comparisons, filters, or conditions, you should check their metadata and sample values first, using the uri `metabase://table/" id "/fields/{field_id}`.\n"
         "This will help avoid errors due to unexpected data types or formats.\n"
         "</table>")))

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
    (str "<metabase-model id=\"" id "\" name=\"" (escape-xml name)
         "\" is_verified=\"" (boolean verified)
         "\" database_id=\"" database_id
         "\" database_engine=\"" (database-engine-or-unknown database_engine)
         "\" fully_qualified_name=\"" (escape-xml fqn) "\">\n"
         "\n### Description\n" (escape-xml description) "\n"
         (when (seq fields)
           (str "\n### Fields\n\n"
                "The following fields are available in this model.\n\n"
                (str/join "" (map field->xml fields)) "\n"))
         (when (seq related_tables)
           (str "\n### Related Tables\n"
                "Foreign key fields from related tables. Usage patterns:\n"
                "- Can be used directly in notebook queries (non-sql) as if they were part of the model.\n"
                "- For SQL queries: Use \"fieldname\" with explicit JOINs\n\n"
                (str/join "" (map related-table->xml related_tables)) "\n"))
         "Before using any field in comparisons, filters, or conditions, you should check their metadata and sample values first, using the uri `metabase://model/" id "/fields/{field_id}`.\n"
         "This will help avoid errors due to unexpected data types or formats.\n"
         "</model>")))

(defn query-result->xml
  "Format query result for LLM consumption.
   Matches Python QueryResult.llm_representation exactly."
  [{:keys [result_columns rows]}]
  (str "<query_results>\n"
       (when (seq result_columns)
         (str "### Result Columns\n"
              (format-fields-table result_columns
                                   {:columns {:name "Field Name"
                                              :display_name "Display Name"
                                              :type "Type"
                                              :description "Description"}})
              "\n"))
       (when (seq rows)
         (str "### Result Rows\n"
              "| " (str/join " | " (map :name result_columns)) " |\n"
              (str/join "\n"
                        (map (fn [row]
                               (str "| " (str/join " | " (map #(escape-xml (str %)) row)) " |"))
                             rows))
              "\n"))
       "</query_results>"))

(defn query->xml
  "Format query for LLM consumption.
   Matches Python Query.llm_representation exactly."
  [{:keys [query-type query-id database_id query-content result]}]
  (str "<query type=\"" (clojure.core/name (or query-type :unknown))
       "\" id=\"" query-id "\""
       " database_id=\"" database_id "\">\n"
       (when query-content
         (str query-content "\n"))
       (when result
         (query-result->xml result))
       "</query>"))

(defn visualization->xml
  "Format visualization/chart for LLM consumption.
   Matches Python Visualization.get_llm_representation exactly."
  [{:keys [chart-id queries visualization_settings]}]
  (str "<chart id=\"" chart-id "\">\n"
       "The chart is powered by the following queries:\n"
       (when (seq queries)
         (str/join "" (map query->xml queries)))
       (when visualization_settings
         (str "<visualization>" (pr-str visualization_settings) "</visualization>"))
       "\n</chart>"))

(defn chart->xml
  "Format chart for LLM consumption - simplified version.
   For full chart representation, use visualization->xml."
  [{:keys [chart-id query-id chart-type]}]
  (str "<chart id=\"" chart-id "\""
       " type=\"" (if chart-type (clojure.core/name chart-type) "table") "\""
       " query-id=\"" query-id "\">\n"
       "Chart link: metabase://chart/" chart-id "\n"
       "</chart>"))

(defn question->xml
  "Format question for LLM consumption.
   Matches Python Question.llm_representation exactly."
  [{:keys [id name description verified collection visualization]}]
  (str "<metabase_question id=\"" id "\" is_verified=\"" (boolean verified) "\">\n"
       "<name>" (escape-xml name) "</name>\n"
       (when description
         (str "<description>" (escape-xml description) "</description>\n"))
       (when collection
         (str "The question is stored in the following collection:\n"
              (collection->xml collection) "\n"))
       (when visualization
         (str "The question is visualized as follows:\n"
              (visualization->xml visualization) "\n"))
       "</metabase_question>"))

(defn- text-card->xml
  "Format a text card for LLM consumption."
  [{:keys [id order width height text]}]
  (str "<text_card id=\"" id "\" order=\"" order
       "\" width=\"" width "\" height=\"" height "\">\n"
       (escape-xml text) "\n"
       "</text_card>"))

(defn- viz-card->xml
  "Format a viz card for LLM consumption."
  [{:keys [id order width height title description chart]}]
  (str "<viz_card id=\"" id "\" order=\"" order
       "\" width=\"" width "\" height=\"" height "\">\n"
       (when title
         (str "<title>" (escape-xml title) "</title>\n"))
       (when description
         (str "<description>" (escape-xml description) "</description>\n"))
       (when chart
         (visualization->xml chart))
       "</viz_card>"))

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
        sorted-tabs (sort-by first tabs)]
    (str "<dashboard id=\"" id "\" is_verified=\"" (boolean verified) "\">\n"
         "  <name>" (escape-xml name) "</name>\n"
         (when description
           (str "  <description>" (escape-xml description) "</description>\n"))
         (when collection
           (str "  The dashboard is stored in the following collection:\n"
                "  " (collection->xml collection) "\n"))
         (when (seq dashcards)
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
                "  </tabs>\n"))
         "</dashboard>")))

(defn database-schema->xml
  "Format database schema for LLM consumption."
  [{:keys [name description]}]
  (str "<database_schema name='" (escape-xml name) "'>"
       (or description "") "</database_schema>"))

(defn database->xml
  "Format database for LLM consumption.
   Matches Python Database.llm_representation exactly."
  [{:keys [id name description schemas]}]
  (str "<database id=\"" id "\" name=\"" (escape-xml name) "\">\n"
       (when description
         (str "<description>" (escape-xml description) "</description>\n"))
       (when (seq schemas)
         (str "<schemas>\n"
              (str/join "" (map database-schema->xml schemas))
              "</schemas>\n"))
       "</database>"))

(defn user->xml
  "Format user for LLM consumption.
   Matches Python DummyGetCurrentUserResultSchema.llm_representation exactly."
  [{:keys [id name email glossary]}]
  (str "<user>\n\n"
       "### User Info\n"
       "- Name: " (escape-xml name) "\n"
       "- User ID: " id "\n"
       "- Email: " (escape-xml email) "\n"
       (when (seq glossary)
         (str "\n### Glossary Terms\n"
              "The user's company has the following glossary terms defined in Metabase. Use these to understand specific terminology\n"
              "or jargon that may be relevant to the user's questions.\n"
              "| term | definition |\n"
              "|---|---|\n"
              (str/join "\n"
                        (map (fn [[term definition]]
                               (str "| " (escape-xml term) " | " (escape-xml definition) " |"))
                             glossary))
              "\n"))
       "\n</user>"))

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
  (let [tag-name (search-result-tag-name type)]
    (str "<" tag-name " id=\"" id "\" name=\"" (escape-xml name) "\""
         (when (some? verified) (str " is_verified=\"" verified "\""))
         ">\n"
         (when description
           (str (escape-xml description) "\n"))
         (when (and collection (:name collection))
           (str "Collection: " (escape-xml (:name collection)) "\n"))
         "</" tag-name ">")))

(defn search-results->xml
  "Format search results as XML wrapped in search-results element."
  [results]
  (str "Here are the search results:\n"
       "<search-results>\n"
       (str/join "\n" (map search-result->xml results))
       "\n</search-results>"))

(defn field-values-metadata->xml
  "Format field values metadata for LLM consumption.
   Matches Python FieldValuesMetadata.llm_representation exactly."
  [{:keys [field_values statistics]}]
  (str (if (seq field_values)
         (str "**Sample Values (for understanding format pattern)**\n"
              "The following sample values show the data format in this field. The actual dataset may contain\n"
              "other values following the same pattern:\n\n"
              "| Value |\n"
              "|---|\n"
              (str/join "\n" (map #(str "| " (escape-xml (str %)) " |") field_values))
              "\n")
         (str "**Sample Values**\n"
              "This field hasn't been sampled yet. Continue without samples.\n"))
       (when statistics
         (let [stats-map (into {} (filter (fn [[_ v]] (some? v)) statistics))]
           (when (seq stats-map)
             (str "\n**Field Statistics (SAMPLE-BASED)**\n\n"
                  "The following statistics are based on a df.sample(n) of the data.\n"
                  "They provide a rough idea of the data characteristics but may not reflect the complete dataset:\n\n"
                  "| statistic | value |\n"
                  "|---|---|\n"
                  (str/join "\n"
                            (map (fn [[k v]]
                                   (str "| " (clojure.core/name k) " | " v " |"))
                                 stats-map))
                  "\n"))))))

(defn field-metadata->xml
  "Format field metadata for LLM consumption.
   Matches Python GetFieldMetadataResultSchema.llm_representation exactly."
  [{:keys [field_id value_metadata]}]
  (if-not value_metadata
    (str "No metadata available to display. This doesn't mean the column is empty or cannot be queried - "
         "there may be various reasons why values aren't shown here.")
    (str "<field-metadata field_id=\"" (escape-xml field_id) "\">\n"
         "    " (field-values-metadata->xml value_metadata) "\n"
         "</field-metadata>")))

(defn get-metadata-result->xml
  "Format get_metadata result for LLM consumption.
   Matches Python GetMetadataResultSchema.llm_representation exactly."
  [{:keys [metrics tables models errors]}]
  (let [has-metadata (or (seq metrics) (seq tables) (seq models))]
    (if-not has-metadata
      (let [no-metadata-msg "No metadata was returned for the requested tables, models, or metrics."]
        (if (seq errors)
          (str no-metadata-msg "\n\n<errors>\nThe following errors were encountered while fetching metadata:\n"
               (str/join "\n" errors) "\n</errors>")
          no-metadata-msg))
      (str (when (seq metrics)
             (str "<metrics>\n"
                  (str/join "\n" (map metric->xml metrics))
                  "\n</metrics>\n"))
           (when (seq tables)
             (str "<tables>\n"
                  (str/join "\n" (map table->xml tables))
                  "\n</tables>\n"))
           (when (seq models)
             (str "<metabase-models>\n"
                  (str/join "\n" (map model->xml models))
                  "\n</metabase-models>\n"))
           (when (seq errors)
             (str "<errors>\nThe following errors were encountered while fetching metadata:\n"
                  (str/join "\n" errors)
                  "\n</errors>\n"))))))

(defn entity->xml
  "Dispatch to appropriate XML formatter based on entity type."
  [{:keys [type] :as entity}]
  (case type
    :metric (metric->xml entity)
    :table (table->xml entity)
    :model (model->xml entity)
    :question (question->xml entity)
    :dashboard (dashboard->xml entity)
    :database (database->xml entity)
    :user (user->xml entity)
    :query (query->xml entity)
    :collection (collection->xml entity)
    ;; Fallback for unknown types
    (pr-str entity)))
