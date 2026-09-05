(ns metabase.metabot.self.google.stream-generate-content
  "Wire-format translation for Google's `streamGenerateContent` API.

  This is the native protocol for Gemini models on the Gemini Enterprise Agent Platform. AISDK parts become
  `GenerateContentRequest` bodies, and streamed `GenerateContentResponse` SSE events become AI SDK v5 chunks.

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.publishers.models/streamGenerateContent"
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- usage->aisdk-usage
  "Converts a `usageMetadata` block into the AISDK `:usage` shape.

  `promptTokenCount` is the total input count. `cachedContentTokenCount` is a part of that total, as with OpenAI, and
  not a separate bucket, as with Anthropic. Gemini reports thinking output separately as `thoughtsTokenCount`. Google
  bills it as output, thus it goes into :completionTokens. Implicit caching has no cache-write count, thus
  :cacheCreationTokens is always 0.

  `toolUsePromptTokenCount` counts the results of Google's server-side tools (code execution, URL context) fed back to
  the model as input. It is a bucket of its own, not a part of `promptTokenCount`, thus we sum it in, even though we
  don't currently support built-in server-side tools."
  [u]
  {:promptTokens        (+ (:promptTokenCount u 0)
                           (:toolUsePromptTokenCount u 0))
   :completionTokens    (+ (:candidatesTokenCount u 0)
                           (:thoughtsTokenCount u 0))
   :cacheCreationTokens 0
   :cacheReadTokens     (:cachedContentTokenCount u 0)})

;;; AISDK parts → Gemini contents

(def ^:private missing-thought-signature
  "Google's placeholder for a replayed functionCall part that has no real `thoughtSignature`.
  For example a made-up tool exchange, or history that we rebuilt from storage. Gemini 3.x rejects a functionCall
  replay in the current turn that has no signature. This placeholder skips that check.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thought-signatures"
  "skip_thought_signature_validator")

(defn- ->gemini-role
  "Maps a message role onto one of the two roles a Gemini allows: user or model."
  [role]
  (if (#{"assistant" "model"} (name role))
    "model"
    "user"))

(defn- ->text-parts
  "Converts message content into a vector of Gemini text parts."
  [content]
  (cond
    (and (string? content) (str/blank? content)) []
    (string? content)                            [{:text content}]
    :else                                        content))

(defn- merge-consecutive
  "Merges consecutive contents that have the same role into one content with the combined parts.
  Gemini expects user contents and model contents in alternation. Tool calls (role model) and their function responses
  (role user) already alternate. But a text part and the tool-input part after it are both role model, thus they must
  be in one content.

  Contents that end up with no parts are dropped, because Google rejects a `contents` entry whose `parts` array is
  empty. A blank message contributes no parts (see [[->text-parts]])."
  [contents]
  (into [] (comp (remove (comp empty? :parts))
                 (partition-by :role)
                 (map (fn [group]
                        {:role  (:role (first group))
                         :parts (into [] (mapcat :parts) group)})))
        contents))

(defn parts->contents
  "Converts a flat sequence of AISDK parts and user messages into Gemini API contents.
  Merges consecutive contents that have the same role.

  Gemini has no tool-call id on the wire. functionResponses match functionCalls by name and order, which the flat
  sequence of parts keeps. `functionResponse.name` is necessary, but a :tool-output part that we rebuilt from
  conversation history has no :function. For such a part, the name comes from the :tool-input part with the same id. A
  `thoughtSignature` from stream time (see [[->aisdk-chunks-xf]]) goes back on the replayed functionCall part, because
  Gemini 3.x rejects a replay in the current turn that has no signature."
  [parts]
  (let [id->name (into {}
                       (comp (filter #(= :tool-input (:type %)))
                             (map (juxt :id :function)))
                       parts)]
    (->> parts
         (mapv (fn [part]
                 (case (:type part)
                   :text        {:role  "model"
                                 ;; An empty text part carries nothing and Google rejects it.
                                 :parts (if (empty? (:text part))
                                          []
                                          [{:text (:text part)}])}
                   :tool-input  {:role  "model"
                                 :parts [{:functionCall     {:name (:function part)
                                                             :args (or (:arguments part) {})}
                                          :thoughtSignature (or (get-in part [:provider-metadata :google :thoughtSignature])
                                                                missing-thought-signature)}]}
                   :tool-output {:role  "user"
                                 :parts [{:functionResponse
                                          {:name     (or (:function part)
                                                         (id->name (:id part))
                                                         "unknown_function")
                                           :response {:output (or (get-in part [:result :output])
                                                                  (when-let [err (:error part)]
                                                                    (str "Error: " (:message err)))
                                                                  (pr-str (:result part)))}}}]}
                   ;; User messages pass through.
                   {:role  (->gemini-role (or (:role part) "user"))
                    :parts (->text-parts (:content part))})))
         merge-consecutive)))

;;; Tool definition format

(defn- tool->function-declaration
  "Converts a tool definition map to a Gemini `FunctionDeclaration`.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, and :fn.

  Uses `parametersJsonSchema`, which is standard JSON Schema, and not the older `parameters` field. The `Schema`
  object of that field is a subset of OpenAPI and rejects keywords such as `additionalProperties`."
  [tool]
  (let [{:keys [name description parameters]} (schema/tool-function tool)]
    {:name                 name
     :description          description
     :parametersJsonSchema parameters}))

;;; Request body

(mu/defn request-body
  "Builds the `streamGenerateContent` request body for an LLM request."
  [{:keys [system input tools schema tool_choice temperature max-tokens]} :- core/LLMRequestOpts]
  (let [fdecls     (when (seq tools) (mapv tool->function-declaration tools))
        gen-config (cond-> {}
                     max-tokens  (assoc :maxOutputTokens max-tokens)
                     temperature (assoc :temperature temperature))]
    (cond-> {:contents (parts->contents input)}
      (seq gen-config) (assoc :generationConfig gen-config)
      system (assoc :systemInstruction {:parts [{:text system}]})
      fdecls (assoc :tools [{:functionDeclarations fdecls}])

      (and fdecls tool_choice)
      (assoc :toolConfig {:functionCallingConfig {:mode (case (name tool_choice)
                                                          "auto"     "AUTO"
                                                          "required" "ANY")}})

      ;; Structured output: force a call to one tool that carries the schema. The Claude and Chat Completions adapters
      ;; do the same, thus the shared :tool-input extraction in call-llm-structured works.
      schema (assoc :tools      [{:functionDeclarations
                                  [{:name                 "structured_output"
                                    :description          "Output structured data"
                                    :parametersJsonSchema schema}]}]
                    :toolConfig {:functionCallingConfig {:mode                 "ANY"
                                                         :allowedFunctionNames ["structured_output"]}}))))

;;; Streaming response → AISDK v5 chunks

(def ^:private finish-reason-completed
  "The one `finishReason` that means the model said all it had to say."
  "STOP")

(def ^:private finish-reason-truncated
  "The `finishReason` for a turn the model cut off at its output-token limit."
  "MAX_TOKENS")

(def ^:private stop-reasons
  "Gemini `finishReason` → AI SDK v5 `FinishReason`.
  Covers both Gemini surfaces: every reason Vertex documents, plus four exclusive to the Gemini Developer API.  We
  only ever call Vertex today, so those four are here in case we ever add Gemini API support or in case these ever
  wind up making their way into Vertex.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/GenerateContentResponse#FinishReason
  https://ai.google.dev/api/generate-content#FinishReason"
  {finish-reason-completed     "stop"
   finish-reason-truncated     "length"
   "BLOCKLIST"                 "content-filter"
   "ESCALATION"                "content-filter" ; Gemini API only
   "IMAGE_PROHIBITED_CONTENT"  "content-filter"
   "IMAGE_RECITATION"          "content-filter"
   "IMAGE_SAFETY"              "content-filter"
   "LANGUAGE"                  "content-filter"
   "MODEL_ARMOR"               "content-filter"
   "PROHIBITED_CONTENT"        "content-filter"
   "RECITATION"                "content-filter"
   "SAFETY"                    "content-filter"
   "SPII"                      "content-filter"
   "IMAGE_OTHER"               "other"
   "NO_IMAGE"                  "other"
   "OTHER"                     "other"
   "FINISH_REASON_UNSPECIFIED" "other"
   "MALFORMED_FUNCTION_CALL"   "error"
   "MALFORMED_RESPONSE"        "error"          ; Gemini API only
   "MISSING_THOUGHT_SIGNATURE" "error"          ; Gemini API only
   "TOO_MANY_TOOL_CALLS"       "error"          ; Gemini API only
   "UNEXPECTED_TOOL_CALL"      "error"})

(def ^:private early-stops-without-error
  "The `finishReason` values that end the turn early but emit no :error chunk.
  The client already renders a message of its own for the AI SDK finish reason they translate to: \"length\" offers to
  continue the truncated answer, and \"content-filter\" says the response was filtered and suggests rephrasing. Every
  other early stop still needs an :error chunk, because nothing downstream would otherwise say what went wrong."
  (into #{}
        (keep (fn [[reason finish-reason]]
                (when (#{"length" "content-filter"} finish-reason)
                  reason)))
        stop-reasons))

(def ^:private finish-reasons-without-error
  "The `finishReason` values that emit no :error chunk: the early stops that speak for themselves, plus STOP, the one
  reason that is not a failure at all."
  (conj early-stops-without-error finish-reason-completed))

(defn- finish-reason-error
  "Returns the error text for a `finishReason` that needs one, or nil for the reasons that do not."
  [reason]
  (when-not (finish-reasons-without-error reason)
    (str "Gemini stopped early (" reason ")")))

(defn reasoning-model?
  "Whether `model-id` streams its reasoning back to us.
  No Gemini model does today: thinking arrives as parts marked `:thought`, which [[->aisdk-chunks-xf]] drops. Should
  the adapter start forwarding them, this is where the models that send them get named."
  [_model-id]
  false)

(defn ->aisdk-chunks-xf
  "Translates `streamGenerateContent` SSE events into AI SDK v5 protocol chunks.

  Each SSE event is a `GenerateContentResponse`:
    {:responseId \"...\"
     :modelVersion \"gemini-...\"
     :candidates [{:content {:role \"model\" :parts [{:text \"...\"} {:functionCall {:name ... :args ...}}]}
                   :finishReason \"STOP\"}]
     :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 5 ...}}

  Emits the same internal chunk types as the other adapters:
    :start, :text-start, :text-delta, :text-end,
    :tool-input-start, :tool-input-delta, :tool-input-available,
    :usage, :error

  Unlike Claude, there are no content-block start and stop events. Text streams as consecutive parts, and one open
  text block holds them all. Each functionCall part arrives with complete args, thus its start, delta, and available
  chunks go out together. Parts with `:thought true` (thinking summaries) are ignored, as in the other adapters. A
  `finishReason` closes the open text block and is added to the :usage chunk as :finish-reason and :raw-finish-reason;
  the reasons that need one also emit an :error chunk (see [[finish-reason-error]]). Usage is buffered, the last value
  wins, and it goes out once at the end of the stream, because an event in the middle can have partial usageMetadata."
  []
  (fn [rf]
    (let [message-id  (volatile! nil)
          model-name  (volatile! nil)
          text-id     (volatile! nil) ; Non-nil while a text block is open.
          usage-acc   (volatile! nil)
          stop-reason (volatile! nil)
          close-text! (fn [result]
                        (if-let [id @text-id]
                          (do (vreset! text-id nil)
                              (rf result {:type :text-end :id id}))
                          result))
          finish!     (fn [result reason]
                        (vreset! stop-reason reason)
                        (when-not (= reason finish-reason-completed)
                          (log/info "Gemini stopped early" {:finishReason reason}))
                        (let [result (close-text! result)]
                          (if-let [error-text (finish-reason-error reason)]
                            (rf result {:type :error :errorText error-text})
                            result)))
          emit-part   (fn [result {:keys [text functionCall thought thoughtSignature]}]
                        (cond
                          thought
                          result

                          functionCall
                          (let [tool-id (core/mkid)
                                ids     {:toolCallId tool-id :toolName (:name functionCall)}
                                ;; Gemini 3.x adds a thoughtSignature to functionCall parts, which
                                ;; must go back to Google on replay. Put it on the start chunk,
                                ;; thus it stays in the :tool-input part as :provider-metadata.
                                start   (cond-> (merge {:type :tool-input-start} ids)
                                          thoughtSignature
                                          (assoc :providerMetadata {:google {:thoughtSignature thoughtSignature}}))]
                            (-> (close-text! result)
                                (rf start)
                                (rf {:type           :tool-input-delta
                                     :toolCallId     tool-id
                                     :inputTextDelta (json/encode (or (:args functionCall) {}))})
                                (rf (merge {:type :tool-input-available} ids))))

                          ;; Open a text block only for text that is not empty, thus an empty part
                          ;; between tool calls does not divide them. In an open block, blank
                          ;; deltas pass through and keep the whitespace.
                          (some? text)
                          (if-let [id @text-id]
                            (rf result {:type :text-delta :id id :delta text})
                            (if (empty? text)
                              result
                              (let [id (core/mkid)]
                                (vreset! text-id id)
                                (-> result
                                    (rf {:type :text-start :id id})
                                    (rf {:type :text-delta :id id :delta text})))))

                          :else
                          result))]
      (fn
        ([result]
         ;; An early stop that emits no :error chunk still needs a :usage chunk when the stream carried no
         ;; usageMetadata, so a truncated or filtered turn is never misinterpreted as a complete answer. The
         ;; reasons that do emit an :error chunk already say what went wrong, so they get no synthetic usage.
         (let [reason @stop-reason
               usage  (or @usage-acc
                          (when (early-stops-without-error reason)
                            (usage->aisdk-usage nil)))]
           (-> result
               (close-text!)
               (cond-> usage
                 (rf (cond-> {:type  :usage
                              :usage usage
                              :id    @message-id
                              :model @model-name}
                       reason (assoc :finish-reason     (core/stop-reason->finish-reason stop-reasons reason)
                                     :raw-finish-reason reason))))
               (rf))))
        ([result {:keys [candidates usageMetadata responseId modelVersion promptFeedback error] :as _event}]
         (when (some? usageMetadata)
           (vreset! usage-acc (usage->aisdk-usage usageMetadata)))
         ;; modelVersion can appear on any event. Keep the last one for the :usage chunk.
         (when (some? modelVersion)
           (vreset! model-name modelVersion))
         (let [{:keys [content finishReason]} (first candidates)
               block-reason                   (:blockReason promptFeedback)]
           (cond-> result
             ;; Emit :start on the first event.
             (not @message-id)    (-> (u/prog1
                                        (vreset! message-id (or responseId (core/mkid))))
                                      (rf {:type :start :messageId @message-id}))
             (seq (:parts content)) (as-> res (reduce emit-part res (:parts content)))
             (some? finishReason) (finish! finishReason)
             ;; A blocked prompt ends the stream with no candidates, only promptFeedback.
             (some? block-reason) (-> (close-text!)
                                      (rf {:type      :error
                                           :errorText (str "Prompt blocked by Google: " block-reason)}))
             ;; An error envelope in the stream, e.g. a failure in the middle of the stream.
             (some? error)        (-> (close-text!)
                                      (rf {:type      :error
                                           :errorText (or (:message error) (pr-str error))})))))))))
