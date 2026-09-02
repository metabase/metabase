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
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]))

(set! *warn-on-reflection* true)

(defn streams-reasoning?
  "Whether a model reference names a model that streams its reasoning back to us.

  Anthropic and OpenAI answer from the model name, because thinking is requested in the request body. vLLM answers
  from what its connect-time probe observed and recorded on the connection — the flag depends on the operator's
  `--reasoning-parser` as well as on the model, so the name cannot settle it."
  [model-ref]
  (let [{:keys [type model credentials]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/reasoning-model? model)
      "azure"     (azure/reasoning-model? model)
      "bedrock"   (bedrock/reasoning-model? model)
      "deepseek"  (deepseek/reasoning-model? model)
      "mistral"    (mistral/reasoning-model? model)
      "openai"     (openai/reasoning-model? model)
      "openrouter" (openrouter/reasoning-model? model)
      "google"     (google/reasoning-model? model)
      "vllm"      (vllm/reasoning-connection? credentials)
      "zai"       (zai/reasoning-model? model)
      false)))

(defn supports-fast-mode?
  "Whether a model reference names a model we can serve in Anthropic fast mode."
  [model-ref]
  (let [{:keys [type model ai-proxy?]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/fast-mode-model? model ai-proxy?)
      false)))
