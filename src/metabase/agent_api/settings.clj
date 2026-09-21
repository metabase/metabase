(ns metabase.agent-api.settings
  (:require
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting agent-api-enabled?
  (deferred-tru "Whether the Agent API is enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :agent-api-enabled?))
  :export?    true
  :doc        false)

(defsetting mcp-execute-sql-enabled
  (deferred-tru "Whether the MCP `execute_sql` tool is available. Disable to remove the tool entirely; underlying native-query permissions still apply when enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)
