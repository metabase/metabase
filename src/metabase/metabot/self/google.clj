(ns metabase.metabot.self.google
  "Google Gemini (Generative Language API) adapter.

  Uses the native Gemini API at `/v1beta/models/{model}:streamGenerateContent`.
  Authenticated via `x-goog-api-key` (BYOK from Google AI Studio).

  Gemini's wire format diverges from OpenAI-style Chat Completions:
  - System prompt is lifted into a top-level `systemInstruction` instead of a message.
  - Tool results come back as `user`-role messages carrying a `functionResponse` part.
  - `functionCall` parts arrive whole on a single SSE chunk (no streaming of args)."
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
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.o11y :refer [with-span]]))

(set! *warn-on-reflection* true)

;;; AISDK parts → Gemini contents

(defn- tool-output->text
  [part]
  (or (get-in part [:result :output])
      (when-let [err (:error part)]
        (str "Error: " (:message err)))
      (pr-str (:result part))))

(defn- merge-consecutive-same-role
  "Merge consecutive same-role messages into a single message with concatenated parts.
  Gemini, like Anthropic, expects alternating user/model turns."
  [messages]
  (into [] (comp (partition-by :role)
                 (map (fn [group]
                        {:role  (:role (first group))
                         :parts (into [] (mapcat :parts) group)})))
        messages))

;; Documented bypass signature accepted by Google's validator. Gemini 3 rejects
;; functionCall parts in conversation history that lack a thoughtSignature
;; (https://ai.google.dev/gemini-api/docs/thought-signatures). Capturing and
;; round-tripping the real signature requires a per-part metadata channel that
;; the AISDK :tool-input part doesn't currently expose — see the TODO at
;; google->aisdk-chunks-xf below.
(def ^:private bypass-thought-signature "skip_thought_signature_validator")

(defn parts->gemini-contents
  "Convert a sequence of AISDK parts into Gemini `contents`.

  Maps AISDK parts to Gemini's `{:role :parts}` shape:
    :text        → {:role \"model\" :parts [{:text ...}]}
    :tool-input  → {:role \"model\" :parts [{:functionCall ... :thoughtSignature ...}]}
    :tool-output → {:role \"user\"  :parts [{:functionResponse {:name :response}}]}
    user message → {:role \"user\"  :parts [{:text ...}]}

  Consecutive same-role messages are merged because Gemini, like Anthropic,
  expects alternating user/model turns. The system prompt is passed separately
  on the request and is not produced here.

  Tool-output parts reconstructed from frontend history carry `:id` but not
  `:function` — the function name is recovered by matching against the preceding
  `:tool-input` part with the same id. Gemini rejects `functionResponse` parts
  with an empty `name`."
  [parts]
  (let [id->fn-name (into {}
                          (keep (fn [p]
                                  (when (and (= :tool-input (:type p)) (:id p) (:function p))
                                    [(:id p) (:function p)])))
                          parts)]
    (->> parts
         (mapv (fn [part]
                 (case (:type part)
                   :text        {:role  "model"
                                 :parts [{:text (:text part)}]}
                   :tool-input  {:role  "model"
                                 :parts [{:functionCall      (cond-> {:name (:function part)
                                                                      :args (or (:arguments part) {})}
                                                               (:id part) (assoc :id (:id part)))
                                          :thoughtSignature  bypass-thought-signature}]}
                   :tool-output {:role  "user"
                                 :parts [{:functionResponse (cond-> {:name     (or (:function part)
                                                                                   (get id->fn-name (:id part))
                                                                                   "")
                                                                     :response {:content (tool-output->text part)}}
                                                              (:id part) (assoc :id (:id part)))}]}
                   {:role  (case (name (or (:role part) "user"))
                             "assistant" "model"
                             "user")
                    :parts [{:text (or (:content part) "")}]})))
         merge-consecutive-same-role)))

;;; Tool definition format

(def ^:private gemini-unsupported-schema-keys
  "JSON Schema keywords Gemini's function-calling subset doesn't accept.
  Gemini expects an OpenAPI 3.0 Schema, which doesn't include these JSON Schema
  draft-2020 features."
  #{:additionalProperties :$schema :$ref :patternProperties :unevaluatedProperties
    :oneOf :allOf :not})

(defn- prune-for-gemini
  "Recursively remove JSON-Schema keys Gemini rejects."
  [x]
  (cond
    (map? x)        (into {}
                          (keep (fn [[k v]]
                                  (when-not (contains? gemini-unsupported-schema-keys k)
                                    [k (prune-for-gemini v)])))
                          x)
    (sequential? x) (mapv prune-for-gemini x)
    :else           x))

(defn- tool->gemini
  "Convert a tool definition map to a Gemini `function_declaration`.
  Accepts a ToolEntry map with :tool-name, :doc, :schema, :fn."
  [{:keys [tool-name doc schema]}]
  (let [[_:=> [_:cat params] _out] schema
        params (schema/filter-schema-by-features params)
        doc    (if (str/starts-with? (or doc "") "Inputs: ")
                 (second (str/split doc #"\n\n  " 2))
                 doc)]
    {:name        tool-name
     :description doc
     :parameters  (prune-for-gemini (mjs/transform params))}))

;;; Error translation

(defn- api-key-invalid?
  "Detect Gemini's 400 + `API_KEY_INVALID` envelope. Gemini reports invalid keys
  with HTTP 400 (not 401) and signals the reason in `error.details[].reason`."
  [res]
  (let [details (get-in res [:body :error :details])]
    (some (fn [d]
            (let [reason (:reason d)]
              (or (= reason "API_KEY_INVALID")
                  (= reason "API_KEY_EXPIRED"))))
          details)))

(defn- google-errors [res]
  (let [status    (long (:status res 0))
        error-msg (get-in res [:body :error :message])]
    (cond
      (and (= status 400) (api-key-invalid? res))
      (tru "Google API key is invalid")

      :else
      (case status
        400 (let [reason (get-in res [:body :error :status])]
              (cond
                (= reason "FAILED_PRECONDITION") (tru "Google API requires billing for this region")
                error-msg                       (tru "Google API rejected our request: {0}" error-msg)
                :else                           (tru "Google API rejected our request")))
        401 (tru "Google API key expired or invalid")
        403 (tru "Google API key has insufficient permissions")
        404 (tru "Google API model not found")
        429 (tru "Google API has rate limited us")
        500 (tru "Google API returned an internal server error")
        503 (tru "Google API is overloaded")
        504 (tru "Google API timed out processing the prompt")
        (if error-msg
          (tru "Google API error (HTTP {0}): {1}" status error-msg)
          (tru "Google API error (HTTP {0})" status))))))

(defn- read-body-once
  "Slurp `data`'s `:body` (if it's a stream) into a string so subsequent JSON
  decoding doesn't try to re-read a closed stream."
  [data]
  (cond-> data
    (and (:body data) (not (string? (:body data))))
    (update :body slurp)))

(defn- rethrow-google-error!
  "Like [[core/rethrow-api-error!]] but promotes the 400+API_KEY_INVALID case to
  a 401-equivalent so the settings endpoint's `invalid-api-key-error?` check
  recognizes it as a key error rather than a generic request error."
  [e]
  (let [data (ex-data e)]
    (if (or (:api-error data) (not (:body data)))
      (core/rethrow-api-error! "google" google-errors e)
      (let [data    (read-body-once data)
            decoded (try (json/decode+kw (:body data)) (catch Exception _ nil))
            res     (assoc data :body decoded)]
        (if (and (= (long (:status data 0)) 400)
                 (api-key-invalid? res))
          (throw (ex-info (google-errors res)
                          (assoc res
                                 :api-error  true
                                 :status     401
                                 :provider   "google"
                                 :error-code :provider-api-error)
                          e))
          ;; Re-raise with the body already decoded so downstream callers don't
          ;; need to re-read the (now-consumed) original stream.
          (throw (ex-info (google-errors res)
                          (assoc res
                                 :api-error  true
                                 :provider   "google"
                                 :error-code :provider-api-error)
                          e)))))))

;;; Model listing

(defn list-models
  "List available Google Gemini models.
  No-arg uses the configured API key. Opts map supports `:api-key` and `:ai-proxy?`."
  ([] (list-models {}))
  ([{:keys [api-key ai-proxy?]}]
   (when (and api-key (str/blank? api-key))
     (throw (core/missing-api-key-ex "Google")))
   (try
     (let [auth (core/resolve-auth "google" "Google"
                                   (when-let [k (or (not-empty api-key) (not-empty (llm/llm-google-api-key)))]
                                     {:url     (llm/llm-google-api-base-url)
                                      :headers {"x-goog-api-key" k}})
                                   ai-proxy?)
           res  (core/request auth {:method  :get
                                    :url     "/v1beta/models"
                                    :as      :json
                                    :headers {"Content-Type" "application/json"}})
           models (->> (get-in res [:body :models])
                       (filter (fn [m]
                                 (some #{"generateContent"} (:supportedGenerationMethods m))))
                       (mapv (fn [m]
                               {:id           (str/replace (:name m "") #"^models/" "")
                                :display_name (or (:displayName m) (:name m))})))]
       {:models models})
     (catch Exception e
       (rethrow-google-error! e)))))

;;; Streaming response → AISDK v5 chunks

(defn- finish-reason-blocked?
  "Whether a Gemini finishReason indicates a safety/policy block (i.e. anything
  other than STOP/MAX_TOKENS and the normal-completion variants)."
  [reason]
  (and reason
       (not (#{"STOP" "MAX_TOKENS" "FINISH_REASON_UNSPECIFIED"} reason))))

(defn google->aisdk-chunks-xf
  "Translate Gemini SSE chunks into AI SDK v5 protocol chunks.

  Gemini streaming format: each `data:` line is a full `GenerateContentResponse`
  whose `candidates[0].content.parts[]` carries either a `text` delta or a
  whole `functionCall` object. The final chunk also carries `usageMetadata`.

  No `[DONE]` sentinel — the stream just closes.

  TODO: Gemini 3+ emits a `thoughtSignature` alongside each `functionCall` part.
  When the conversation is re-sent in the next turn, Google's validator requires
  that signature to be echoed back. We currently bypass validation via the
  documented [[bypass-thought-signature]] sentinel — this works but Google
  warns it may degrade reasoning quality. To round-trip the real signature
  properly we'd need a per-part metadata channel on the AISDK :tool-input part."
  []
  (fn [rf]
    (let [current-type (volatile! nil)   ;; :text | :function_call | nil
          current-id   (volatile! nil)
          message-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          started?     (volatile! false)
          close!       (fn [result]
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text          :text-end
                                                             :function_call :tool-input-available)}
                                                    @payload))
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))
          start-text!     (fn []
                            (let [tid (core/mkid)]
                              (vreset! current-type :text)
                              (vreset! current-id tid)
                              (vreset! payload {:id tid})))
          emit-text-delta (fn [result text]
                            (let [result (if (and @current-type (not= @current-type :text))
                                           (close! result)
                                           result)
                                  result (if (not= @current-type :text)
                                           (do (start-text!)
                                               (rf result (merge {:type :text-start} @payload)))
                                           result)]
                              (rf result {:type  :text-delta
                                          :id    @current-id
                                          :delta text})))
          emit-tool-call  (fn [result function-call]
                            (let [tool-id   (or (:id function-call) (core/mkid))
                                  tool-name (:name function-call)
                                  args      (or (:args function-call) {})
                                  result    (if @current-type (close! result) result)]
                              (vreset! current-type :function_call)
                              (vreset! current-id tool-id)
                              (vreset! payload {:toolCallId tool-id
                                                :toolName   tool-name})
                              (-> result
                                  (rf (merge {:type :tool-input-start} @payload))
                                  (rf {:type           :tool-input-delta
                                       :toolCallId     tool-id
                                       :inputTextDelta (json/encode args)})
                                  (close!))))]
      (fn
        ([result]
         (cond-> result
           @current-type (close!)
           true          (rf)))

        ([result {:keys [candidates usageMetadata modelVersion promptFeedback responseId] :as _chunk}]
         (let [candidate     (first candidates)
               parts         (get-in candidate [:content :parts])
               finish-reason (:finishReason candidate)
               block-reason  (:blockReason promptFeedback)
               result        (if @started?
                               result
                               (let [msg-id (or responseId (core/mkid))]
                                 (vreset! started? true)
                                 (vreset! message-id msg-id)
                                 (when modelVersion (vreset! model-name modelVersion))
                                 (rf result {:type :start :messageId msg-id})))
               result        (reduce
                              (fn [r part]
                                (cond
                                  (some? (:text part))         (emit-text-delta r (:text part))
                                  (some? (:functionCall part)) (emit-tool-call r (:functionCall part))
                                  :else                        r))
                              result
                              parts)
               blocked?      (or (finish-reason-blocked? finish-reason) (some? block-reason))
               result        (if blocked?
                               (cond-> result
                                 @current-type (close!)
                                 true (rf {:type  :error
                                           :error {:message    (tru "Response blocked by Google safety filter")
                                                   :error-code "google_safety_block"}}))
                               (cond-> result
                                 (and finish-reason @current-type) (close!)))]
           (cond-> result
             usageMetadata (rf {:type  :usage
                                :usage {:promptTokens     (:promptTokenCount usageMetadata 0)
                                        :completionTokens (:candidatesTokenCount usageMetadata 0)}
                                :id    @message-id
                                :model @model-name}))))))))

;;; HTTP request

(defn- tool-config-for
  [tools tool_choice schema]
  (let [mode (cond
               schema             "ANY"
               (= tool_choice "required") "ANY"
               (seq tools)        "AUTO"
               :else              nil)]
    (when mode
      {:function_calling_config {:mode mode}})))

(mu/defn google-raw
  "Perform a streaming request to the Gemini API."
  [{:keys [model system input tools temperature max-tokens tool_choice schema ai-proxy?]
    :or   {model "gemini-3.5-flash"}} :- core/LLMRequestOpts]
  (let [contents    (parts->gemini-contents input)
        all-tools   (or (when schema
                          [{:name        "structured_output"
                            :description "Output structured data"
                            :parameters  (prune-for-gemini schema)}])
                        (seq (mapv tool->gemini tools)))
        tool-config (tool-config-for all-tools tool_choice schema)
        req         (cond-> {:contents contents}
                      system      (assoc :systemInstruction {:parts [{:text system}]})
                      all-tools   (assoc :tools [{:function_declarations (vec all-tools)}])
                      tool-config (assoc :toolConfig tool-config)
                      (or temperature max-tokens)
                      (assoc :generationConfig
                             (cond-> {}
                               temperature (assoc :temperature temperature)
                               max-tokens  (assoc :maxOutputTokens max-tokens))))]
    (log/debug "Google request" {:model model :msg-count (count contents) :tools (count (or tools []))})
    (with-span :info {:name       :metabot.google/request
                      :model      model
                      :msg-count  (count contents)
                      :tool-count (count (or tools []))}
      (try
        (let [api-key  (not-empty (llm/llm-google-api-key))
              auth     (core/resolve-auth "google" "Google"
                                          (when api-key
                                            {:url     (llm/llm-google-api-base-url)
                                             :headers {"x-goog-api-key" api-key}})
                                          ai-proxy?)
              url      (str "/v1beta/models/" model ":streamGenerateContent?alt=sse")
              response (core/request auth
                                     {:method  :post
                                      :url     url
                                      :as      :stream
                                      :headers {"Content-Type" "application/json"}
                                      :body    (json/encode req)})]
          (-> (core/sse-reducible (:body response))
              (debug/capture-stream {:provider "google"
                                     :model    model
                                     :url      url
                                     :request  req})))
        (catch Exception e
          (rethrow-google-error! e))))))

(defn google
  "Call Google Gemini API, return AISDK stream."
  [& args]
  (let [raw (apply google-raw args)]
    (eduction (google->aisdk-chunks-xf) raw)))
