(ns metabase.agent-api.settings
  (:require
   [metabase.llm.settings :as llm.settings]
   [metabase.settings.core :as setting :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(defsetting ^:deprecated agent-api-enabled?
  (deferred-tru "Deprecated and without effect. The Agent API is on only when `deprecated-agent-api-enabled?` is on.")
  :type       :boolean
  :visibility :public
  :default    true
  :deprecated "0.66.0"
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

;; The opt-in for the deprecated Agent API. It replaces `agent-api-enabled?`, which was on by default and now has no
;; effect.
;;
;; Do not add `:deprecated-name :agent-api-enabled?` here. A value of the old setting must not carry over: an admin has
;; to opt in to the deprecated API explicitly.
;;
;; `:deprecated` is set without `^:deprecated` on the symbol. The setting goes away with the Agent API, so a write of
;; it logs a deprecation warning. The gate in [[metabase.agent-api.validation]] has to read it until then, and the
;; metadata would flag that read.
(defsetting deprecated-agent-api-enabled?
  (deferred-tru "Whether the deprecated Agent API stays available. The Agent API is deprecated and will be removed in Metabase 67; use the MCP server for agents instead. Off by default; an admin turns it on to keep using the Agent API until it is removed.")
  :type       :boolean
  :visibility :public
  :default    false
  :deprecated "0.66.0"
  :export?    true)
