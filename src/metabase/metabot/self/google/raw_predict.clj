(ns metabase.metabot.self.google.raw-predict
  "Wire-format for Anthropic partner models on the Gemini Enterprise Agent Platform.

  Anthropic models are served by the `streamRawPredict` method, whose payload is Anthropic's Messages with two
  platform differences: the request URL names the model instead of the body, and `anthropic_version` is pinned to
  `vertex-2023-10-16` and sent in the body instead of a header. Everything else (system blocks, tools, forced
  structured output, prompt caching, streamed events) is exactly the Messages API, so this namespace is a thin wrapper
  over [[metabase.metabot.self.claude]].

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/use-claude"
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as core]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private anthropic-version
  "Google-specific `anthropic_version`."
  "vertex-2023-10-16")

(defn- direct-api-model-id
  "The direct-API spelling of a platform model ID.
  The Gemini Agent Platform versions a dated model as `{model}@{date}` where the Messages API spells it
  `{model}-{date}`. The Claude adapter's model knowledge (max_tokens ceilings, thinking support) is keyed by the
  direct spelling."
  [model-id]
  (str/replace (str model-id) "@" "-"))

(mu/defn request-body
  "Build the streamRawPredict request body for an LLM request on `model-id`."
  [model-id opts :- core/LLMRequestOpts]
  (-> (claude/claude-request-body (assoc opts :model (direct-api-model-id model-id)))
      (dissoc :model)
      (assoc :anthropic_version anthropic-version)))

(defn ->aisdk-chunks-xf
  "Translates streamed Messages API events into AI SDK v5 chunks."
  []
  (claude/claude->aisdk-chunks-xf))

(defn reasoning-model?
  "Whether `model-id` (the model without its publisher qualifier) streams its reasoning back to us."
  [model-id]
  (claude/reasoning-model? (direct-api-model-id model-id)))

(defn context-window-tokens
  "The input context window for `model-id`, or nil when it isn't one we know."
  [model-id]
  (claude/context-window-tokens (direct-api-model-id model-id)))
