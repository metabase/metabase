(ns metabase.metabot.self.claude
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
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

(defn claude->aisdk-chunks-xf
  "Translates Claude /v1/messages streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   Claude Streaming Format:
   - Each event: {:type \"message_start\" :message {...}}
                 {:type \"content_block_start\" :index 0 :content_block {:type \"text\"}}
                 {:type \"content_block_delta\" :index 0 :delta {:type \"text_delta\" :text \"...\"}}
                 {:type \"content_block_stop\" :index 0}
                 {:type \"message_delta\" :delta {:stop_reason \"end_turn\"}}
                 {:type \"message_stop\"}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  []
  (fn [rf]
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          message-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          ;; Track the latest usage we've seen (from any event) and whether we
          ;; already emitted it. Claude reports usage at message_start and
          ;; message_delta with cumulative values — we only emit at message_delta
          ;; normally, but if the stream is interrupted we flush the last known
          ;; usage in the completion arity so we don't lose data entirely.
          last-usage   (volatile! nil)
          close!       (fn [result]
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text     :text-end
                                                             :tool_use :tool-input-available)}
                                                    @payload))
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      (fn
        ([result]
         (cond-> result
           ;; close up latest type if incomplete
           @current-type (close!)
           ;; flush last-known usage if stream ended before message_delta
           @last-usage   (rf {:type  :usage
                              :usage {:promptTokens     (:input_tokens @last-usage 0)
                                      :completionTokens (:output_tokens @last-usage 0)}
                              :id    @message-id
                              :model @model-name})
           true          (rf)))
        ([result {t :type :keys [message content_block delta error] :as chunk}]
         (let [block-type (when content_block
                            (keyword (:type content_block)))
               chunk-id   (or (:id content_block) @current-id (core/mkid))]
           (cond-> result
             ;; start of message
             (= t "message_start")       (-> (rf {:type :start :messageId (:id message)})
                                             (u/prog1
                                               (vreset! message-id (:id message))
                                               (vreset! model-name (:model message))
                                               (vreset! last-usage (:usage message))))
             ;; start of new content block
             (= t "content_block_start") (-> (u/prog1
                                               (vreset! current-type block-type)
                                               (vreset! current-id chunk-id)
                                               (vreset! payload
                                                        (case block-type
                                                          :text     {:id chunk-id}
                                                          :tool_use {:toolCallId chunk-id
                                                                     :toolName   (:name content_block)}
                                                          nil)))
                                             (rf (merge (case block-type
                                                          :text     {:type :text-start}
                                                          :tool_use {:type :tool-input-start})
                                                        @payload)))

             ;; content block delta
             (= t "content_block_delta") (rf (case (:type delta)
                                               "text_delta"       {:type  :text-delta
                                                                   :id    (:id @payload)
                                                                   :delta (:text delta)}
                                               "input_json_delta" {:type           :tool-input-delta
                                                                   :toolCallId     (:toolCallId @payload)
                                                                   :inputTextDelta (:partial_json delta)}))

             ;; end of content block
             (= t "content_block_stop") (close!)
             ;; Claude reports usage at both message_start and message_delta,
             ;; but message_delta values are cumulative and include the earlier
             ;; counts.
             ;; https://platform.claude.com/docs/en/build-with-claude/streaming#event-types
             (= t "message_delta")      (u/prog1
                                          (vreset! last-usage (:usage chunk)))
             ;; end of message
             (= t "message_stop")       identity
             ;; catch errors if any
             (= t "error")              (rf {:type      :error
                                             :errorText (:message error)}))))))))

;;; AISDK parts → Claude messages

(defn- ->content-blocks
  "Coerce content into a sequence of Claude content blocks."
  [content]
  (cond
    (and (string? content) (str/blank? content)) []
    (string? content) [{:type "text" :text content}]
    :else content))

(defn- merge-consecutive
  "Merge consecutive assistant messages into a single message with combined content.
  Claude API doesn't allow consecutive messages with the same role."
  [messages]
  (into [] (comp (partition-by :role)
                 (mapcat (fn [group]
                           [{:role    (:role (first group))
                             :content (into [] (mapcat (comp ->content-blocks :content)) group)}])))
        messages))

(defn parts->claude-messages
  "Convert a sequence of AISDK parts into Claude API messages.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :result ...}

  Output: Claude messages with tool_use/tool_result content blocks, consecutive
  assistant messages merged."
  [parts]
  (->> parts
       (mapv (fn [part]
               (case (:type part)
                 :text        {:role    "assistant"
                               :content (:text part)}
                 :tool-input  {:role    "assistant"
                               :content [{:type  "tool_use"
                                          :id    (:id part)
                                          :name  (:function part)
                                          :input (or (:arguments part) {})}]}
                 :tool-output {:role    "user"
                               :content [{:type        "tool_result"
                                          :tool_use_id (:id part)
                                          :content     (or (get-in part [:result :output])
                                                           (when-let [err (:error part)]
                                                             (str "Error: " (:message err)))
                                                           (pr-str (:result part)))}]}
                 ;; User messages pass through
                 {:role    (name (or (:role part) "user"))
                  :content (:content part)})))
       merge-consecutive
       vec))

;;; Tool definition format

(defn- tool->claude
  "Convert a tool definition map to Claude API format.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params                     (schema/filter-schema-by-features params)
        doc                        (if (str/starts-with? (or doc "") "Inputs: ")
                                    ;; strip that stuff we're appending in mu/defn
                                     (second (str/split doc #"\n\n  " 2))
                                     doc)]
    {:name         (or tool-name "unknown")
     :description  doc
     :input_schema (mjs/transform params {:additionalProperties false})}))

(defn- add-tools-cache-breakpoint
  "Attach an ephemeral cache_control marker to the last tool in `tools`.
  Anthropic caches everything in the request up to and including the block with
  `cache_control`, so a single breakpoint on the final tool covers the whole
  tool list."
  [tools]
  (if (seq tools)
    (update tools (dec (count tools)) assoc :cache_control {:type "ephemeral"})
    tools))

(defn- anthropic-errors [res]
  (let [status    (long (:status res 0))
        error-msg (get-in res [:body :error :message])]
    (case status
      401 (tru "Anthropic API key expired or invalid")
      403 (tru "Anthropic API key has insufficient permissions")
      404 (tru "Anthropic API endpoint is unavailable or the model was not found")
      413 (tru "Anthropic API rejected our request because it was too large")
      429 (tru "Anthropic API has rate limited us")
      500 (tru "Anthropic API is not working but not saying why")
      529 (tru "Anthropic API is overloaded and is asking us to wait")
      (if error-msg
        (tru "Anthropic API error (HTTP {0}): {1}" status error-msg)
        (tru "Anthropic API error (HTTP {0})" status)))))

(defn list-models
  "List available Anthropic models.
  No-arg uses the configured API key. Opts map supports `:api-key` and `:ai-proxy?`."
  ([] (list-models {}))
  ([{:keys [api-key ai-proxy?]}]
   (when (and api-key (str/blank? api-key))
     (throw (core/missing-api-key-ex "Anthropic")))
   (try
     (let [auth   (core/resolve-auth "anthropic" "Anthropic"
                                     (when-let [k (or (not-empty api-key) (not-empty (llm/llm-anthropic-api-key)))]
                                       {:url     (llm/llm-anthropic-api-base-url)
                                        :headers {"x-api-key" k}})
                                     ai-proxy?)
           res    (core/request auth {:method  :get
                                      :url     "/v1/models"
                                      :headers {"anthropic-version" "2023-06-01"}})
           body   (json/decode+kw (:body res))
           models (reverse (sort-by :created_at (:data body)))]
       {:models (map #(select-keys % [:id :display_name]) models)})
     (catch Exception e
       (core/rethrow-api-error! "anthropic" anthropic-errors e)))))

(mu/defn claude-raw
  "Perform a streaming request to Claude API."
  [{:keys [model system input tools schema tool_choice temperature max-tokens ai-proxy?]
    :or   {model "claude-haiku-4-5"}} :- core/LLMRequestOpts]
  (let [messages  (parts->claude-messages input)
        all-tools (when (seq tools) (mapv tool->claude tools))
        all-tools (if (and all-tools (not schema))
                    (add-tools-cache-breakpoint all-tools)
                    all-tools)
        req       (cond-> {:model         model
                           :max_tokens    (or max-tokens 4096)
                           :stream        true
                           :messages      messages}
                    system            (assoc :system system)
                    all-tools         (assoc :tools all-tools)
                    (and all-tools
                         tool_choice) (assoc :tool_choice (case (name tool_choice)
                                                            "auto"     {:type "auto"}
                                                            "required" {:type "any"}))
                    temperature       (assoc :temperature temperature)
                    schema            (assoc :tool_choice {:type "tool"
                                                           :name "structured_output"}
                                             :tools [{:name         "structured_output"
                                                      :description  "Output structured data"
                                                      :input_schema schema}]))]
    (with-span :info {:name       :metabot.claude/request
                      :model      model
                      :msg-count  (count input)
                      :tool-count (count tools)}
      (try
        (let [api-key  (not-empty (llm/llm-anthropic-api-key))
              auth     (core/resolve-auth "anthropic" "Anthropic"
                                          (when api-key
                                            {:url     (llm/llm-anthropic-api-base-url)
                                             :headers {"x-api-key" api-key}})
                                          ai-proxy?)
              response (core/request auth
                                     {:method  :post
                                      :url     "/v1/messages"
                                      :as      :stream
                                      :headers {"anthropic-version" "2023-06-01"
                                                "content-type"      "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "anthropic"
                                     :model    model
                                     :url      "/v1/messages"
                                     :request  req})))
        (catch Exception e
          (core/rethrow-api-error! "anthropic" anthropic-errors e))))))

(defn claude
  "Call Claude API, return AISDK stream"
  [& args]
  (let [raw (apply claude-raw args)]
    (eduction (claude->aisdk-chunks-xf) raw)))

(comment
  ;; Now just use standard `into` - no core.async needed!
  (def q (into [] (claude-raw {:input [{:role "user" :content "How are you feeling today?"}]})))

  (into [] (comp (claude->aisdk-chunks-xf) core/aisdk-xf) q))
