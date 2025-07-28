(ns metabase-enterprise.metabot-v3.tools.table-view-config
  "Generate table view configurations using OpenAI API"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.channel.template.core :as template]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(defn- get-openai-api-key
  "Get OpenAI API key from environment variable"
  []
  (or (System/getenv "OPENAI_API_KEY")
      (throw (ex-info (i18n/tru "OpenAI API key not configured")
                      {:error-type :configuration-error}))))

(defn- fetch-table-fields
  "Fetch fields for a given table"
  [table-id]
  (let [fields (t2/select :model/Field
                          :table_id table-id
                          :active true
                          {:order-by [[:position :asc]]})]
    (map (fn [field]
           {:id           (:id field)
            :name         (:name field)
            :display_name (:display_name field)
            :type          (name (:base_type field))
            :semantic_type (when (:semantic_type field)
                             (name (:semantic_type field)))
            :description   (:description field)})
         fields)))

(defn- build-prompt
  "Build prompt for OpenAI based on view type and fields using handlebars template"
  [view-type fields table-name]
  (let [view-type-str (name view-type)
        fields-json   (json/generate-string fields)
        template-data {:viewType   view-type-str
                       :tableName  table-name
                       :fieldsJson fields-json}]
    (template/render "metabase_enterprise/metabot_v3/tools/table_view_config_prompt.hbs" template-data)))

(def ^:private response-schemas
  "JSON schemas for structured output by view type"
  {:listing
   {:type "object"
    :additionalProperties false
    :properties
    {:list_view
     {:type "object"
      :additionalProperties false
      :properties
      {:row_height {:type "string"
                    :enum ["thin" "normal"]}
       :fields {:type "array"
                :items {:type "object"
                        :additionalProperties false
                        :properties {:field_id {:type "integer"}
                                     :style {:type "string"
                                             :enum ["normal" "bold" "dim"]}}
                        :required ["field_id" "style"]}}}
      :required ["row_height" "fields"]}}
    :required ["list_view"]}

   :detail
   {:type "object"
    :additionalProperties false
    :properties
    {:object_view
     {:type "object"
      :additionalProperties false
      :properties
      {:sections {:type "array"
                  :items {:type "object"
                          :additionalProperties false
                          :properties {:id {:type "integer"}
                                       :title {:type "string"}
                                       :direction {:type "string"
                                                   :enum ["horizontal" "vertical"]}
                                       :fields {:type "array"
                                                :items {:type "object"
                                                        :additionalProperties false
                                                        :properties {:field_id {:type "integer"}
                                                                     :style {:type "string"
                                                                             :enum ["normal" "bold" "dim" "title"]}}
                                                        :required ["field_id" "style"]}}}
                          :required ["id" "title" "direction" "fields"]}}}
      :required ["sections"]}}
    :required ["object_view"]}

   :gallery
   {:type "object"
    :additionalProperties false
    :properties
    {:object_view
     {:type "object"
      :additionalProperties false
      :properties
      {:sections {:type "array"
                  :items {:type "object"
                          :additionalProperties false
                          :properties {:id {:type "integer"}
                                       :title {:type "string"}
                                       :direction {:type "string"
                                                   :enum ["horizontal" "vertical"]}
                                       :fields {:type "array"
                                                :items {:type "object"
                                                        :additionalProperties false
                                                        :properties {:field_id {:type "integer"}
                                                                     :style {:type "string"
                                                                             :enum ["normal" "bold" "dim" "title"]}}
                                                        :required ["field_id" "style"]}}}
                          :required ["id" "title" "direction" "fields"]}}}
      :required ["sections"]}}
    :required ["object_view"]}})

(defn- call-openai-api
  "Call OpenAI API to generate configuration using structured outputs"
  [prompt view-type]
  (let [api-key         (get-openai-api-key)
        response-schema (get response-schemas view-type)
        response        (http/post "https://api.openai.com/v1/chat/completions"
                                   {:headers {"Authorization" (str "Bearer " api-key)
                                              "Content-Type" "application/json"}
                                    :body (json/generate-string
                                           {:model "gpt-4o-mini"
                                            :messages [{:role "system"
                                                        :content "You are a UI configuration expert. Generate optimal view configurations based on field metadata."}
                                                       {:role "user"
                                                        :content prompt}]
                                            :response_format {:type "json_schema"
                                                              :json_schema {:name (str (name view-type) "_config")
                                                                            :schema response-schema
                                                                            :strict true}}
                                            :temperature 0.3
                                            :max_tokens 1000})
                                    :throw-exceptions false})]

    (if (= (:status response) 200)
      (let [body (json/parse-string (:body response) true)
            content (get-in body [:choices 0 :message :content])]
        (json/parse-string content true))
      (throw (ex-info "OpenAI API request failed"
                      {:status (:status response)
                       :body (:body response)})))))

(defn generate-table-view-config
  "Generate table view configuration using OpenAI"
  [{:keys [table-id view-type]}]
  (try
    (let [table (t2/select-one :model/Table :id table-id)
          _ (when-not table
              (throw (ex-info (i18n/tru "Table not found")
                              {:table-id table-id})))

          fields (fetch-table-fields table-id)
          _ (when (empty? fields)
              (throw (ex-info (i18n/tru "No active fields found for table")
                              {:table-id table-id})))

          prompt (build-prompt view-type fields (:display_name table))
          config (call-openai-api prompt view-type)]
      {:success true
       :config config
       :table_id table-id
       :view_type view-type})
    (catch Exception e
      (log/error e "Failed to generate table view config")
      {:success false
       :error (.getMessage e)
       :table_id table-id
       :view_type view-type})))

#_(generate-table-view-config {:table-id 3 :view-type :detail})
