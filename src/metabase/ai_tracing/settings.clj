(ns metabase.ai-tracing.settings
  "Env-var-only settings for the eval-time AI tracing module.
   Configured exclusively via environment variables (`:setter :none`)."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting ai-eval-capture
  (deferred-tru
   (str "Enable eval-time AI agent trace capture. When true, agent / MCP / agent-api runs capture a "
        "full trace (prompts, completions, tool I/O, custom spans) and write it as structured JSONL to "
        "a per-session file via the dedicated `metabase.ai-tracing.log` logger. Separate from "
        "MB_TRACING_ENABLED. Off by default; intended for dedicated eval instances, NOT production "
        "(traces contain full, unredacted user content)."))
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :setter     :none)
