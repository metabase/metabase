(ns metabase.metabot.tracing.semconv
  "The spec of well-known span attribute keys for Metabot tracing.

  We borrow OpenTelemetry's GenAI semantic conventions
  (https://opentelemetry.io/docs/specs/semconv/gen-ai/) so spans line up with
  the wider LLM-observability ecosystem, plus a `metabase.metabot.*` extension
  namespace for keys that have no OTel equivalent.

  Attribute keys are plain strings (the on-the-wire / JSON shape). Use these vars
  rather than typing the strings so the set of known keys stays discoverable and
  consistent. [[known-attribute-keys]] documents each one."
  (:refer-clojure :exclude [iteration]))

;;; ---------------------------------------------------------------- OTel GenAI

(def gen-ai-system
  "The Generative AI product/provider, e.g. \"anthropic\", \"openai\"."
  "gen_ai.system")

(def gen-ai-operation-name
  "The GenAI operation being performed, e.g. \"chat\", \"execute_tool\"."
  "gen_ai.operation.name")

(def gen-ai-request-model
  "The model the request asked for, e.g. \"claude-sonnet-4-6\"."
  "gen_ai.request.model")

(def gen-ai-response-model
  "The model that actually produced the response."
  "gen_ai.response.model")

(def gen-ai-response-finish-reasons
  "Why the model stopped generating, e.g. [\"stop\" \"tool_use\"]."
  "gen_ai.response.finish_reasons")

(def gen-ai-usage-input-tokens
  "Number of prompt/input tokens billed for the completion."
  "gen_ai.usage.input_tokens")

(def gen-ai-usage-output-tokens
  "Number of completion/output tokens billed for the completion."
  "gen_ai.usage.output_tokens")

(def gen-ai-usage-cache-creation-input-tokens
  "Anthropic extension: input tokens written to the prompt cache."
  "gen_ai.usage.cache_creation_input_tokens")

(def gen-ai-usage-cache-read-input-tokens
  "Anthropic extension: input tokens served from the prompt cache."
  "gen_ai.usage.cache_read_input_tokens")

(def gen-ai-tool-name
  "Name of the tool being executed, e.g. \"search\", \"run_query\"."
  "gen_ai.tool.name")

(def gen-ai-tool-call-id
  "The id of the tool call the model requested."
  "gen_ai.tool.call.id")

;;; ----------------------------------------------------- metabase.metabot.* ext

(def conversation-id
  "The MetabotConversation id this trace belongs to."
  "metabase.metabot.conversation_id")

(def profile-id
  "The agent profile driving the turn, e.g. \"sql\", \"nlq\"."
  "metabase.metabot.profile_id")

(def iteration
  "Zero/one-based index of this step within the agent loop."
  "metabase.metabot.iteration")

(def finish-reason
  "Why the agent loop stopped: \"max-iterations\", \"final-response\", or \"stop\"."
  "metabase.metabot.finish_reason")

(def ai-proxied
  "Whether the request was routed through the Metabase AI proxy."
  "metabase.metabot.ai_proxied")

(def context
  "The user's request context (what they were viewing, capabilities, …),
  captured on the root span so an old conversation is reviewable in full."
  "metabase.metabot.context")

(def tool-input
  "The decoded tool-call arguments. Tool INPUT only — tool output is never
  recorded as a span attribute by design."
  "metabase.metabot.tool.input")

(def known-attribute-keys
  "Documentation registry of every well-known span attribute key → its meaning.
  Not enforced — spans may carry other keys — but this is the canonical list of
  what each step should aim to capture."
  {gen-ai-system                            "GenAI provider (anthropic/openai/…)"
   gen-ai-operation-name                    "Operation: chat | execute_tool"
   gen-ai-request-model                     "Requested model"
   gen-ai-response-model                    "Responding model"
   gen-ai-response-finish-reasons           "Model stop reasons"
   gen-ai-usage-input-tokens                "Prompt/input tokens"
   gen-ai-usage-output-tokens               "Completion/output tokens"
   gen-ai-usage-cache-creation-input-tokens "Prompt-cache write tokens (Anthropic)"
   gen-ai-usage-cache-read-input-tokens     "Prompt-cache read tokens (Anthropic)"
   gen-ai-tool-name                         "Tool name"
   gen-ai-tool-call-id                      "Tool call id"
   conversation-id                          "MetabotConversation id"
   profile-id                               "Agent profile"
   iteration                                "Agent-loop step index"
   finish-reason                            "Agent-loop finish reason"
   ai-proxied                               "Routed through Metabase AI proxy?"
   context                                  "User request/viewing context (root span)"
   tool-input                               "Tool-call arguments (input only)"})

;;; ----------------------------------------------------------- enums (OTel)

(def span-kinds
  "Allowed OpenTelemetry span kinds."
  #{:server :client :internal})

(def span-statuses
  "Allowed OpenTelemetry span statuses."
  #{:unset :ok :error})
