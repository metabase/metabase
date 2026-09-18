(ns metabase.metabot.self.chat-max-tokens-test
  "The output-token cap every surface sends when the caller names none.

  One namespace across every adapter, because the interesting property is cross-provider: a model served by
  several providers must be capped identically on all of them, and each provider spells its id differently."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.provider :as llm.provider]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google.models :as google.models]
   [metabase.metabot.self.google.raw-predict :as raw-predict]
   [metabase.metabot.self.google.stream-generate-content :as stream-generate-content]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

;; every-catalog-model-is-classified-test reads the provider registry, whose entries pass through
;; llm.provider/provider-type -> hosted? -> premium-features/is-hosted?, a license lookup backed by the app db.
;; metabase.metabot.self-test initializes :db for the same two calls.
(use-fixtures :once (fixtures/initialize :db))

(def ^:private omitted
  "What a surface sends when it caps nothing: the field is absent from the body, rather than present and nil.
  The difference is the whole point — an absent field lets the model run to its own limit."
  ::omitted)

(def ^:private stock-input
  [{:role :user :content "hi"}])

(defn- cap-for
  "The output-token cap `surface`'s own request builder puts in the body for `model`, or [[omitted]].
  `extra` is merged into the request opts."
  ([surface model] (cap-for surface model nil))
  ([surface model extra]
   (let [opts (merge {:model model :input stock-input} extra)]
     ;; Every branch calls a pure public builder — no `with-redefs`, so the deftests here stay `^:parallel`.
     ;; The grouped branches are the surfaces that share a builder: what differs between them is the id
     ;; spelling, which is exactly what these tests pin. Dispatch from the `*-raw` fns down to these builders
     ;; stays covered by the existing bedrock, azure and google tests.
     (case surface
       ;; Anthropic Messages: direct, the managed proxy (resolve-model-ref has already dropped `anthropic/`),
       ;; Bedrock's `anthropic.` prefix, and Azure's bare admin-cased deployment name.
       (:anthropic :managed :bedrock-anthropic :azure-anthropic)
       (get (claude/claude-request-body opts) :max_tokens omitted)

       ;; Vertex names the model in the URL and dates it with `@`, which raw-predict rewrites before delegating.
       :vertex-claude (get (raw-predict/request-body model opts) :max_tokens omitted)
       :deepseek      (get (deepseek/deepseek-request-body opts) :max_tokens omitted)

       ;; OpenAI Responses: direct, and Azure's deployment name.
       (:openai :azure-openai)
       (get (openai/openai-request-body opts) :max_output_tokens omitted)

       ;; Bedrock's `openai.` prefix, through the mantle adaptation bedrock-raw applies to the same builder.
       :bedrock-openai
       (get (bedrock/->mantle-openai-body (openai/openai-request-body opts)) :max_output_tokens omitted)

       :openrouter (get (openrouter/openrouter-request-body opts) :max_tokens omitted)
       :zai        (get (zai/zai-request-body opts) :max_tokens omitted)
       :moonshot   (get (moonshot/moonshot-request-body opts) :max_tokens omitted)
       :mistral    (get (mistral/mistral-request-body opts) :max_tokens omitted)
       :vllm       (get (vllm/vllm-request-body opts) :max_tokens omitted)
       :gemini     (get-in (stream-generate-content/request-body opts)
                           [:generationConfig :maxOutputTokens] omitted)))))

(def ^:private expected-chat-caps
  "The cap each surface sends for each model it serves, keyed by surface and then by that surface's own id spelling.

  Written out literally, once per surface, rather than derived: a shared model whose id translates to the wrong
  row on one provider then fails here instead of drifting quietly. [[omitted]] means no cap is sent at all."
  {;; Anthropic Messages, direct: the catalog's own dated and undated spellings
   :anthropic         {"claude-fable-5"               32000
                       "claude-opus-5"                32000
                       "claude-opus-4-8"              32000
                       "claude-opus-4-7"              32000
                       "claude-opus-4-6"              32000
                       "claude-sonnet-5"              32000
                       "claude-sonnet-4-6"            32000
                       "claude-opus-4-5-20251101"     32000
                       "claude-sonnet-4-5-20250929"   32000
                       "claude-haiku-4-5-20251001"    32000
                       "claude-opus-4-1-20250805"     32000
                       ;; an id no catalog names, and an admin-named deployment: the Messages API needs a cap, so
                       ;; they get the same default rather than an omission
                       "claude-fable-5-1"             32000
                       "my-deployment-3"              32000}
   ;; OpenAI Responses, direct: no default cap is sent (see openai/openai-request-body)
   :openai            {"gpt-5.6-sol"                 omitted
                       "gpt-5.6-terra"               omitted
                       "gpt-5.6-luna"                omitted
                       "gpt-5.5"                     omitted
                       "gpt-5.5-pro"                 omitted
                       "gpt-5.4"                     omitted
                       "gpt-5.4-pro"                 omitted
                       "gpt-5.4-mini"                omitted
                       "gpt-4o"                      omitted}
   ;; the managed proxy: resolve-model-ref hands the adapter the bare model
   :managed           {"claude-sonnet-4-6"            32000}
   ;; Bedrock: vendor-prefixed
   :bedrock-anthropic {"anthropic.claude-fable-5"     32000
                       "anthropic.claude-opus-5"      32000
                       "anthropic.claude-opus-4-8"    32000
                       "anthropic.claude-opus-4-7"    32000
                       "anthropic.claude-sonnet-5"    32000
                       "anthropic.claude-haiku-4-5"   32000}
   :bedrock-openai    {"openai.gpt-5.4"               32000
                       "openai.gpt-5.4-2026-03-05"    32000
                       "openai.gpt-5.5"               32000
                       "openai.gpt-5.5-2026-04-23"    32000}
   ;; Azure: the bare deployment name, dateless, and cased however the admin named it
   :azure-anthropic   {"claude-fable-5"               32000
                       "claude-opus-5"                32000
                       "claude-opus-4-8"              32000
                       "claude-opus-4-7"              32000
                       "claude-opus-4-6"              32000
                       "claude-sonnet-5"              32000
                       "claude-sonnet-4-6"            32000
                       "claude-opus-4-5"              32000
                       "claude-sonnet-4-5"            32000
                       "claude-haiku-4-5"             32000
                       "claude-opus-4-1"              32000
                       "Claude-Opus-4-8"              32000
                       "Claude-Haiku-4-5"             32000}
   :azure-openai      {"gpt-5.6-sol"                 omitted
                       "gpt-5.6-terra"               omitted
                       "gpt-5.6-luna"                omitted
                       "gpt-5.6"                     omitted
                       "gpt-5.5-pro"                 omitted
                       "gpt-5.5"                     omitted
                       "gpt-5.4-pro"                 omitted
                       "gpt-5.4-mini"                omitted
                       "gpt-5.4-nano"                omitted
                       "gpt-5.4"                     omitted
                       "GPT-5.5"                     omitted}
   ;; Vertex: partner ids, dated with `@`
   :vertex-claude     {"claude-fable-5"               32000
                       "claude-opus-5"                32000
                       "claude-opus-4-6"              32000
                       "claude-sonnet-5"              32000
                       "claude-sonnet-4-6"            32000
                       "claude-haiku-4-5@20251001"    32000}
   :gemini            {"google/gemini-3.5-flash"      32000
                       "google/gemini-3.6-flash"      32000
                       "google/gemini-3.7-flash"      32000
                       "google/gemini-2.0-flash"      32000}
   :deepseek          {"deepseek-v4-pro"              32000
                       "deepseek-v4-flash"            32000}
   ;; OpenRouter: dotted Claude versions, dated DeepSeek snapshots
   :openrouter        {"anthropic/claude-fable-5"         32000
                       "anthropic/claude-opus-5"          32000
                       "anthropic/claude-opus-4.8"        32000
                       "anthropic/claude-opus-4.7"        32000
                       "anthropic/claude-opus-4.6"        32000
                       "anthropic/claude-sonnet-5"        32000
                       "anthropic/claude-sonnet-4.6"      32000
                       "anthropic/claude-opus-4.5"        32000
                       "anthropic/claude-sonnet-4.5"      32000
                       "anthropic/claude-haiku-4.5"       32000
                       "anthropic/claude-opus-4.1"        32000
                       "deepseek/deepseek-v4-pro"         32000
                       "deepseek/deepseek-v4-pro-0813"    32000
                       "deepseek/deepseek-v4-flash-0731"  32000
                       "z-ai/glm-5.3"                     32000
                       "z-ai/glm-5.2"                     32000
                       "qwen/qwen3.8-max"                 32000
                       ;; the id qwen/qwen3.8-max resolves to on OpenRouter today
                       "qwen/qwen3.8-max-0902"            32000
                       ;; unlike on OpenAI direct and Azure, GPT models get the default here
                       "openai/gpt-5.6-sol"               32000
                       "openai/gpt-5.6-terra"             32000
                       "openai/gpt-5.6-luna"              32000
                       "openai/gpt-5.5"                   32000
                       "openai/gpt-5.5-pro"               32000
                       "openai/gpt-5.4"                   32000
                       "openai/gpt-5.4-mini"              32000
                       "openai/gpt-5.4-pro"               32000
                       "mistralai/mistral-medium-3-5"     32000
                       "moonshotai/kimi-k3"               32000
                       ;; ids no catalog names get the default too
                       "anthropic/claude-fable-5.1"       32000
                       "openai/gpt-4o"                    32000}
   :zai               {"glm-5.3"                      32000
                       "glm-5.2"                      32000
                       "glm-4.7"                      32000}
   :moonshot          {"kimi-k3"                      32000
                       "kimi-k2.6"                    32000
                       "kimi-k2.7-code"               32000}
   :mistral           {"mistral-medium-3-5"           32000
                       "mistral-medium-latest"        32000}
   ;; no default cap (see vllm/vllm-request-body)
   :vllm              {"Qwen/Qwen3-32B"              omitted}})

(deftest ^:parallel chat-cap-matches-the-documented-table-test
  (testing "each surface sends the model's documented maximum, in that surface's own id spelling"
    (doseq [[surface models] expected-chat-caps
            [model expected] models]
      (testing (str surface " " model)
        (is (= expected (cap-for surface model)))))))

(deftest ^:parallel caller-cap-always-wins-test
  (testing "a task cap the caller names is sent verbatim, never widened to the model's documented maximum"
    (doseq [[surface models] expected-chat-caps
            model            (keys models)]
      (testing (str surface " " model)
        (is (= 512 (cap-for surface model {:max-tokens 512})))))))

(deftest ^:parallel forced-tool-call-without-a-caller-cap-gets-the-chat-cap-test
  (testing "the default cap clears the 2048 forced-tool-call floors, so the floor changes nothing"
    (are [surface model expected] (= expected (cap-for surface model {:schema {:type "object"}}))
      :openrouter "qwen/qwen3.8-max"         32000
      :openrouter "anthropic/claude-fable-5" 32000
      :openrouter "z-ai/glm-5.3"             32000
      :zai        "glm-5.3"                  32000
      :moonshot   "kimi-k3"                  32000
      :gemini     "google/gemini-3.7-flash"  32000))
  (testing "vLLM still sends no cap: a floor raises a caller's cap, it never adds one"
    (is (= omitted (cap-for :vllm "Qwen/Qwen3-32B" {:schema {:type "object"}})))))

(defn- registry-models
  "The default and mini model the provider registry names for `type-name`, nils dropped: Azure has no default
  (its model is a deployment name), and the single-model types have no cheaper tier."
  [type-name]
  (keep identity [(llm.provider/default-model type-name) (llm.provider/mini-model type-name)]))

(defn- catalog-pairs
  "Every `[surface id]` the shipped catalogs offer, in the spelling that surface's builder receives.
  Bedrock and Azure each serve two wire families, so their ids are split by the prefix that selects one."
  []
  (concat
   (for [id (concat (keys claude/supported-models) (registry-models "anthropic"))] [:anthropic id])
   (for [id (concat (keys openai/supported-models) (registry-models "openai"))] [:openai id])
   (for [id (concat (keys deepseek/supported-models) (registry-models "deepseek"))] [:deepseek id])
   (for [id (concat (keys moonshot/supported-models) (registry-models "moonshot"))] [:moonshot id])
   (for [id (concat (keys mistral/supported-models) (registry-models "mistral"))] [:mistral id])
   (for [id (concat (keys zai/supported-models) (registry-models "zai"))] [:zai id])
   (for [id (concat (keys openrouter/supported-models) (registry-models "openrouter"))] [:openrouter id])
   (for [id (concat (keys bedrock/supported-models) (registry-models "bedrock"))]
     [(if (str/starts-with? id "anthropic.") :bedrock-anthropic :bedrock-openai) id])
   ;; Azure lists no models; its context map is the closest thing to a catalog, and its keys are spelled the way
   ;; deployment names reach the builder.
   (for [id (keys @#'azure/model-context-windows)]
     [(if (str/starts-with? id "claude-") :azure-anthropic :azure-openai) id])
   (for [id (keys google.models/catalog)] [:gemini id])
   ;; Google's and the managed provider's catalogs are fixed in the registry. Google's Gemini ids reach the
   ;; builder whole; its Anthropic ids and the managed one lose the publisher segment on the way.
   (for [id (concat (map :id (llm.provider/fixed-models "google")) (registry-models "google"))]
     (if (str/starts-with? id "google/")
       [:gemini id]
       [:vertex-claude (llm.provider/model-ref->model id)]))
   (for [id (concat (map :id (llm.provider/fixed-models "metabase")) (registry-models "metabase"))]
     [:managed (llm.provider/model-ref->model id)])))

(deftest ^:parallel every-catalog-model-is-classified-test
  (testing "every model we ship has a deliberate expected cap, so a new catalog entry cannot slip in unclassified"
    ;; One-directional on purpose: expected-chat-caps also holds unknown-id and translation probes that no
    ;; catalog names, and those are the point of several of its rows.
    (let [classified (set (for [[surface models] expected-chat-caps
                                model            (keys models)]
                            [surface model]))]
      (doseq [pair (catalog-pairs)]
        (testing (pr-str pair)
          (is (contains? classified pair)))))))
