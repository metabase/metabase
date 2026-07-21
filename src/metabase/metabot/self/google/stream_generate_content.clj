(ns metabase.metabot.self.google.stream-generate-content
  "Wire-format translation for Google's `streamGenerateContent` API — the native protocol for Gemini
  models on the Gemini Enterprise Agent Platform (formerly Vertex AI).

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.publishers.models/streamGenerateContent

  This namespace is pure translation: AISDK parts → `GenerateContentRequest` bodies, and streamed
  `GenerateContentResponse` SSE events → AI SDK v5 chunks. Auth, endpoint URLs, and the HTTP calls
  live in [[metabase.metabot.self.google]], which owns everything provider-level so future protocol
  namespaces (Anthropic via `streamRawPredict`, open-weight models via Chat Completions) can share
  them."
  (:require
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.schema :as schema]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- usage->aisdk-usage
  "Convert a `usageMetadata` block into the AISDK `:usage` shape.

  `promptTokenCount` is the total input count, with `cachedContentTokenCount` a subset breakdown of
  it (OpenAI-style subset semantics, unlike Anthropic's disjoint buckets). Gemini reports thinking
  output separately as `thoughtsTokenCount`; it is billed as output, so it is folded into
  :completionTokens. Implicit caching has no cache-write count, so :cacheCreationTokens is always 0."
  [u]
  {:promptTokens        (:promptTokenCount u 0)
   :completionTokens    (+ (:candidatesTokenCount u 0)
                           (:thoughtsTokenCount u 0))
   :cacheCreationTokens 0
   :cacheReadTokens     (:cachedContentTokenCount u 0)})

;;; AISDK parts → Gemini contents

(def ^:private missing-thought-signature
  "Google's documented placeholder signature for replayed functionCall parts whose real
  `thoughtSignature` is unavailable — fabricated tool exchanges (e.g. the SQL profile's seeded
  history) and history rebuilt from storage, where the captured signature doesn't survive.
  Gemini 3.x rejects current-turn functionCall replays without a signature; this bypasses that
  validation. https://ai.google.dev/gemini-api/docs/thought-signatures"
  "context_engineering_is_the_way_to_go")

(defn- ->gemini-role
  [role]
  (if (= (name role) "assistant") "model" (name role)))

(defn- ->text-parts
  "Coerce message content into a vector of Gemini text parts."
  [content]
  (cond
    (and (string? content) (str/blank? content)) []
    (string? content)                            [{:text content}]
    :else                                        content))

(defn- merge-consecutive
  "Merge consecutive contents with the same role into one content with combined parts.
  Gemini expects alternating user/model contents; tool calls (role model) followed by their
  function responses (role user) already alternate, but e.g. a text part followed by a tool-input
  part are both role model and must share one content."
  [contents]
  (into [] (comp (partition-by :role)
                 (map (fn [group]
                        {:role  (:role (first group))
                         :parts (into [] (mapcat :parts) group)})))
        contents))

(defn parts->contents
  "Convert a sequence of AISDK parts into Gemini API contents.

  Input: flat sequence of AISDK parts and user messages:
    {:role :user, :content \"...\"}
    {:type :text, :text \"...\"}
    {:type :tool-input, :id ..., :function ..., :arguments ...}
    {:type :tool-output, :id ..., :function ..., :result ...}

  Output: Gemini contents with functionCall/functionResponse parts, consecutive same-role contents
  merged. Gemini has no tool-call id on the wire — functionResponses correlate with functionCalls
  by name and order, which the flat part sequence already preserves. `functionResponse.name` is
  required, but :tool-output parts rebuilt from conversation history carry no :function (only the
  Chat Completions-style tool_call_id survives storage), so the name falls back to the :tool-input
  part with the same id. A `thoughtSignature` captured at stream time (see [[->aisdk-chunks-xf]])
  is echoed back on the replayed functionCall part — Gemini 3.x rejects current-turn functionCall
  replays without it."
  [parts]
  (let [id->name (into {}
                       (comp (filter #(= :tool-input (:type %)))
                             (map (juxt :id :function)))
                       parts)]
    (->> parts
         (mapv (fn [part]
                 (case (:type part)
                   :text        {:role  "model"
                                 :parts [{:text (:text part)}]}
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
                   ;; User messages pass through
                   {:role  (->gemini-role (or (:role part) "user"))
                    :parts (->text-parts (:content part))})))
         merge-consecutive)))

;;; Tool definition format

(defn- tool->function-declaration
  "Convert a tool definition map to a Gemini `FunctionDeclaration`.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn.

  Uses `parametersJsonSchema` (standard JSON Schema) rather than the legacy `parameters` field,
  whose OpenAPI-subset `Schema` object rejects keywords like `additionalProperties`."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params                     (schema/filter-schema-by-features params)
        doc                        (if (str/starts-with? (or doc "") "Inputs: ")
                                     ;; strip that stuff we're appending in mu/defn
                                     (second (str/split doc #"\n\n  " 2))
                                     doc)]
    {:name                 (or tool-name "unknown")
     :description          doc
     :parametersJsonSchema (mjs/transform params {:additionalProperties false})}))

;;; Request body

(mu/defn request-body
  "Build the `streamGenerateContent` request body for an LLM request."
  [{:keys [system input tools schema tool_choice temperature max-tokens]} :- core/LLMRequestOpts]
  (let [fdecls (when (seq tools) (mapv tool->function-declaration tools))]
    (cond-> {:contents         (parts->contents input)
             :generationConfig (cond-> {:maxOutputTokens (or max-tokens 4096)}
                                 temperature (assoc :temperature temperature))}
      system (assoc :systemInstruction {:parts [{:text system}]})
      fdecls (assoc :tools [{:functionDeclarations fdecls}])

      (and fdecls tool_choice)
      (assoc :toolConfig {:functionCallingConfig {:mode (case (name tool_choice)
                                                          "auto"     "AUTO"
                                                          "required" "ANY")}})

      ;; Structured output: force a call to a single schema-carrying tool, mirroring the Claude and
      ;; Chat Completions adapters so the shared :tool-input extraction in call-llm-structured works.
      schema (assoc :tools      [{:functionDeclarations
                                  [{:name                 "structured_output"
                                    :description          "Output structured data"
                                    :parametersJsonSchema schema}]}]
                    :toolConfig {:functionCallingConfig {:mode                 "ANY"
                                                         :allowedFunctionNames ["structured_output"]}}))))

;;; Streaming response → AISDK v5 chunks

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

  Unlike Claude, there are no content-block start/stop events: text streams as consecutive parts
  (one open text block spans them), and each functionCall part arrives with complete args, so its
  start/delta/available chunks are emitted together. Parts flagged `:thought true` (thinking
  summaries) are ignored, mirroring the other adapters' handling of reasoning output. Usage is
  buffered last-wins and emitted once at stream end — intermediate events can carry partial
  usageMetadata."
  []
  (fn [rf]
    (let [message-id  (volatile! nil)
          model-name  (volatile! nil)
          text-id     (volatile! nil) ;; non-nil while a text block is open
          usage-acc   (volatile! nil)
          close-text! (fn [result]
                        (if-let [id @text-id]
                          (do (vreset! text-id nil)
                              (rf result {:type :text-end :id id}))
                          result))
          emit-part   (fn [result {:keys [text functionCall thought thoughtSignature]}]
                        (cond
                          thought
                          result

                          functionCall
                          (let [tool-id (core/mkid)
                                ids     {:toolCallId tool-id :toolName (:name functionCall)}
                                ;; Gemini 3.x attaches a thoughtSignature to functionCall parts that
                                ;; must be echoed back on replay; ride it on the start chunk so it
                                ;; survives into the :tool-input part as :provider-metadata.
                                start   (cond-> (merge {:type :tool-input-start} ids)
                                          thoughtSignature
                                          (assoc :providerMetadata {:google {:thoughtSignature thoughtSignature}}))]
                            (-> (close-text! result)
                                (rf start)
                                (rf {:type           :tool-input-delta
                                     :toolCallId     tool-id
                                     :inputTextDelta (json/encode (or (:args functionCall) {}))})
                                (rf (merge {:type :tool-input-available} ids))))

                          ;; Open a text block only for non-empty text so a stray empty part between
                          ;; tool calls doesn't split them; inside an open block even blank deltas
                          ;; pass through to preserve whitespace.
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
         (-> result
             (close-text!)
             (cond-> @usage-acc (rf {:type  :usage
                                     :usage @usage-acc
                                     :id    @message-id
                                     :model @model-name}))
             (rf)))
        ([result {:keys [candidates usageMetadata responseId modelVersion promptFeedback error] :as _event}]
         (when (some? usageMetadata)
           (vreset! usage-acc (usage->aisdk-usage usageMetadata)))
         ;; modelVersion can appear on any event; keep the latest for the :usage chunk
         (when (some? modelVersion)
           (vreset! model-name modelVersion))
         (let [{:keys [content finishReason]} (first candidates)
               block-reason                   (:blockReason promptFeedback)]
           (cond-> result
             ;; Emit :start on the first event
             (not @message-id)    (-> (u/prog1
                                        (vreset! message-id (or responseId (core/mkid))))
                                      (rf {:type :start :messageId @message-id}))
             (seq (:parts content)) (as-> res (reduce emit-part res (:parts content)))
             (some? finishReason) (close-text!)
             ;; A blocked prompt ends the stream with no candidates, only promptFeedback
             (some? block-reason) (-> (close-text!)
                                      (rf {:type      :error
                                           :errorText (str "Prompt blocked by Google: " block-reason)}))
             ;; In-stream error envelope (e.g. mid-stream failures)
             (some? error)        (-> (close-text!)
                                      (rf {:type      :error
                                           :errorText (or (:message error) (pr-str error))})))))))))
