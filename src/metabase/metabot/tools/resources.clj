(ns metabase.metabot.tools.resources
  "Tool for reading Metabase resources via URI patterns.

  Implements 'Context Engineering with Links' pattern where URIs serve as lightweight,
  token-efficient references to resources that can be fetched on-demand at the
  appropriate level of detail.

  Supported URI patterns:
  - metabase://table/{id} - Basic table info
  - metabase://table/{id}/fields - Table with fields
  - metabase://table/{id}/fields/{field_id} - Specific field details
  - metabase://model/{id} - Basic model info
  - metabase://model/{id}/fields - Model with fields
  - metabase://model/{id}/fields/{field_id} - Specific field details
  - metabase://metric/{id} - Basic metric info
  - metabase://metric/{id}/dimensions - Metric with dimensions
  - metabase://metric/{id}/dimensions/{dimension_id} - Specific dimension details
  - metabase://transform/{id} - Transform details
  - metabase://dashboard/{id} - Dashboard details"
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private max-concurrent-uris
  "Maximum number of URIs that can be fetched in a single call."
  5)

(defn- parse-uri
  "Parse a metabase:// URI into components.

  Returns a map with:
  - :resource-type - The type (table, model, metric, etc.)
  - :resource-id - The ID of the resource
  - :sub-resource - Optional sub-resource type (fields, dimensions)
  - :sub-resource-id - Optional sub-resource ID"
  [uri]
  (when-not (str/starts-with? uri "metabase://")
    (throw (ex-info (str "Invalid URI scheme. Expected 'metabase://' but got: " uri)
                    {:uri uri})))

  (let [path (subs uri 11) ; Remove "metabase://"
        parts (str/split path #"/")
        parts (remove str/blank? parts)]

    (when (< (count parts) 2)
      (throw (ex-info
              (str "Invalid URI format: " uri ". "
                   "Expected: metabase://{type}/{id}[/{sub_resource}[/{sub_resource_id}]]")
              {:uri uri :parts parts})))

    {:resource-type (first parts)
     :resource-id (second parts)
     :sub-resource (nth parts 2 nil)
     :sub-resource-id (when (> (count parts) 3)
                        ;; Handle field IDs with slashes (e.g., c75/17)
                        (str/join "/" (drop 3 parts)))}))

(defn- fetch-table-resource
  "Fetch table resource based on URI components."
  [{:keys [resource-id sub-resource sub-resource-id]}]
  (let [table-id (parse-long resource-id)]
    (cond
      ;; metabase://table/123/fields/FIELD_ID
      (and (= sub-resource "fields") sub-resource-id)
      (field-stats/field-values {:entity-type "table"
                                 :entity-id table-id
                                 :field-id sub-resource-id
                                 :limit 30})

      ;; metabase://table/123/fields
      (= sub-resource "fields")
      (entity-details/get-table-details {:entity-type :table
                                         :entity-id table-id
                                         :with-fields? true
                                         :with-field-values? false
                                         :with-related-tables? false
                                         :with-measures? true
                                         :with-segments? true})

      ;; metabase://table/123
      (nil? sub-resource)
      (entity-details/get-table-details {:entity-type :table
                                         :entity-id table-id
                                         :with-fields? false
                                         :with-field-values? false
                                         :with-related-tables? false
                                         :with-measures? true
                                         :with-segments? true})

      :else
      (throw (ex-info (str "Unsupported sub-resource '" sub-resource "' for table. Supported: fields")
                      {:resource-id resource-id :sub-resource sub-resource})))))

(defn- fetch-model-or-card-resource
  "Fetch model resource based on URI components."
  [{:keys [resource-id resource-type sub-resource sub-resource-id]}]
  (let [resource-id* (parse-long resource-id)
        resource-type* (keyword resource-type)]
    (assert (#{:question :model} resource-type*))
    (cond
      ;; metabase://<model,question>/123/fields/FIELD_ID
      (and (= sub-resource "fields") sub-resource-id)
      ;; field-values takes type as string and id as integer
      (field-stats/field-values {:entity-type resource-type
                                 :entity-id resource-id*
                                 :field-id sub-resource-id
                                 :limit 30})

      ;; metabase://<model,question>/123/fields
      (= sub-resource "fields")
      ;; get-table-details takes type as kw and id as integer
      (entity-details/get-table-details {:entity-type resource-type*
                                         :entity-id resource-id*
                                         :with-fields? true
                                         :with-field-values? false
                                         :with-related-tables? false
                                         :with-measures? true
                                         :with-segments? true})

      ;; metabase://<model,question>/123
      (nil? sub-resource)
      (entity-details/get-table-details {:entity-type resource-type*
                                         :entity-id resource-id*
                                         :with-fields? false
                                         :with-field-values? false
                                         :with-related-tables? false
                                         :with-measures? true
                                         :with-segments? true})

      :else
      (throw (ex-info (str "Unsupported sub-resource '" sub-resource "' for model. Supported: fields")
                      {:resource-id resource-id :sub-resource sub-resource})))))

(defn- fetch-metric-resource
  "Fetch metric resource based on URI components."
  [{:keys [resource-id sub-resource sub-resource-id]}]
  (let [metric-id (parse-long resource-id)]
    (cond
      ;; metabase://metric/123/dimensions/DIMENSION_ID
      (and (= sub-resource "dimensions") sub-resource-id)
      (field-stats/field-values {:entity-type "metric"
                                 :entity-id metric-id
                                 :field-id sub-resource-id
                                 :limit 30})

      ;; metabase://metric/123/dimensions
      (= sub-resource "dimensions")
      (entity-details/get-metric-details {:metric-id metric-id
                                          :with-queryable-dimensions true
                                          :with-field-values false})

      ;; metabase://metric/123
      (nil? sub-resource)
      (entity-details/get-metric-details {:metric-id metric-id
                                          :with-queryable-dimensions false
                                          :with-field-values false})

      :else
      (throw (ex-info (str "Unsupported sub-resource '" sub-resource "' for metric. Supported: dimensions")
                      {:resource-id resource-id :sub-resource sub-resource})))))

(defn- fetch-transform-resource
  "Fetch transform resource."
  [{:keys [resource-id sub-resource]}]
  (when sub-resource
    (throw (ex-info (str "Transforms do not support sub-resources. Got: " sub-resource)
                    {:resource-id resource-id :sub-resource sub-resource})))
  {:structured-output (-> (transforms/get-transform (parse-long resource-id))
                          (assoc :result-type :entity :type :transform))})

(defn- fetch-dashboard-resource
  "Fetch dashboard resource."
  [{:keys [resource-id sub-resource]}]
  (when sub-resource
    (throw (ex-info (str "Dashboards do not support sub-resources. Got: " sub-resource)
                    {:resource-id resource-id :sub-resource sub-resource})))
  (let [result (entity-details/get-dashboard-details {:dashboard-id (parse-long resource-id)})]
    (if-let [dashboard (:structured-output result)]
      {:structured-output (assoc dashboard :result-type :entity)}
      {:status-code 404 :output (:output result)})))

(def ^:private resource-handlers
  "Map of resource type to handler function."
  {"table"     fetch-table-resource
   "model"     fetch-model-or-card-resource
   "question"  fetch-model-or-card-resource
   "metric"    fetch-metric-resource
   "transform" fetch-transform-resource
   "dashboard" fetch-dashboard-resource})

(defn- fetch-single-uri
  "Fetch a single URI and return formatted content.

  Returns a map with either:
  - {:uri uri :content result}
  - {:uri uri :error error-message}"
  [uri]
  (try
    (let [parsed (parse-uri uri)
          {:keys [resource-type]} parsed
          handler (get resource-handlers resource-type)]

      (when-not handler
        (throw (ex-info (str "Unknown resource type '" resource-type "'. "
                             "Supported: " (str/join ", " (keys resource-handlers)))
                        {:resource-type resource-type :supported (keys resource-handlers)})))

      (let [result (handler parsed)]
        (if (:status-code result)
          {:uri uri :error (or (:output result) result)}
          {:uri uri :content result})))
    (catch Exception e
      (log/warn "Error fetching resource" {:uri uri :error (ex-message e)})
      {:uri uri :error (or (ex-message e) "Unknown error")})))

(defn- format-with-instructions
  "Wrap content in `<result>` / `<instructions>` tags."
  [content instruction-text]
  (str "<result>\n" content "\n</result>\n"
       "<instructions>\n" instruction-text "\n</instructions>"))

(defn- format-content
  "Format a tool result as an LLM-ready string.
   Dispatches to the right llm-rep formatter based on :result-type.
   Returns the :output string directly for error results (404s etc.)."
  [content]
  (if-let [structured (:structured-output content)]
    (case (:result-type structured)
      ;; NOTE: keep in sync with agent/tools/metadata.clj/format-field-metadata-output
      :field-metadata (format-with-instructions
                       (llm-rep/field-metadata->xml structured)
                       instructions/field-metadata-instructions)
      :entity         (llm-rep/entity->xml structured)
      ;; fallback — should not happen, but better than EDN
      (llm-rep/entity->xml structured))
    ;; error case — :output is already a string
    (:formatted content)))

(defn- format-resources
  "Format resources for LLM output."
  [resources]
  (str "<resources>\n"
       (str/join "\n"
                 (for [{:keys [uri content error]} resources]
                   (str "<resource uri=\"" uri "\">"
                        (if content
                          (str "\n" (format-content content) "\n")
                          (str "\n**Error:** " error "\n"))
                        "</resource>")))
       "\n</resources>"))

(defn read-resource
  "Read one or more Metabase resources via URI patterns.

  Parameters:
  - uris: List of metabase:// URIs to fetch (max 5)

  Returns a map with formatted resources or error details."
  [{:keys [uris]}]
  (log/info "Reading resources" {:uri-count (count uris)})

  ;; Validate URI count
  (when (> (count uris) max-concurrent-uris)
    (throw (ex-info
            (str "Too many URIs provided (" (count uris) "). "
                 "Please limit to " max-concurrent-uris " URIs maximum. "
                 "Be more selective and focus on the most relevant items for the current task or fetch them in batches.")
            {:uri-count (count uris) :max max-concurrent-uris})))

  ;; Fetch all URIs (sequentially for now, could parallelize with pmap)
  (let [resources (mapv fetch-single-uri uris)
        formatted (format-resources resources)]

    (log/info "Fetched resources" {:total      (count resources)
                                   :successful (count (filter :content resources))
                                   :errors     (count (filter :error resources))})

    {:resources resources
     :output formatted}))

(mu/defn ^{:tool-name "read_resource"}
  read-resource-tool
  "Read detailed information about Metabase resources via URI patterns.

  Supports fetching multiple resources in parallel using metabase:// URIs:
  - metabase://table/{id}/fields - Get table structure with fields
  - metabase://model/{id}/fields/{field_id} - Get specific field details
  - metabase://metric/{id}/dimensions - Get metric dimensions
  - metabase://transform/{id} - Get transform details
  - metabase://dashboard/{id} - Get dashboard details"
  [{:keys [uris]} :- [:map {:closed true}
                      [:uris [:sequential [:string {:description "Metabase resource URIs to fetch"}]]]]]
  (try
    (read-resource {:uris uris})
    (catch Exception e
      (log/error e "Error in read_resource tool")
      {:output (str "Failed to read resources: " (or (ex-message e) "Unknown error"))})))
