(ns metabase.metabot.self.openai
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu])
  (:import
   (metabase.metabot.providers.openai ResponsesInput ResponsesTranslator)))

(set! *warn-on-reflection* true)

(defn openai->aisdk-chunks-xf
  "Translates OpenAI /v1/responses streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   The translation itself is [[ResponsesTranslator]]."
  []
  (core/translator-xf
   #(ResponsesTranslator. core/mkid
                          (fn [] (tru "The model provider failed to complete the response")))))

;;; AISDK parts → OpenAI Responses API input items

(defn parts->openai-input
  "Convert a sequence of AISDK parts into OpenAI Responses API input items; the conversion itself is
  [[ResponsesInput]]."
  [parts]
  (ResponsesInput/fromClj parts json/encode))

;;; Tool definition format

(defn- tool->openai
  "Convert a tool definition map to OpenAI Responses API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [tool]
  (assoc (schema/tool-function tool) :type "function"))

(def ^:private default-model "gpt-5.4")

(def ^:private provider
  (adapter/provider
   {:slug              "openai"
    :display-name      "OpenAI"
    :error-fallback    #(tru "OpenAI API error (HTTP {0})" %)
    :errors            {401 #(tru "OpenAI API key expired or invalid")
                        403 #(tru "OpenAI API key has insufficient permissions")
                        404 #(tru "OpenAI API endpoint or model listing is unavailable")
                        429 #(tru "OpenAI API has rate limited us")
                        500 #(tru "OpenAI API is not working but not saying why")}}))

(def supported-models
  "OpenAI chat models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"gpt-6-astra"   {:display-name "GPT-6 Astra"   :context-window 922000}
   "gpt-5.6-sol"   {:display-name "GPT-5.6 Sol"   :context-window 922000}
   "gpt-5.6-terra" {:display-name "GPT-5.6 Terra" :context-window 922000}
   "gpt-5.6-luna"  {:display-name "GPT-5.6 Luna"  :context-window 922000}
   "gpt-5.5"       {:display-name "GPT-5.5"       :context-window 922000}
   "gpt-5.5-pro"   {:display-name "GPT-5.5 Pro"   :context-window 922000}
   "gpt-5.4"       {:display-name "GPT-5.4"       :context-window 922000}
   "gpt-5.4-pro"   {:display-name "GPT-5.4 Pro"   :context-window 922000}
   "gpt-5.4-mini"  {:display-name "GPT-5.4 Mini"  :context-window 272000}})

(mu/defn context-window-tokens :- [:maybe :int]
  "The input context window for `model`, or nil when it isn't one we know."
  [model :- [:maybe :string]]
  (get-in supported-models [model :context-window]))

(mu/defn list-models :- adapter/ModelListing
  "List the OpenAI chat models supported by this adapter, by intersecting [[supported-models]] with the
  account's `/v1/models` catalog.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing.
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  ([] (list-models {}))
  ([opts :- adapter/ListOpts]
   (adapter/model-listing supported-models
                          (adapter/fetch-catalog provider opts "/v1/models"))))

(defn- strip-vendor-prefix
  "`model` lowercased and without an optional vendor prefix (e.g. Bedrock's `openai.`).

  Lowercasing lets the model-derived predicates hold for Azure's admin-cased deployment names."
  [model]
  (str/replace-first (u/lower-case-en (str model)) #"^openai\." ""))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter.

  The GPT-5 and GPT-6 families and the o-series reasoning models only support the default temperature."
  [model]
  (let [model (strip-vendor-prefix model)]
    (not (or (re-find #"^gpt-[56]" model)
             (re-find #"^o\d" model)))))

(defn reasoning-model?
  "Whether `model` is a reasoning model that can emit reasoning summaries — the
  same GPT-5 / GPT-6 / o-series set that rejects an explicit temperature."
  [model]
  (not (model-supports-temperature? model)))

(mu/defn streams-reasoning? :- :boolean
  "Registry capability. OpenAI answers from the model name."
  [{:keys [model]} :- adapter/ResolvedRef]
  (reasoning-model? model))

(mu/defn openai-request-body
  "Build the OpenAI Responses API request body for an LLM request."
  [{:keys [model system input tools schema tool_choice temperature max-tokens reasoning?]
    :or   {model default-model reasoning? true}} :- core/LLMRequestOpts]
  (let [input     (cond->> input
                    (not reasoning?) (remove #(= :reasoning (:type %))))
        all-tools (or (when schema
                        ;; Structured output: force a tool call with the given JSON schema
                        [{:type        "function"
                          :name        "structured_output"
                          :description "Output structured data"
                          :parameters  schema}])
                      (when (seq tools) (mapv tool->openai tools)))]
    (cond-> {:model        model
             :stream       true
             :store        false
             :instructions system
             :input        (parts->openai-input input)}
      all-tools   (assoc :tool_choice (cond
                                        schema      "required"
                                        tool_choice tool_choice
                                        :else       "auto")
                         :tools       all-tools)
      max-tokens  (assoc :max_output_tokens max-tokens)

      ;; encrypted_content lets us replay reasoning items across tool-call
      ;; round-trips despite store:false — see [[parts->openai-input]]
      (and reasoning? (reasoning-model? model))
      (assoc :reasoning {:summary "auto"}
             :include   ["reasoning.encrypted_content"])

      (and temperature (model-supports-temperature? model))
      (assoc :temperature temperature))))

(mu/defn openai-raw
  "Perform a streaming request to OpenAI Responses API.
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  [{:keys [model] :as opts
    :or   {model default-model}} :- core/LLMRequestOpts]
  (let [opts (assoc opts :model model)]
    (adapter/stream! provider opts
                     {:path "/v1/responses"
                      :body (openai-request-body opts)})))

(defn openai
  "Call OpenAI API, return AISDK stream."
  [& args]
  (let [raw (apply openai-raw args)]
    (eduction (openai->aisdk-chunks-xf) raw)))
