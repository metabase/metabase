(ns metabase.metabot.self.catalog
  "What the configured connections call the models they serve.

  Each adapter already carries the whitelist behind its `list-models`, and those whitelists name every model the
  admin picker offers. Reading them here means a model reference can be shown to a person without listing the
  provider's catalog over the wire — which matters where the name is wanted precisely because a provider is
  failing, and where a request that hangs would be paid for by whoever is waiting on Metabot."
  (:require
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.zai :as zai]))

(set! *warn-on-reflection* true)

(defn- provider-model-display-name
  [provider model]
  (case provider
    "anthropic"  (claude/model-display-name model)
    "bedrock"    (bedrock/model-display-name model)
    "mistral"    (mistral/model-display-name model)
    "moonshot"   (moonshot/model-display-name model)
    "openai"     (openai/model-display-name model)
    "openrouter" (openrouter/model-display-name model)
    "zai"        (zai/model-display-name model)
    ;; The types with no whitelist behind them — Azure's deployments, Google's models, whatever a vLLM server was
    ;; loaded with — name the model in the connection's own config or catalog, so the name in the reference is
    ;; already the human-facing one.
    nil))

(defn- fixed-model-display-name
  "What the registry calls the model in `model-ref`, for a type whose catalog it carries because the provider's own
  cannot be listed — Google's, whose endpoint reports models that are not really available."
  [model-ref]
  (let [conn-type (:type (llm.provider/connection (llm.provider/model-ref->connection-key model-ref)))
        model     (llm.provider/model-ref->model model-ref)]
    (some (fn [{:keys [id display_name]}]
            (when (= id model) display_name))
          (llm.provider/fixed-models conn-type))))

(defn model-display-name
  "What a `connection-key/model` reference is called in the model picker, e.g. `\"Claude Sonnet 4.6\"`.

  Returns nil when nothing names it: an Azure deployment, a model outside its adapter's whitelist, or a reference
  to a connection that is not configured. Callers show the model id itself rather than inventing a name for it."
  [model-ref]
  (when-let [{:keys [type model]} (llm.provider/resolve-model-ref model-ref)]
    (or (provider-model-display-name type model)
        (fixed-model-display-name model-ref))))

(defn model-name
  "[[model-display-name]] for `model-ref`, or the model id it names when nothing does."
  [model-ref]
  (or (model-display-name model-ref)
      (llm.provider/model-ref->model model-ref)))
