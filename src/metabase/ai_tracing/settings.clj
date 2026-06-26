(ns metabase.ai-tracing.settings
  "Env-var-only settings for the eval-time AI tracing module.
   Configured exclusively via environment variables (`:setter :none`)."
  (:require
   [metabase.settings.core :refer [defsetting]]
   [metabase.util.i18n :refer [deferred-tru]]))

(set! *warn-on-reflection* true)

(defsetting ai-eval-capture
  (deferred-tru
   (str "Enable eval-time AI agent trace capture. When true, every Metabot agent run captures a "
        "full trace (prompts, completions, tool I/O, custom spans) and emits it as an `eval_trace` "
        "data part for the benchmark/eval harness. Separate from MB_TRACING_ENABLED. Off by default; "
        "intended for dedicated eval instances, NOT production (traces may contain full user content)."))
  :type       :boolean
  :default    false
  :visibility :internal
  :export?    false
  :setter     :none)

(defsetting ai-eval-otlp-endpoint
  (deferred-tru
   (str "OTLP HTTP endpoint for exporting captured eval traces to an external eval backend "
        "(Confident AI / Langfuse / Phoenix / a local Collector). When blank, traces are kept "
        "in-memory only and not exported. Uses a DEDICATED provider, separate from MB_TRACING_*."))
  :type       :string
  :default    ""
  :visibility :internal
  :export?    false
  :setter     :none)

(defsetting ai-eval-otlp-headers
  (deferred-tru
   (str "Comma-separated `key=value` headers sent with eval-trace OTLP export, e.g. an API key. "
        "For Confident AI use `x-confident-api-key=<key>` (NOT Authorization/Bearer)."))
  :type       :string
  :default    ""
  :visibility :internal
  :export?    false
  :setter     :none)

(defsetting ai-eval-otlp-service-name
  (deferred-tru "Service / instrumentation-scope name reported on exported eval traces.")
  :type       :string
  :default    "metabase-ai-eval"
  :visibility :internal
  :export?    false
  :setter     :none)
