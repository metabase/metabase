(ns metabase-enterprise.metabot-v3.tools.table-view-config
  "Generate table view configurations using OpenAI API"
  (:require
   [clj-http.client :as http]
   [metabase.channel.template.core :as template]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defsetting openai-api-key
  "Open AI API KEY"
  :visibility :internal
  :encryption :when-encryption-key-set
  :audit      :never)

(defn- get-openai-api-key
  "Get OpenAI API key from environment variabllle"
  []
  (or (System/getenv "MB_OPENAI_API_KEY")
      (openai-api-key)
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
           {:id (:id field)
            :name (:name field)
            :display_name (:display_name field)
            :type (name (:base_type field))
            :semantic_type (when (:semantic_type field)
                             (name (:semantic_type field)))
            :description (:description field)})
         fields)))

(defn- build-prompts
  "Build system and user prompts for OpenAI based on view type and fields using handlebars templates"
  [view-type fields table-name]
  (let [view-type-str (name view-type)
        fields-json (json/encode fields)
        template-data {:viewType view-type-str
                       :tableName table-name
                       :fieldsJson fields-json}
        system-prompt (template/render "metabase_enterprise/metabot_v3/tools/table_view_config_system_prompt.hbs" template-data)
        user-prompt (template/render "metabase_enterprise/metabot_v3/tools/table_view_config_user_prompt.hbs" template-data)]
    {:system system-prompt
     :user user-prompt}))

;; matches ObjectViewSectionSettings in frontend/src/metabase-types/api/table.ts
(def ^:private object-view-settings
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
   :required ["object_view"]})

;; matches ListViewTableSettings in frontend/src/metabase-types/api/table.ts
(def ^:private table-view-settings
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
   :required ["list_view"]})

(def ^:private response-schemas
  "JSON schemas for structured output by view type"
  {:table table-view-settings
   :list object-view-settings
   :gallery object-view-settings
   :detail object-view-settings})

(defn- call-openai-api
  "Call OpenAI API to generate configuration using structured outputs"
  [prompts view-type]
  (let [api-key (get-openai-api-key)
        response-schema (get response-schemas view-type)
        response (http/post "https://api.openai.com/v1/chat/completions"
                            {:headers {"Authorization" (str "Bearer " api-key)
                                       "Content-Type" "application/json"}
                             :body (json/encode
                                    {:model "gpt-4o-mini"
                                     :messages [{:role "system"
                                                 :content (:system prompts)}
                                                {:role "user"
                                                 :content (:user prompts)}]
                                     :response_format {:type "json_schema"
                                                       :json_schema {:name (str (name view-type) "_config")
                                                                     :schema response-schema
                                                                     :strict true}}
                                     :temperature 0.3
                                     :max_tokens 1000})
                             :throw-exceptions false})]

    (if (= (:status response) 200)
      (let [body (json/decode (:body response) true)
            content (get-in body [:choices 0 :message :content])]
        (json/decode content true))
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

          prompts (build-prompts view-type fields (:display_name table))
          config (call-openai-api prompts view-type)]
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
