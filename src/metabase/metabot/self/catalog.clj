(ns metabase.metabot.self.catalog
  "Provider capability dispatch: given a model reference, which optional capabilities the provider
  and model behind it serve."
  (:require
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.ollama.capabilities :as ollama.capabilities]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]))

(set! *warn-on-reflection* true)

(defn streams-reasoning?
  "Whether a model reference names a model that streams its reasoning back to us.

  Answers from what is already known: every branch is cheap, and none of them waits on a provider.
  `llm-metabot-supports-reasoning?` is public, so this is reached by every client's page load.

  Anthropic, OpenAI, DeepSeek, Z.AI, OpenRouter, Google, Mistral, Moonshot, and — delegating per API family —
  Bedrock and Azure answer from the model name, because thinking is requested in the request body.
  The self-hosted types cannot: how the server was started or the model built matters too, so the
  name alone cannot settle it. vLLM answers from what its connect-time probe recorded on the
  connection. Ollama answers about the particular model, from what its server reports — but without
  calling it, because `llm-metabot-supports-reasoning?` is a public setting and a page load must
  never become a request to the operator's Ollama. Keeping that answer available is the Ollama
  adapter's own business, not this namespace's.

  Unknown provider types answer false."
  [model-ref]
  (let [{:keys [type model credentials]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic"  (claude/reasoning-model? model)
      "azure"      (azure/reasoning-model? model)
      "bedrock"    (bedrock/reasoning-model? model)
      "deepseek"   (deepseek/reasoning-model? model)
      "google"     (google/reasoning-model? model)
      "mistral"    (mistral/reasoning-model? model)
      "moonshot"   (moonshot/reasoning-model? model)
      "ollama"     (ollama.capabilities/cached-reasoning-model? credentials model)
      "openai"     (openai/reasoning-model? model)
      "openrouter" (openrouter/reasoning-model? model)
      "vllm"       (vllm/reasoning-connection? credentials)
      "zai"        (zai/reasoning-model? model)
      false)))

(defn supports-fast-mode?
  "Whether a model reference names a model we can serve in Anthropic fast mode."
  [model-ref]
  (let [{:keys [type model ai-proxy?]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/fast-mode-model? model ai-proxy?)
      false)))
