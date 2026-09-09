(ns metabase.metabot.self.catalog
  "Provider capability dispatch: given a model reference, which optional capabilities the provider
  and model behind it serve."
  (:require
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.self.ollama :as ollama]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.vllm :as vllm]))

(set! *warn-on-reflection* true)

(defn streams-reasoning?
  "Whether a model reference names a model that streams its reasoning back to us.

  Anthropic and OpenAI answer from the model name, because thinking is requested in the request body.
  The self-hosted types answer from what their connect-time probe recorded on the connection — how
  the server was started or the model built matters too, so the name alone cannot settle it."
  [model-ref]
  (let [{:keys [type model credentials]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/reasoning-model? model)
      "deepseek"  (deepseek/reasoning-model? model)
      "openai"    (openai/reasoning-model? model)
      "google"    (google/reasoning-model? model)
      "vllm"      (vllm/reasoning-connection? credentials)
      "ollama"    (ollama/reasoning-connection? credentials)
      false)))

(defn supports-fast-mode?
  "Whether a model reference names a model we can serve in Anthropic fast mode."
  [model-ref]
  (let [{:keys [type model ai-proxy?]} (llm.provider/resolve-model-ref model-ref)]
    (case type
      "anthropic" (claude/fast-mode-model? model ai-proxy?)
      false)))
