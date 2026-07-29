(ns metabase.metabot.self.openai
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.llm.settings :as llm]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(def ^:private translated-chunk-type?
  "Output item types we translate into AI SDK chunks."
  #{:text :function_call :reasoning})

(defn- openai-usage->aisdk-usage
  "Convert an OpenAI Responses API `usage` block into the AISDK `:usage` shape.

  Unlike Anthropic's disjoint input buckets (see [[metabase.metabot.self.claude/claude-usage->aisdk-usage]]), OpenAI
  reports cached tokens as a subset breakdown of the input total:

      input_tokens                             — total input, cached portion included
      input_tokens_details.cached_tokens       — the cached subset of input_tokens
      input_tokens_details.cache_write_tokens  — should always be 0 (see below)
      output_tokens                            — completion tokens

  cache_write_tokens is absent from the Responses API docs, but present in live responses. We pass it through
  as :cacheCreationTokens so a count would surface in usage tracking if OpenAI ever starts populating it.

  Nested *_details maps are otherwise dropped: the result must stay flat so downstream `merge-with +` usage
  accumulation is safe."
  [u]
  {:promptTokens        (:input_tokens u 0)
   :completionTokens    (:output_tokens u 0)
   :cacheCreationTokens (get-in u [:input_tokens_details :cache_write_tokens] 0)
   :cacheReadTokens     (get-in u [:input_tokens_details :cached_tokens] 0)})

(defn openai->aisdk-chunks-xf
  "Translates OpenAI /v1/responses streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   OpenAI Responses Format:
   - Each event: {:type \"response.output_text.delta\" :delta ...}
                 {:type \"response.output_item.added\" :item {:id :type :output ...}}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  []
  (fn [rf]
    ;; we've got lots of state since aisdk has lots of start/stop/etc messages that raw openai does not
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          close!       (fn [result]
                         ;; only emit an end marker for chunk types we translate.
                         (u/prog1 (if-let [end-type (case @current-type
                                                      :text          :text-end
                                                      :function_call :tool-input-available
                                                      :reasoning     :reasoning-end
                                                      nil)]
                                    (rf result (merge {:type end-type} @payload))
                                    result)
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      ;; some notes about the approach:
      ;; - most of message types carry similar payload, like id for messages, or id+name for tool calls
      ;; - this trick with u/prog1 was chosen deliberately, a few approaches were made and they all looked worse
      ;; - most of dispatch is inlined rather than separated as multimethods is not an overlook to make function
      ;;   smaller, I'd rather contain this hairyness in a single piece while it's possible
      (fn
        ([result]
         (cond-> result
           ;; in case the response was incomplete we'll close up latest type
           @current-type (close!)
           true          (rf)))
        ([result {t :type :keys [response item delta error] :as chunk}]
         (let [middle     (second (str/split t #"\."))
               chunk-type (case middle
                            "output_item"             (case (:type item)
                                                        "message" :text
                                                        (keyword (:type item)))
                            "content_part"            :text
                            "output_text"             :text
                            "function_call_arguments" :function_call
                            "reasoning_summary_text"  :reasoning
                            "reasoning_summary_part"  :reasoning
                            (keyword middle))
               chunk-id   (or (case chunk-type
                                ;; chunks that have natural id in API response go here
                                :function_call (:call_id item)
                                :text          (:id chunk)
                                :reasoning     (:id item)
                                nil)
                              @current-id
                              (core/mkid))]
           (cond-> result
             (= t "response.created")           (-> (rf {:type :start :messageId (:id response)})
                                                    (u/prog1
                                                      (vreset! model-name (:model response))))
             ;; a finished reasoning item carries the encrypted content that lets us
             ;; replay it next round-trip — ride it out on the reasoning-end's metadata
             (and (= t "response.output_item.done")
                  (= "reasoning" (:type item))
                  (= @current-id (:id item))
                  (:encrypted_content item))
             (u/prog1
               (vswap! payload assoc :providerMetadata
                       {:openai {:itemId           (:id item)
                                 :encryptedContent (:encrypted_content item)}}))

             ;; time to finish previous chunk
             ;; this logic will skip most of the *.done types, but they seem to be always followed by one of those two?
             (or (= t "response.output_item.done")
                 (and @current-id
                      (not= chunk-id
                            @current-id)))      (close!)
             ;; start of a new chunk — only for types we translate
             (and (= t "response.output_item.added")
                  (translated-chunk-type? chunk-type)) (-> (u/prog1
                                                             (vreset! current-type chunk-type)
                                                             (vreset! current-id chunk-id)
                                                             (vreset! payload
                                                                      (case @current-type
                                                                        ;; no :type in payloads since we'll use that for finish msg too
                                                                        :text          {:id chunk-id}
                                                                        :function_call {:toolCallId chunk-id
                                                                                        :toolName   (:name item)}
                                                                        :reasoning     {:id chunk-id}
                                                                        nil)))
                                                           (rf (merge (case @current-type
                                                                        :text          {:type :text-start}
                                                                        :function_call {:type :tool-input-start}
                                                                        :reasoning     {:type :reasoning-start}
                                                                        nil)
                                                                      @payload)))
             ;; a 2nd+ summary part is a new paragraph within the same reasoning item
             (and (= t "response.reasoning_summary_part.added")
                  (= @current-type :reasoning)
                  (pos? (:summary_index chunk 0)))
             (rf {:type :reasoning-delta :id @current-id :delta "\n\n"})

             ;; just a middle of a chunk — ignore deltas for types we don't translate
             (and delta
                  (translated-chunk-type? @current-type)) (rf (case @current-type
                                                                :text          {:type  :text-delta
                                                                                :id    @current-id
                                                                                :delta delta}
                                                                :reasoning     {:type  :reasoning-delta
                                                                                :id    @current-id
                                                                                :delta delta}
                                                                :function_call {:type           :tool-input-delta
                                                                                :toolCallId     (:toolCallId @payload)
                                                                                :inputTextDelta delta}))
             ;; `response.completed` and `response.incomplete` are both terminal events carrying final usage.
             ;; An incomplete response (e.g. truncated at max_output_tokens or stopped by a content filter)
             ;; still has valid partial output, so we record its usage rather than treating it as an error.
             (contains? #{"response.completed" "response.incomplete"} t)
             (rf {:type  :usage
                  :usage (openai-usage->aisdk-usage (:usage response))
                  ;; non-standard extension, not in AISDK5
                  :id    (:id response)
                  :model @model-name})
             ;; `response.failed` is the Responses API's terminal failure event. Its error lives nested under
             ;; `response.error`, not in a top-level `error` event, so surface it explicitly.
             (= t "response.failed")            (rf {:type      :error
                                                     :errorText (or (get-in response [:error :message])
                                                                    (get-in response [:error :code])
                                                                    (tru "The model provider failed to complete the response"))})
             (= t "error")                      (rf {:type      :error
                                                     :errorText (or (:message error) (:message chunk))}))))))))

;;; AISDK parts → OpenAI Responses API input items

(defn parts->openai-input
  "Convert a sequence of AISDK parts into OpenAI Responses API input items.

  Input: flat sequence of AISDK parts and user messages.
  Output: OpenAI Responses API input array."
  [parts]
  (into []
        (keep (fn [part]
                (case (:type part)
                  ;; with store:false the API keeps nothing server-side, so reasoning
                  ;; items ride along as encrypted content ahead of their tool calls;
                  ;; parts without it (bare summaries, foreign providers) drop
                  :reasoning   (when-let [content (get-in part [:provider-metadata :openai :encryptedContent])]
                                 {:type              "reasoning"
                                  :id                (or (get-in part [:provider-metadata :openai :itemId])
                                                         (:id part))
                                  :summary           []
                                  :encrypted_content content})
                  :text        {:type    "message"
                                :role    "assistant"
                                :content [{:type "output_text"
                                           :text (:text part)}]}
                  :tool-input  {:type      "function_call"
                                :call_id   (:id part)
                                :name      (:function part)
                                :arguments (let [args (:arguments part)]
                                             (if (string? args) args (json/encode args)))}
                  :tool-output {:type    "function_call_output"
                                :call_id (:id part)
                                :output  (or (get-in part [:result :output])
                                             (when-let [err (:error part)]
                                               (str "Error: " (:message err)))
                                             (pr-str (:result part)))}
                  ;; user messages
                  {:role    (name (or (:role part) "user"))
                   :content (or (:content part) "")})))
        parts))

;;; Tool definition format

(defn- tool->openai
  "Convert a tool definition map to OpenAI Responses API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params                     (schema/filter-schema-by-features params)
        doc                        (if (str/starts-with? (or doc "") "Inputs: ")
                                     ;; strip that stuff we're appending in mu/defn
                                     (second (str/split doc #"\n\n  " 2))
                                     doc)]
    {:type        "function"
     :name        tool-name
     :description doc
     :parameters  (mjs/transform params {:additionalProperties false})}))

(defn- ai-proxy-unsupported-ex []
  (ex-info (tru "AI proxy is not supported for OpenAI")
           {:api-error  true
            :error-code :proxy-unsupported}))

(defn- openai-error-msg
  "Canonical, status-specific OpenAI error message."
  [res]
  (let [status (long (:status res 0))]
    (case status
      401 (tru "OpenAI API key expired or invalid")
      403 (tru "OpenAI API key has insufficient permissions")
      404 (tru "OpenAI API endpoint or model listing is unavailable")
      429 (tru "OpenAI API has rate limited us")
      500 (tru "OpenAI API is not working but not saying why")
      (tru "OpenAI API error (HTTP {0})" status))))

(def ^:private supported-models
  "OpenAI chat models offered in the Metabot model picker, as a map of model id -> display name.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"gpt-5.6-sol"   "GPT-5.6 Sol"
   "gpt-5.6-terra" "GPT-5.6 Terra"
   "gpt-5.6-luna"  "GPT-5.6 Luna"
   "gpt-5.5"       "GPT-5.5"
   "gpt-5.5-pro"   "GPT-5.5 Pro"
   "gpt-5.4"       "GPT-5.4"
   "gpt-5.4-pro"   "GPT-5.4 Pro"
   "gpt-5.4-mini"  "GPT-5.4 Mini"})

(defn- supported-model?
  "Whether a `/v1/models` catalog entry is one of the [[supported-models]]."
  [{:keys [id]}]
  (contains? supported-models id))

(defn- list-all-models
  "Fetch the full OpenAI model catalog (`GET /v1/models`).
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  [{:keys [credentials ai-proxy?]}]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (try
    (let [auth (core/resolve-auth "openai" "OpenAI"
                                  (when-let [k (or (not-empty (:api-key credentials))
                                                   (not-empty (llm/llm-openai-api-key)))]
                                    {:url     (llm/llm-openai-api-base-url)
                                     :headers {"Authorization" (str "Bearer " k)}})
                                  ai-proxy?)
          res  (core/request auth {:method  :get
                                   :url     "/v1/models"
                                   :as      :json
                                   :headers {"Content-Type" "application/json"}})]
      (get-in res [:body :data]))
    (catch Exception e
      (core/rethrow-api-error! "openai" openai-error-msg e))))

(defn list-models
  "List the OpenAI chat models supported by this adapter (see [[supported-models]]).
  No-arg uses the configured API key. Opts map supports `:credentials` (`{:api-key ...}`) and `:ai-proxy?`.
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id]}]
                         {:id id :display_name (supported-models id)})))}))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter.

  The GPT-5 family and the o-series reasoning models only support the default temperature."
  [model]
  (let [model (str/replace-first (str model) #"^openai\." "")]
    (not (or (str/starts-with? model "gpt-5")
             (re-find #"^o\d" model)))))

(defn- reasoning-model?
  "Whether `model` is a reasoning model that can emit reasoning summaries — the
  same GPT-5 / o-series set that rejects an explicit temperature."
  [model]
  (not (model-supports-temperature? model)))

(mu/defn openai-request-body
  "Build the OpenAI Responses API request body for an LLM request."
  [{:keys [model system input tools schema tool_choice temperature max-tokens reasoning?]
    :or   {model "gpt-5.4" reasoning? true}} :- core/LLMRequestOpts]
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
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  [{:keys [model ai-proxy?] :as opts
    :or   {model "gpt-5.4"}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (openai-request-body opts)]
    (try
      (let [api-key  (not-empty (llm/llm-openai-api-key))
            auth     (core/resolve-auth "openai" "OpenAI"
                                        (when api-key
                                          {:url     (llm/llm-openai-api-base-url)
                                           :headers {"Authorization" (str "Bearer " api-key)}})
                                        ai-proxy?)
            response (core/request auth
                                   {:method  :post
                                    :url     "/v1/responses"
                                    :as      :stream
                                    :headers {"Content-Type" "application/json"}
                                    :body    (json/encode req)})]
        (-> (core/sse-reducible (:body response))
            (debug/capture-stream {:provider "openai"
                                   :model    model
                                   :url      "/v1/responses"
                                   :request  req})))
      (catch Exception e
        (core/rethrow-api-error! "openai" openai-error-msg e)))))

(defn openai
  "Call OpenAI API, return AISDK stream."
  [& args]
  (let [raw (apply openai-raw args)]
    (eduction (openai->aisdk-chunks-xf) raw)))
