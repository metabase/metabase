(ns metabase.metabot.self.google.stream-generate-content
  "Wire-format translation for Google's `streamGenerateContent` API.

  This is the native protocol for Gemini models on the Gemini Enterprise Agent Platform. AISDK parts become
  `GenerateContentRequest` bodies, and streamed `GenerateContentResponse` SSE events become AI SDK v5 chunks.

  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.publishers.models/streamGenerateContent"
  (:require
   [clojure.string :as str]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.google.models :as models]
   [metabase.metabot.self.schema :as schema]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu])
  (:import
   (metabase.metabot.providers.google GenerateContentTranslator)))

(set! *warn-on-reflection* true)

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
  Gemini 3.x rejects a replay in the current turn that has no signature. :reasoning parts are display-only and
  contribute no content here."
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
                   ;; Reasoning is display-only: thought summaries never go back to Gemini. The
                   ;; model keeps its reasoning continuity through the functionCall
                   ;; thoughtSignatures replayed above. The empty :parts vector is dropped by
                   ;; [[merge-consecutive]] before role runs are computed.
                   :reasoning   {:role "model" :parts []}
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

(def ^:private forced-tool-call-token-floor
  "Smallest `maxOutputTokens` a forced tool call on a catalog Gemini may be capped at.

  Gemini 3 thinking cannot be turned off
  (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking) and is billed against
  `maxOutputTokens` alongside the answer, so a small caller cap risks a `MAX_TOKENS` finish before the forced tool
  call is emitted. Probed 2026-09-09 on gemini-3.7-flash at `thinkingLevel LOW`: the spend is bimodal — 0 on most
  runs, 200–490 when it fires — so the tail is the risk, not the median, and the ceiling across ~100 calls was 490
  thinking tokens (554 total). [[metabase.metabot.example-question-generator]]'s own prompt, run at a 512 cap, spent
  the whole budget thinking on one run in six and returned no functionCall; it escapes that in production only
  because its call site already asks for 4096. The other two structured callers cap at 512
  ([[metabase.metabot.conversation-title]]) and 1024 ([[metabase.contextual-interestingness.llm]]).

  The Gemini numbers support any floor at or above roughly 768. 2048 is not derived from them: it is the value vLLM
  proved and Moonshot, Z.AI and OpenRouter share. It carries ~4x margin over the worst spend measured, at no cost —
  only the tokens actually generated are billed."
  2048)

(mu/defn request-body
  "Builds the `streamGenerateContent` request body for an LLM request."
  [{:keys [system input tools schema tool_choice temperature max-tokens model reasoning?]
    :or   {reasoning? true}} :- core/LLMRequestOpts]
  (let [fdecls     (when (seq tools) (mapv tool->function-declaration tools))
        forced?    (or (some? schema) (= "required" (some-> tool_choice name)))
        ;; Thinking is always on for the catalog's Gemini 3 models and has no off switch
        ;; (https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking).
        ;; Off-catalog models get no thinkingConfig at all: non-thinking models reject the
        ;; field outright, pre-Gemini-3 models reject thinkingLevel, and the reasoning gate
        ;; answers false for them.
        thinking   (when (models/reasoning-model? model)
                     (cond
                       ;; Structured output — :schema, set by call-llm-structured-with-trace — is a
                       ;; one-shot internal call: nobody sees the thinking, and it eats the small
                       ;; maxOutputTokens budget the forced tool-call answer needs. z.ai disables
                       ;; thinking for the same reason ([[metabase.metabot.self.zai/zai-request-body]]);
                       ;; Gemini has no off switch, so pin the lowest level every catalog model
                       ;; supports — gemini-3.7-flash has no MINIMAL. LOW is a smaller spend, not no
                       ;; spend, so it is half the defence: the floor below raises the budget itself.
                       schema     {:thinkingLevel "LOW"}
                       ;; The chat path streams to the browser: ask for the thought summaries the
                       ;; chain-of-thought UI renders, and leave the default thinking level alone.
                       reasoning? {:includeThoughts true}))
        ;; Safety net: the forced tool call must survive the un-disableable thinking spend, which
        ;; Gemini bills against maxOutputTokens (see [[forced-tool-call-token-floor]]). Only an
        ;; existing cap is raised, and only where a tool call is actually forced — the chat path
        ;; sends no cap at all. Independent of :reasoning?, because a catalog model thinks whether
        ;; or not we asked it to.
        max-tokens (cond-> max-tokens
                     (and max-tokens forced? (models/reasoning-model? model))
                     (max forced-tool-call-token-floor))
        gen-config (cond-> {}
                     max-tokens  (assoc :maxOutputTokens max-tokens)
                     temperature (assoc :temperature temperature)
                     thinking    (assoc :thinkingConfig thinking))]
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

(defn reasoning-model?
  "Whether a publisher-qualified Gemini `model` streams thought summaries that our chain-of-thought UI renders.

  True exactly for the [[metabase.metabot.self.google.models]] catalog, the same whitelist the
  [[request-body]] thinking directive keys off, so the gate and the request cannot disagree."
  [model]
  (models/reasoning-model? model))

(defn ->aisdk-chunks-xf
  "Translates `streamGenerateContent` SSE events into AI SDK v5 protocol chunks; the translation itself is
  [[GenerateContentTranslator]]. Tool arguments are encoded, and early stops logged, through Metabase's own
  JSON and logging."
  []
  (core/translator-xf
   #(GenerateContentTranslator. core/mkid
                                json/encode
                                (fn [reason] (log/info "Gemini stopped early" {:finishReason reason})))))
