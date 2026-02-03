(ns metabase-enterprise.metabot-v3.tools.read-resource
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
   [metabase-enterprise.metabot-v3.tools.entity-details :as entity-details]
   [metabase-enterprise.metabot-v3.tools.field-stats :as field-stats]
   [metabase.util.log :as log]))

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
                                 :limit nil})

      ;; metabase://table/123/fields
      (= sub-resource "fields")
      (entity-details/get-table-details {:table-id table-id
                                         :with-fields true
                                         :with-field-values false
                                         :with-related-tables false})

      ;; metabase://table/123
      (nil? sub-resource)
      (entity-details/get-table-details {:table-id table-id
                                         :with-fields false
                                         :with-field-values false
                                         :with-related-tables false})

      :else
      (throw (ex-info (str "Unsupported sub-resource '" sub-resource "' for table. Supported: fields")
                      {:resource-id resource-id :sub-resource sub-resource})))))

(defn- fetch-model-resource
  "Fetch model resource based on URI components."
  [{:keys [resource-id sub-resource sub-resource-id]}]
  (let [model-id (parse-long resource-id)]
    (cond
      ;; metabase://model/123/fields/FIELD_ID
      (and (= sub-resource "fields") sub-resource-id)
      (field-stats/field-values {:entity-type "model"
                                 :entity-id model-id
                                 :field-id sub-resource-id
                                 :limit nil})

      ;; metabase://model/123/fields
      (= sub-resource "fields")
      (entity-details/get-table-details {:model-id model-id
                                         :with-fields true
                                         :with-field-values false
                                         :with-related-tables false})

      ;; metabase://model/123
      (nil? sub-resource)
      (entity-details/get-table-details {:model-id model-id
                                         :with-fields false
                                         :with-field-values false
                                         :with-related-tables false})

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
                                 :limit nil})

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

  ;; TODO: implement get-transform-details
  (throw (ex-info "Transform resource fetching not yet implemented"
                  {:resource-id resource-id})))

(defn- fetch-dashboard-resource
  "Fetch dashboard resource."
  [{:keys [resource-id sub-resource]}]
  (when sub-resource
    (throw (ex-info (str "Dashboards do not support sub-resources. Got: " sub-resource)
                    {:resource-id resource-id :sub-resource sub-resource})))

  ;; TODO: implement get-dashboard-details
  (throw (ex-info "Dashboard resource fetching not yet implemented"
                  {:resource-id resource-id})))

(def ^:private resource-handlers
  "Map of resource type to handler function."
  {"table"     fetch-table-resource
   "model"     fetch-model-resource
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
        (if (= (:status-code result) 404)
          {:error (:output result) :status-code (:status-code result)}
          {:uri uri :content result})))
    (catch Exception e
      (log/error e "Error fetching resource" {:uri uri})
      {:uri uri :error (or (ex-message e) "Unknown error")})))

(defn- format-resources
  "Format resources for LLM output."
  [resources]
  (str "<resources>\n"
       (str/join "\n"
                 (for [{:keys [uri content error]} resources]
                   (str "<resource uri=\"" uri "\">"
                        (if content
                          (str "\n" content "\n")
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

    (log/info "Fetched resources" {:total (count resources)
                                   :successful (count (filter :content resources))
                                   :errors (count (filter :error resources))})

    {:resources resources
     :formatted formatted}))
