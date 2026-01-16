(ns metabase-enterprise.metabot-v3.tools.llm-representations
  "LLM representation utilities for formatting entities as XML.
   Matches Python AI Service patterns for consistency."
  (:require
   [clojure.string :as str]))

(defn- escape-xml
  "Escape XML special characters in a string."
  [s]
  (when s
    (-> (str s)
        (str/replace "&" "&amp;")
        (str/replace "<" "&lt;")
        (str/replace ">" "&gt;")
        (str/replace "\"" "&quot;"))))

(defn field->xml
  "Format a field/column as XML element."
  [{:keys [field_id name display_name base-type description]}]
  (str "<field id=\"" (escape-xml field_id)
       "\" name=\"" (escape-xml name) "\""
       (when display_name (str " display_name=\"" (escape-xml display_name) "\""))
       (when base-type (str " type=\"" (escape-xml (clojure.core/name base-type)) "\""))
       ">"
       (when description (str "\n" (escape-xml description)))
       "</field>"))

(defn format-fields-table
  "Format fields as markdown table for LLM."
  [fields]
  (when (seq fields)
    (str "| Field Name | Field ID | Type | Description |\n"
         "|------------|----------|------|-------------|\n"
         (str/join "\n"
                   (map #(format "| %s | %s | %s | %s |"
                                 (escape-xml (or (:name %) ""))
                                 (escape-xml (or (:field_id %) ""))
                                 (escape-xml (if-let [t (:base-type %)]
                                               (clojure.core/name t)
                                               ""))
                                 (escape-xml (or (:description %) "")))
                        fields)))))

(defn metric->xml
  "Format metric for LLM consumption."
  [{:keys [id name description verified queryable-dimensions]}]
  (str "<metric id=\"" id "\" name=\"" (escape-xml name)
       "\" is_verified=\"" (boolean verified) "\">\n"
       (when description
         (str "### Metric Description\n" (escape-xml description) "\n"))
       (when (seq queryable-dimensions)
         (str "### Dimensions\n"
              "The following dimensions can be used for filter or group-by operations:\n"
              (format-fields-table queryable-dimensions) "\n"))
       "</metric>"))

(defn table->xml
  "Format table for LLM consumption."
  [{:keys [id name display_name database_id database_schema description fields]}]
  (str "<table id=\"" id "\" name=\"" (escape-xml name) "\""
       " database_id=\"" database_id "\""
       (when database_schema (str " schema=\"" (escape-xml database_schema) "\""))
       ">\n"
       (when display_name
         (str "Display name: " (escape-xml display_name) "\n"))
       (when description
         (str "### Description\n" (escape-xml description) "\n"))
       (when (seq fields)
         (str "### Fields\n" (format-fields-table fields) "\n"))
       "</table>"))

(defn model->xml
  "Format model for LLM consumption."
  [{:keys [id name description verified fields]}]
  (str "<model id=\"" id "\" name=\"" (escape-xml name)
       "\" is_verified=\"" (boolean verified) "\">\n"
       (when description
         (str "### Description\n" (escape-xml description) "\n"))
       (when (seq fields)
         (str "### Fields\n" (format-fields-table fields) "\n"))
       "</model>"))

(defn query->xml
  "Format query result for LLM consumption."
  [{:keys [type query-id result-columns]}]
  (str "<query type=\"" (clojure.core/name (or type :query)) "\" id=\"" query-id "\">\n"
       (when (seq result-columns)
         (str "Result columns:\n"
              (str/join "\n"
                        (map #(str "- " (:name %)
                                   " (id: " (:field_id %)
                                   ", type: " (when-let [t (:base-type %)]
                                                (clojure.core/name t)) ")")
                             result-columns))
              "\n"))
       "</query>"))

(defn chart->xml
  "Format chart for LLM consumption."
  [{:keys [chart-id query-id chart-type]}]
  (str "<chart id=\"" chart-id "\""
       " type=\"" (if chart-type (clojure.core/name chart-type) "table") "\""
       " query-id=\"" query-id "\">\n"
       "Chart link: metabase://chart/" chart-id "\n"
       "</chart>"))

(defn- search-result-tag-name
  "Get the XML tag name for a search result type."
  [result-type]
  (case result-type
    :metric "metric"
    :table "table"
    :model "model"
    :dataset "model"
    :card "question"
    :question "question"
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

(defn entity->xml
  "Dispatch to appropriate XML formatter based on entity type."
  [{:keys [type] :as entity}]
  (case type
    :metric (metric->xml entity)
    :table (table->xml entity)
    :model (model->xml entity)
    :question (model->xml entity) ; Questions use similar format to models
    :query (query->xml entity)
    ;; Fallback for unknown types
    (pr-str entity)))
