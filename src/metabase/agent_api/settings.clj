(ns metabase.agent-api.settings
  (:require
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting agent-api-enabled?
  (deferred-tru "Whether the Agent API is enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :getter     #(and (llm.settings/ai-features-enabled?)
                    (setting/get-value-of-type :boolean :agent-api-enabled?))
  :export?    true
  :doc        false)

(defsetting mcp-query-handle-ttl-days
  (deferred-tru "Number of days a stored MCP query handle stays resolvable before it expires.")
  :type       :integer
  :default    14
  :visibility :internal
  :export?    false
  :audit      :no-value
  :doc        false)

(defsetting mcp-execute-sql-enabled
  ;; A human-visible admin setting: `deferred-tru` takes one literal, so the line runs long rather than
  ;; being spliced out of `str` calls the extractor cannot read.
  (deferred-tru "Whether the MCP `execute_sql` tool is available. Disable to remove the tool entirely; underlying native-query permissions still apply when enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)
