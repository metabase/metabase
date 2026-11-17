(ns metabase.agent-api.settings
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]))

(defsetting mcp-execute-sql-enabled
  (deferred-tru "Whether the MCP `execute_sql` tool is available. Disable to remove the tool entirely; underlying native-query permissions still apply when enabled.")
  :type       :boolean
  :visibility :public
  :default    true
  :export?    true
  :doc        false)

;; The opt-in for the deprecated Agent API. It replaces `agent-api-enabled?`, which was on by default and is a stub
;; now, see below. An upgraded instance can still hold a value for the old setting, in a stored row or in the env var
;; `MB_AGENT_API_ENABLED`. Nothing reads it.
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

(def ^:private agent-api-enabled-removed-message
  "agent-api-enabled? has been removed and has no effect; use deprecated-agent-api-enabled? instead")

;; `agent-api-enabled?` was the switch of the Agent API before 0.66. It has no effect now: the opt-in above replaces
;; it. It stays defined as a stub, like the upload settings of 0.50.0 in [[metabase.upload.settings]], so that an
;; input that still holds it does not fail: a serialization export of 0.65, which lists the key, a config file, or a
;; client that writes it.
;;
;; A write through the setter stores nothing and logs what to use. The getter throws, so nothing can read the
;; setting by mistake. It is not sent to clients and not exported.
;;
;; A serialization import writes with `setting/set-value-of-type!`, which skips the setter and the getter: it stores
;; the value of an export of 0.65 in a row that nothing reads. An import of a key that has no definition fails, so
;; this stub is what keeps an export of 0.65 importable.
;;
;; The getter throws an `ex-info`, not a plain `Exception` as the upload settings do: `GET /api/setting/:key` turns
;; only an `ExceptionInfo` into the generic 403 for a non-admin.
;;
;; Delete it together with the Agent API.
(defsetting agent-api-enabled?
  "The switch of the Agent API before 0.66. Removed and without effect."
  :type       :boolean
  :visibility :internal
  :deprecated "0.66.0"
  :export?    false
  :doc        false
  :getter     (fn [] (throw (ex-info agent-api-enabled-removed-message {:status-code 410})))
  :setter     (fn [_] (log/warn agent-api-enabled-removed-message)))
