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
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text          :text-end
                                                             :function_call :tool-input-available)}
                                                    @payload))
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
                            (keyword middle))
               chunk-id   (or (case chunk-type
                                ;; chunks that have natural id in API response go here
                                :function_call (:call_id item)
                                :text          (:id chunk)
                                nil)
                              @current-id
                              (core/mkid))]
           (cond-> result
             (= t "response.created")           (-> (rf {:type :start :messageId (:id response)})
                                                    (u/prog1
                                                      (vreset! model-name (:model response))))
             ;; time to finish previous chunk
             ;; this logic will skip most of the *.done types, but they seem to be always followed by one of those two?
             (or (= t "response.output_item.done")
                 (and @current-id
                      (not= chunk-id
                            @current-id)))      (close!)
             ;; start of a new chunk
             (= t "response.output_item.added") (-> (u/prog1
                                                      (vreset! current-type chunk-type)
                                                      (vreset! current-id chunk-id)
                                                      (vreset! payload
                                                               (case @current-type
                                                                 ;; no :type in payloads since we'll use that for finish msg too
                                                                 :text          {:id chunk-id}
                                                                 :function_call {:toolCallId chunk-id
                                                                                 :toolName   (:name item)}
                                                                 nil)))
                                                    (rf (merge (case @current-type
                                                                 :text          {:type :text-start}
                                                                 :function_call {:type :tool-input-start})
                                                               @payload)))
             ;; just a middle of a chunk
             delta                              (rf (case @current-type
                                                      :text          {:type  :text-delta
                                                                      :id    @current-id
                                                                      :delta delta}
                                                      :function_call {:type           :tool-input-delta
                                                                      :toolCallId     (:toolCallId @payload)
                                                                      :inputTextDelta delta}))
             (= (:type chunk)
                "response.completed")           (rf {:type  :usage
                                                     :usage (let [u (:usage response)]
                                                              {:promptTokens     (:input_tokens u 0)
                                                               :completionTokens (:output_tokens u 0)})
                                                     ;; non-standard extension, not in AISDK5
                                                     :id    (:id response)
                                                     :model @model-name})
             (= t "error")                      (rf {:type      :error
                                                     :errorText (or (:message error) (:message chunk))}))))))))

;;; AISDK parts → OpenAI Responses API input items

(defn parts->openai-input
  "Convert a sequence of AISDK parts into OpenAI Responses API input items.

  Input: flat sequence of AISDK parts and user messages.
  Output: OpenAI Responses API input array."
  [parts]
  (mapv (fn [part]
          (case (:type part)
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
            ;; User messages
            {:role    (name (or (:role part) "user"))
             :content (or (:content part) "")}))
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

(defn- openai-errors [res]
  (let [status    (long (:status res 0))
        error-msg (get-in res [:body :error :message])]
    (case status
      401 (tru "OpenAI API key expired or invalid")
      403 (tru "OpenAI API key has insufficient permissions")
      404 (tru "OpenAI API endpoint or model listing is unavailable")
      429 (tru "OpenAI API has rate limited us")
      500 (tru "OpenAI API is not working but not saying why")
      (if error-msg
        (tru "OpenAI API error (HTTP {0}): {1}" status error-msg)
        (tru "OpenAI API error (HTTP {0})" status)))))

(defn list-models
  "List available OpenAI models.
  No-arg uses the configured API key. Opts map supports `:api-key` and `:ai-proxy?`."
  ([] (list-models {}))
  ([{:keys [api-key ai-proxy?]}]
   (when (and api-key (str/blank? api-key))
     (throw (core/missing-api-key-ex "OpenAI")))
   (try
     (let [auth (core/resolve-auth "openai" "OpenAI"
                                   (when-let [k (or (not-empty api-key) (not-empty (llm/llm-openai-api-key)))]
                                     {:url     (llm/llm-openai-api-base-url)
                                      :headers {"Authorization" (str "Bearer " k)}})
                                   ai-proxy?)
           res  (core/request auth {:method  :get
                                    :url     "/v1/models"
                                    :as      :json
                                    :headers {"Content-Type" "application/json"}})]
       {:models (mapv (fn [model]
                        {:id           (:id model)
                         :display_name (:id model)})
                      (reverse (sort-by :created (get-in res [:body :data]))))})
     (catch Exception e
       (core/rethrow-api-error! "openai" openai-errors e)))))

(mu/defn openai-raw
  "Perform a streaming request to OpenAI Responses API."
  [{:keys [model system input tools schema tool_choice temperature max-tokens ai-proxy?]
    :or   {model "gpt-4.1-mini"}} :- core/LLMRequestOpts]
  (let [all-tools (or (when schema
                        ;; Structured output: force a tool call with the given JSON schema
                        [{:type        "function"
                          :name        "structured_output"
                          :description "Output structured data"
                          :parameters  schema}])
                      (when (seq tools) (mapv tool->openai tools)))
        req       (cond-> {:model        model
                           :stream       true
                           :store        false
                           :instructions system
                           :input        (parts->openai-input input)}
                    all-tools   (assoc :tool_choice (cond
                                                      schema      "required"
                                                      tool_choice tool_choice
                                                      :else       "auto")
                                       :tools       all-tools)
                    temperature (assoc :temperature temperature)
                    max-tokens  (assoc :max_tokens max-tokens))]
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
        (core/rethrow-api-error! "openai" openai-errors e)))))

(defn openai
  "Call OpenAI API, return AISDK stream."
  [& args]
  (let [raw (apply openai-raw args)]
    (eduction (openai->aisdk-chunks-xf) raw)))
