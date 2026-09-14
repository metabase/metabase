(ns metabase.metabot.self.output-limits
  "The maximum output tokens each model's vendor documents.

    (max-output-tokens \"claude-sonnet-4-6\") ;; => 128000
    (max-output-tokens \"deepseek-v4-pro\")   ;; => 393216")

(set! *warn-on-reflection* true)

(def ^:private documented-max-output-tokens
  {;; documented model max: https://platform.claude.com/docs/en/models/fable-5/overview
   "claude-fable-5"     128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-5/overview
   "claude-opus-5"      128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-8/overview
   "claude-opus-4-8"    128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-7/overview
   "claude-opus-4-7"    128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-6/overview
   "claude-opus-4-6"    128000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-5/overview
   "claude-sonnet-5"    128000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-4-6/overview
   "claude-sonnet-4-6"  128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-5/overview
   "claude-opus-4-5"     64000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-4-5/overview
   "claude-sonnet-4-5"   64000
   ;; documented model max: https://platform.claude.com/docs/en/models/haiku-4-5/overview
   "claude-haiku-4-5"    64000
   ;; documented model max, from the Bedrock model card:
   ;; https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-1.html
   "claude-opus-4-1"     32000
   ;; Every GPT row below documents a 128,000 max output, one page per key:
   ;; https://developers.openai.com/api/docs/models/<id>. Metabase sends none of them: OpenAI bills a sent cap
   ;; against the rate limit ("Your rate limit is calculated as the maximum of `max_tokens` and the estimated
   ;; number of tokens", https://developers.openai.com/api/docs/guides/rate-limits) and Azure's quota estimate
   ;; includes it (https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota). 128,000 is the ceiling
   ;; the server already enforces, so sending it would only reserve quota.
   "gpt-5.6-sol"           nil
   "gpt-5.6-terra"         nil
   "gpt-5.6-luna"          nil
   "gpt-5.5"               nil
   "gpt-5.5-pro"           nil
   "gpt-5.4"               nil
   "gpt-5.4-pro"           nil
   "gpt-5.4-mini"          nil
   "gpt-5.4-nano"          nil
   ;; documented model max: https://api-docs.deepseek.com/api/create-chat-completion
   "deepseek-v4-pro"    393216
   ;; documented model max: https://api-docs.deepseek.com/api/create-chat-completion
   "deepseek-v4-flash"  393216
   ;; documented model max for the GLM-5.3 and GLM-5.2 series: https://docs.z.ai/api-reference/llm/chat-completion
   ;; The page's prose ("128K maximum output") and its max_tokens schema maximum of 131072 are the same number,
   ;; 128 * 1024; we send the exact one.
   "glm-5.3"            131072
   "glm-5.2"            131072
   ;; The Gemini rows cite the Gemini Enterprise Agent Platform, the surface Metabase calls; the Gemini API model
   ;; pages document the same 65536 (e.g. https://ai.google.dev/gemini-api/docs/models/gemini-3.7-flash).
   ;; documented model max: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash
   "gemini-3.5-flash"    65536
   ;; documented model max: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-6-flash
   "gemini-3.6-flash"    65536
   ;; documented model max: https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-7-flash
   "gemini-3.7-flash"    65536
   ;; documented model max: https://www.alibabacloud.com/help/en/model-studio/qwen3-8-max
   "qwen3.8-max"        131072
   ;; No fixed documented max: output is the context window minus the prompt
   ;; (https://platform.kimi.ai/docs/guide/troubleshooting.md), and Moonshot rejects a request whose prompt plus
   ;; cap exceeds the context (https://platform.kimi.ai/docs/api/chat.md). Sending none leaves each model on the
   ;; default its docs state: 131072 for K3, 32768 for K2.6 (https://platform.kimi.ai/docs/api/chat.md).
   "kimi-k3"               nil
   "kimi-k2.6"             nil
   ;; No documented max output (https://docs.mistral.ai/models/mistral-medium-3-5-26-04); the API constrains only
   ;; prompt plus max_tokens to the context length (https://docs.mistral.ai/api/endpoint/chat), so there is no
   ;; figure to send.
   "mistral-medium-3-5"    nil})

(defn max-output-tokens
  "The documented maximum output tokens for `model-id`, or nil.

  `model-id` is the vendor's own undated id: `claude-haiku-4-5`, not `anthropic.claude-haiku-4-5-20251001`. Nil
  means the model has no row, or its row is nil because Metabase sends that model no chat cap."
  [model-id]
  (get documented-max-output-tokens model-id))
