(ns metabase.metabot.self.registry
  "The registry of LLM providers Metabot can serve, and the lookups over it.

  One table keyed by the `llm-providers` type string, replacing the four parallel `case` forms
  [[metabase.metabot.self]] used to carry. Adding a provider is a row; a provider without a capability
  simply has no entry for it, rather than each lookup carrying its own default — one of those four
  defaulted to nil silently, so a provider missing from it read as \"no context window\" rather than
  failing.

  The two capability lookups in [[metabase.metabot.self.catalog]] cannot read this table yet:
  `metabase.metabot.self.azure` requires `metabase.metabot.settings`, which requires that namespace, so a
  table requiring every adapter cannot also sit below it. Breaking that one upward dependency would let the
  two merge into a single registry."
  (:require
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ProviderType
  "The `llm-providers` type string a provider is registered under."
  :string)

(def Capability
  "What a registry row can answer about a provider. Closed, so a lookup for a capability that does not
  exist is a compile-time-checkable mistake rather than a nil that reads as \"this provider has none\"."
  [:enum :stream :list-models :supported-models :context-window :ai-proxy?])

(def AdapterRow
  "One provider's row. Closed for the same reason [[Capability]] is: a mistyped key in the table below would
  otherwise silently mean the provider lacks that capability."
  [:map {:closed true}
   [:stream           {:optional true} [:maybe ifn?]]
   [:list-models      {:optional true} [:maybe ifn?]]
   [:supported-models {:optional true} [:maybe ifn?]]
   [:context-window   {:optional true} [:maybe ifn?]]
   [:ai-proxy?        {:optional true} [:maybe :boolean]]])

(def ^:private adapters
  "Every provider Metabot serves, by `llm-providers` type.

  Vars rather than the functions themselves: a map literal captures each value at namespace load, so
  `with-redefs` on an adapter would not be seen. That is why the dispatch this replaces was written as
  `case` forms inside functions; a var is deref'd at call time, so a map of vars keeps the property.

    :stream           - the adapter entry point, returning an AISDK stream.
    :list-models      - the provider's model listing, and the credential round trip behind Connect.
    :supported-models - the allow-list a listing is intersected with. Absent for a provider that serves
                        whatever the operator loaded (vLLM), names its own deployment (Azure), or has a
                        catalog fixed in `metabase.llm.provider` (Google, and the managed connection).
    :context-window   - model -> its input context window in tokens.
    :ai-proxy?        - whether the Metabase Cloud AI proxy can serve this provider. Anthropic only, which
                        the managed connection's own fixed catalog independently agrees with."
  {"anthropic"  {:stream           #'claude/claude
                 :list-models      #'claude/list-models
                 :supported-models #'claude/supported-models
                 :context-window   #'claude/context-window-tokens
                 :ai-proxy?        true}
   "azure"      {:stream           #'azure/azure
                 :list-models      #'azure/list-models
                 :context-window   #'azure/context-window-tokens}
   "bedrock"    {:stream           #'bedrock/bedrock
                 :list-models      #'bedrock/list-models
                 :supported-models #'bedrock/supported-models
                 :context-window   #'bedrock/context-window-tokens}
   "deepseek"   {:stream           #'deepseek/deepseek
                 :list-models      #'deepseek/list-models
                 :supported-models #'deepseek/supported-models}
   "google"     {:stream           #'google/google
                 :list-models      #'google/list-models
                 :context-window   #'google/context-window-tokens}
   "mistral"    {:stream           #'mistral/mistral
                 :list-models      #'mistral/list-models
                 :supported-models #'mistral/supported-models
                 :context-window   #'mistral/context-window-tokens}
   "moonshot"   {:stream           #'moonshot/moonshot
                 :list-models      #'moonshot/list-models
                 :supported-models #'moonshot/supported-models
                 :context-window   #'moonshot/context-window-tokens}
   "openai"     {:stream           #'openai/openai
                 :list-models      #'openai/list-models
                 :supported-models #'openai/supported-models
                 :context-window   #'openai/context-window-tokens}
   "openrouter" {:stream           #'openrouter/openrouter
                 :list-models      #'openrouter/list-models
                 :supported-models #'openrouter/supported-models
                 :context-window   #'openrouter/context-window-tokens}
   "vllm"       {:stream           #'vllm/vllm
                 :list-models      #'vllm/list-models}
   "zai"        {:stream           #'zai/zai
                 :list-models      #'zai/list-models
                 :supported-models #'zai/supported-models
                 :context-window   #'zai/context-window-tokens}
   ;; the managed connection is served by the wire family its model names, so it has no adapter of its own
   "metabase"   {}})

(mu/defn- adapter :- AdapterRow
  "The registry row for `provider`, or a throw naming it — a type with no row is a mistake, not a provider
  that happens to do nothing."
  [provider :- ProviderType]
  (or (get adapters provider)
      (throw (ex-info (str "Unknown LLM provider: " provider)
                      {:provider provider}))))

(mu/defn required
  "The `capability` of `provider`, which every provider that serves requests must have.

  No return schema: what a capability yields depends on which one was asked for — a var holding a fn for
  `:stream`, a var holding a map for `:supported-models`, a boolean for `:ai-proxy?`. Naming that would
  mean a getter per capability rather than one generic lookup."
  [provider   :- ProviderType
   capability :- Capability]
  (or (get (adapter provider) capability)
      (throw (ex-info (str "LLM provider " provider " has no " capability)
                      {:provider provider :capability capability}))))

(mu/defn optional
  "The `capability` of `provider`, or nil where it has none. Still throws for a provider with no row at all:
  a new adapter that forgets to register must fail rather than read as one that simply has no models."
  [provider   :- ProviderType
   capability :- Capability]
  (get (adapter provider) capability))

(mu/defn registered? :- :boolean
  "Whether `provider` has a row. For a caller holding a type that may not name a provider at all, rather
  than one asserting that it does — hence the `:maybe`, since an unresolvable model ref yields no type."
  [provider :- [:maybe ProviderType]]
  (contains? adapters provider))
