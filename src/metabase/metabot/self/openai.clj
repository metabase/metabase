(ns metabase.metabot.self.openai
  (:require
   [clojure.string :as str]
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

(def ^:private stop-reasons
  "Responses API `incomplete_details.reason` → AI SDK v5 `FinishReason`. Only an incomplete response carries a reason,
  so there is nothing here for a normal or tool-call finish."
  {"max_output_tokens" "length"
   "content_filter"    "content-filter"})

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
          ;; Function items are provisional until response.completed. Buffer the ordered suffix so
          ;; unsuccessful terminal outcomes can drop tools without reordering later text/reasoning.
          pending-chunks (volatile! [])
          completed-tool-ids (volatile! #{})
          clear!       (fn [result]
                         (u/prog1 result
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))
          emit!        (fn [result tool-id chunk]
                         (cond
                           (reduced? result) result
                           (or tool-id (seq @pending-chunks))
                           (u/prog1 result
                             (vswap! pending-chunks conj [tool-id chunk]))
                           :else (rf result chunk)))
          emit-rf!     (fn [result chunk]
                         (if (reduced? result) result (rf result chunk)))
          close!       (fn [result]
                         ;; only emit an end marker for chunk types we translate.
                         (let [tool-id @current-id
                               result  (if-let [end-type (case @current-type
                                                           :text          :text-end
                                                           :function_call :tool-input-available
                                                           :reasoning     :reasoning-end
                                                           nil)]
                                         (emit! result
                                                (when (= :function_call @current-type) tool-id)
                                                (merge {:type end-type} @payload))
                                         result)]
                           (when (= :function_call @current-type)
                             (vswap! completed-tool-ids conj tool-id))
                           (clear! result)))
          safe-close!  (fn [result]
                         ;; A function call is executable only after its own output_item.done. EOF or
                         ;; a transition to another item is evidence of truncation, not completion.
                         (if (= :function_call @current-type)
                           (clear! result)
                           (close! result)))
          resolve-tools! (fn [result successful?]
                           (let [result    (cond
                                             (= :function_call @current-type) (clear! result)
                                             @current-type                    (close! result)
                                             :else                            result)
                                 completed @completed-tool-ids
                                 result    (u/reduce-preserving-reduced
                                            (fn [result [tool-id chunk]]
                                              (if (or (nil? tool-id)
                                                      (and successful? (contains? completed tool-id)))
                                                (rf result chunk)
                                                result))
                                            result
                                            @pending-chunks)]
                             (vreset! pending-chunks [])
                             (vreset! completed-tool-ids #{})
                             result))
          interrupt!   (fn [result]
                         ;; An interrupted block is incomplete, so never synthesize its normal end marker.
                         ;; Release any safe buffered content while dropping every provisional tool chunk.
                         (let [result (clear! result)
                               result (u/reduce-preserving-reduced
                                       (fn [result [tool-id chunk]]
                                         (if tool-id result (rf result chunk)))
                                       result
                                       @pending-chunks)]
                           (vreset! pending-chunks [])
                           (vreset! completed-tool-ids #{})
                           result))
          close-for-event! (fn [result tool-done?]
                             (if (or (not= :function_call @current-type) tool-done?)
                               (close! result)
                               (safe-close! result)))]
      ;; some notes about the approach:
      ;; - most of message types carry similar payload, like id for messages, or id+name for tool calls
      ;; - this trick with u/prog1 was chosen deliberately, a few approaches were made and they all looked worse
      ;; - most of dispatch is inlined rather than separated as multimethods is not an overlook to make function
      ;;   smaller, I'd rather contain this hairyness in a single piece while it's possible
      (fn
        ([result]
         (let [result (-> (cond-> result
                            ;; Text/reasoning remain useful at EOF; an open function call does not.
                            @current-type (safe-close!))
                          (resolve-tools! false))]
           (if (reduced? result) result (rf result))))
        ([result {t :type :keys [response item delta error] :as chunk}]
         (if (= chunk core/interrupted-stream-event)
           (interrupt! result)
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
                                  :text          (or (:id item) (:item_id chunk) (:id chunk))
                                  :reasoning     (or (:id item) (:item_id chunk))
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
                              @current-id)))      (close-for-event!
                                                   (and (= t "response.output_item.done")
                                                        (= "function_call" (:type item))
                                                        (= chunk-id @current-id)))
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
                                                             (emit! (when (= :function_call @current-type) @current-id)
                                                                    (merge (case @current-type
                                                                             :text          {:type :text-start}
                                                                             :function_call {:type :tool-input-start}
                                                                             :reasoning     {:type :reasoning-start}
                                                                             nil)
                                                                           @payload)))
               ;; a 2nd+ summary part is a new paragraph within the same reasoning item
               (and (= t "response.reasoning_summary_part.added")
                    (= @current-type :reasoning)
                    (pos? (:summary_index chunk 0)))
               (emit! nil {:type :reasoning-delta :id @current-id :delta "\n\n"})

               ;; just a middle of a chunk — ignore deltas for types we don't translate
               (and delta
                    (translated-chunk-type? @current-type)) (emit! (when (= :function_call @current-type) @current-id)
                                                                   (case @current-type
                                                                     :text          {:type  :text-delta
                                                                                     :id    @current-id
                                                                                     :delta delta}
                                                                     :reasoning     {:type  :reasoning-delta
                                                                                     :id    @current-id
                                                                                     :delta delta}
                                                                     :function_call {:type           :tool-input-delta
                                                                                     :toolCallId     (:toolCallId @payload)
                                                                                     :inputTextDelta delta}))
               (= t "response.completed") (resolve-tools! true)
               (= t "response.incomplete") (resolve-tools! false)
               ;; `response.completed` and `response.incomplete` are both terminal events carrying final usage.
               ;; An incomplete response (e.g. truncated at max_output_tokens or stopped by a content filter)
               ;; still has valid partial output, so we record its usage rather than treating it as an error.
               (contains? #{"response.completed" "response.incomplete"} t)
               (emit-rf! (let [raw (get-in response [:incomplete_details :reason])]
                           (cond-> {:type  :usage
                                    :usage (openai-usage->aisdk-usage (:usage response))
                                    ;; non-standard extension, not in AISDK5
                                    :id    (:id response)
                                    :model @model-name}
                             raw (assoc :finish-reason     (core/stop-reason->finish-reason stop-reasons raw)
                                        :raw-finish-reason raw))))
               ;; `response.failed` is the Responses API's terminal failure event. Its error lives nested under
               ;; `response.error`, not in a top-level `error` event, so surface it explicitly.
               (= t "response.failed")            (resolve-tools! false)
               (and (= t "response.failed") (:usage response))
               (emit-rf! {:type  :usage
                          :usage (openai-usage->aisdk-usage (:usage response))
                          :id    (:id response)
                          :model @model-name})
               (= t "response.failed")            (emit-rf! {:type      :error
                                                             :errorText (or (get-in response [:error :message])
                                                                            (get-in response [:error :code])
                                                                            (tru "The model provider failed to complete the response"))})
               (= t "error")                      (resolve-tools! false)
               (= t "error")                      (emit-rf! {:type      :error
                                                             :errorText (or (:message error) (:message chunk))})))))))))

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
  [tool]
  (assoc (schema/tool-function tool) :type "function"))

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
  "OpenAI chat models offered in the Metabot model picker, keyed by model id.
  `list-models` returns the intersection of this map with the account's `/v1/models` catalog."
  {"gpt-5.6-sol"   {:display-name "GPT-5.6 Sol"   :context-window 922000}
   "gpt-5.6-terra" {:display-name "GPT-5.6 Terra" :context-window 922000}
   "gpt-5.6-luna"  {:display-name "GPT-5.6 Luna"  :context-window 922000}
   "gpt-5.5"       {:display-name "GPT-5.5"       :context-window 922000}
   "gpt-5.5-pro"   {:display-name "GPT-5.5 Pro"   :context-window 922000}
   "gpt-5.4"       {:display-name "GPT-5.4"       :context-window 922000}
   "gpt-5.4-pro"   {:display-name "GPT-5.4 Pro"   :context-window 922000}
   "gpt-5.4-mini"  {:display-name "GPT-5.4 Mini"  :context-window 272000}})

(defn context-window-tokens
  "The input context window for `model`, or nil when it isn't one we know."
  [model]
  (get-in supported-models [model :context-window]))

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
                                  (when-let [k (not-empty (:api-key credentials))]
                                    {:url     (:base-url credentials)
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
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request,
  and throws when they are missing. Also supports `:ai-proxy?`.
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  ([] (list-models {}))
  ([opts]
   {:models (->> (list-all-models opts)
                 (filter supported-model?)
                 (sort-by :id)
                 (mapv (fn [{:keys [id]}]
                         {:id id :display_name (get-in supported-models [id :display-name])})))}))

(defn- model-supports-temperature?
  "Whether `model` accepts an explicit `temperature` parameter.

  The GPT-5 family and the o-series reasoning models only support the default temperature."
  [model]
  (let [model (str/replace-first (str model) #"^openai\." "")]
    (not (or (str/starts-with? model "gpt-5")
             (re-find #"^o\d" model)))))

(defn reasoning-model?
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
  Opts map takes `:credentials` (`{:api-key ... :base-url ...}`) from the connection serving this request, and
  throws when they are missing.
  `:ai-proxy?` is not supported for OpenAI and throws when true."
  [{:keys [model credentials ai-proxy?] :as opts
    :or   {model "gpt-5.4"}} :- core/LLMRequestOpts]
  (when ai-proxy?
    (throw (ai-proxy-unsupported-ex)))
  (let [req (openai-request-body opts)]
    (try
      (let [api-key  (not-empty (:api-key credentials))
            auth     (core/resolve-auth "openai" "OpenAI"
                                        (when api-key
                                          {:url     (:base-url credentials)
                                           :headers {"Authorization" (str "Bearer " api-key)}})
                                        ai-proxy?)
            response (core/request auth
                                   {:method  :post
                                    :url     "/v1/responses"
                                    :as      :stream
                                    :headers {"Content-Type" "application/json"}
                                    :body    (json/encode req)})]
        ;; The SSE body is consumed lazily, after this `try` has exited — wrap
        ;; the reducible so mid-stream IO/timeout failures get the same
        ;; provider-friendly translation as request-time errors.
        (-> (core/sse-reducible (:body response))
            (debug/capture-stream {:provider "openai"
                                   :model    model
                                   :url      "/v1/responses"
                                   :request  req})
            (core/reducible-with-api-errors "openai" openai-error-msg)))
      (catch Exception e
        (core/rethrow-api-error! "openai" openai-error-msg e)))))

(defn openai
  "Call OpenAI API, return AISDK stream."
  [& args]
  (let [raw (apply openai-raw args)]
    (core/completion-safe-eduction (openai->aisdk-chunks-xf) raw)))
