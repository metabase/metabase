(ns metabase.llm.api
  "API endpoints for LLM-powered SQL generation (OSS)."
  (:require
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.llm.openai :as llm.openai]
   [metabase.llm.settings :as llm.settings]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- build-system-prompt
  "Build a basic system prompt for SQL generation.
   TODO: Move to metabase.llm.prompts namespace with dialect/schema support."
  []
  "You are a SQL query generator. Convert natural language questions into valid SQL queries.

Instructions:
1. Generate ONLY the SQL query, no explanations or markdown formatting
2. If the request is ambiguous, make reasonable assumptions
3. If the request cannot be converted to SQL, respond with: ERROR: <brief explanation>

Output format: Return only the raw SQL query, nothing else.")

(api.macros/defendpoint :post "/generate-sql"
  "Generate SQL from a natural language prompt.

   Requires LLM to be configured (OpenAI API key set in admin settings)."
  [_route-params
   _query-params
   body :- [:map
            [:prompt :string]
            [:database_id {:optional true} pos-int?]]]
  :- [:map
      [:sql :string]]
  (when-not (llm.settings/llm-enabled?)
    (throw (ex-info (tru "LLM SQL generation is not configured. Please set an OpenAI API key in admin settings.")
                    {:status-code 403})))
  (let [{:keys [prompt]} body
        system-prompt (build-system-prompt)
        sql (llm.openai/chat-completion
             {:system   system-prompt
              :messages [{:role "user" :content prompt}]})]
    {:sql sql}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/llm` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))
