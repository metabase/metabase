(ns metabase.metabot.self.output-limits
  "The maximum output tokens each model's vendor documents.

    (max-output-tokens \"claude-sonnet-4-6\") ;; => 128000
    (max-output-tokens \"deepseek-v4-pro\")   ;; => 393216")

(set! *warn-on-reflection* true)

(def ^:private documented-max-output-tokens
  {;; documented model max: https://platform.claude.com/docs/en/models/fable-5/overview
   "claude-fable-5"    128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-5/overview
   "claude-opus-5"     128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-8/overview
   "claude-opus-4-8"   128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-7/overview
   "claude-opus-4-7"   128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-6/overview
   "claude-opus-4-6"   128000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-5/overview
   "claude-sonnet-5"   128000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-4-6/overview
   "claude-sonnet-4-6" 128000
   ;; documented model max: https://platform.claude.com/docs/en/models/opus-4-5/overview
   "claude-opus-4-5"    64000
   ;; documented model max: https://platform.claude.com/docs/en/models/sonnet-4-5/overview
   "claude-sonnet-4-5"  64000
   ;; documented model max: https://platform.claude.com/docs/en/models/haiku-4-5/overview
   "claude-haiku-4-5"   64000
   ;; documented model max, from the Bedrock model card:
   ;; https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-opus-4-1.html
   "claude-opus-4-1"    32000
   ;; Every GPT row below documents a 128,000 max output, one page per key:
   ;; https://developers.openai.com/api/docs/models/<id>. Metabase sends none of them: OpenAI bills a sent cap
   ;; against the rate limit ("Your rate limit is calculated as the maximum of `max_tokens` and the estimated
   ;; number of tokens", https://developers.openai.com/api/docs/guides/rate-limits) and Azure's quota estimate
   ;; includes it (https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/quota). 128,000 is the ceiling
   ;; the server already enforces, so sending it would only reserve quota.
   "gpt-5.6-sol"   nil
   "gpt-5.6-terra" nil
   "gpt-5.6-luna"  nil
   "gpt-5.5"       nil
   "gpt-5.5-pro"   nil
   "gpt-5.4"       nil
   "gpt-5.4-pro"   nil
   "gpt-5.4-mini"  nil
   "gpt-5.4-nano"  nil
   ;; documented model max: https://api-docs.deepseek.com/api/create-chat-completion
   "deepseek-v4-pro"   393216
   ;; documented model max: https://api-docs.deepseek.com/api/create-chat-completion
   "deepseek-v4-flash" 393216})

(defn max-output-tokens
  "The documented maximum output tokens for `model-id`, or nil.

  `model-id` is the vendor's own undated id: `claude-haiku-4-5`, not `anthropic.claude-haiku-4-5-20251001`. Nil
  means the model has no row, or its row is nil because Metabase sends that model no chat cap."
  [model-id]
  (get documented-max-output-tokens model-id))
