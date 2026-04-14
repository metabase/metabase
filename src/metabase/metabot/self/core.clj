(ns metabase.metabot.self.core
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.llm.settings :as llm]
   [metabase.premium-features.core :as premium-features]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.io BufferedReader Closeable)
   (java.util.concurrent Callable Executors ExecutorService)))

(set! *warn-on-reflection* true)

;;; Canonical LLM request schema
;;
;; Every provider adapter (`claude-raw`, `openai-raw`, `openrouter-raw`) must
;; accept this same opts map.  Provider-specific translation (e.g. tool_choice
;; "required" → {:type "any"} for Claude, system-message placement, tool wire
;; format) happens inside each adapter, but the **input contract is identical**.

(def ToolEntry
  "A tool definition map with :tool-name, :doc, :schema, :fn, and optionally :decode/:prompt."
  [:map
   [:tool-name :string]
   [:doc {:optional true} [:maybe :string]]
   [:schema :any]
   [:fn [:fn fn?]]])

(def LLMRequestOpts
  "Canonical schema for the opts map passed to every LLM provider adapter.

  Required:
    :model       - Model name string (e.g. \"claude-haiku-4-5\", \"gpt-4.1-mini\")

  Optional:
    :system      - System prompt string
    :input       - Sequence of AISDK parts and user messages
    :tools       - Sequence of tool definition maps
    :tool_choice - \"auto\" or \"required\"
    :temperature - Sampling temperature
    :max-tokens  - Maximum tokens in the response
    :schema      - JSON Schema map for structured output; each provider forces a
                   tool call (Claude, OpenRouter) or uses json_schema mode (OpenAI)
    :ai-proxy?   - When true, skip provider auth and use the Metabase AI proxy"
  [:map
   [:model       {:optional true} :string]
   [:system      {:optional true} [:maybe :string]]
   [:input       {:optional true} [:sequential :map]]
   [:tools       {:optional true} [:maybe [:sequential ToolEntry]]]
   [:tool_choice {:optional true} [:maybe [:enum "auto" "required"]]]
   [:temperature {:optional true} [:maybe number?]]
   [:max-tokens  {:optional true} [:maybe :int]]
   [:schema      {:optional true} :any]
   [:ai-proxy?   {:optional true} [:maybe :boolean]]])

(defn mkid
  "Generate a random id"
  []
  (str "mb-" (random-uuid)))

(defn reducible?
  "Checks if argument implements IReduceInit (reducible source)."
  [x]
  (instance? clojure.lang.IReduceInit x))

(defn sse-reducible
  "Turn an SSE InputStream into a reducible source of parsed JSON events.

  Returns an IReduceInit that:
  - Parses SSE 'data: {...}' lines as JSON
  - Stops on 'data: [DONE]' or EOF
  - Supports early termination via `reduced`
  - Closes the input stream on completion or early termination

  Also implements Closeable for explicit cleanup if needed."
  [^Closeable input]
  (reify
    clojure.lang.IReduceInit
    (reduce [_ rf init]
      (with-open [r (io/reader input)]
        (loop [acc init]
          (if (reduced? acc)
            @acc
            (if-let [line (.readLine ^BufferedReader r)]
              ;; spec: https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
              (cond
                (= line "data: [DONE]")
                acc

                (str/starts-with? line "data: ")
                ;; NOTE: we can do that since not one of providers spit json in multiple lines
                (recur (rf acc (json/decode+kw (subs line 6))))

                (= line "")
                (recur acc)

                (str/starts-with? line ":")
                (recur acc)

                (str/starts-with? line "event:")
                (recur acc)

                :else
                (do
                  (log/warn "SSE unexpected line" {:line line})
                  (recur acc)))
              acc)))))

    Closeable
    (close [_]
      (.close input))))

;;; AISDK5

(defn- parse-tool-arguments
  "Parse concatenated tool input deltas as JSON.
  Falls back to returning the raw string wrapped in a map when parsing fails,
  e.g. when the LLM produces malformed JSON in tool call arguments."
  [chunks]
  (let [raw (->> (map :inputTextDelta chunks)
                 (str/join ""))]
    (try
      (json/decode+kw raw)
      (catch Exception e
        (log/warn "Failed to parse tool arguments as JSON, passing raw string"
                  {:tool    (:toolName (first chunks))
                   :error   (.getMessage e)
                   :raw-len (count raw)})
        ;; Return a map with a sentinel key so the tool sees an error via schema validation
        ;; rather than a cryptic JSON parse stacktrace.
        {:_raw_arguments raw}))))

(defn- aisdk-chunks->part [[chunk :as chunks]]
  (case (:type chunk)
    :start                 {:type :start
                            :id   (:messageId chunk)}
    :usage                 chunk
    :error                 chunk
    :text-start            {:type :text
                            :id   (:id chunk)
                            :text (->> (map :delta chunks)
                                       (str/join ""))}
    :tool-input-start      {:type      :tool-input
                            :id        (:toolCallId chunk)
                            :function  (:toolName chunk)
                            :arguments (parse-tool-arguments chunks)}
    :tool-output-available {:type        :tool-output
                            :id          (:toolCallId chunk)
                            :function    (:toolName chunk)
                            :result      (:result chunk)
                            :error       (:error chunk)
                            :duration-ms (::duration-ms chunk)}))

(defn aisdk-xf
  "Collect a stream of AI SDK v5 chunks into a list of parts (joins by id)."
  ([] (aisdk-xf nil))
  ([{:keys [stream-text?]}]
   (fn [rf]
     ;; NOTE: logic relies on chunks pieces not being interleaved, but even `tool-executor-xf` doesn't break that rule
     ;; if we ever change it to stream tools rather than collect them in one piece, we'd need to improve logic here too
     (let [current-id (volatile! nil)
           acc        (volatile! [])
           ;; is it not nice how consistent the AI SDK format is?
           getid      #(or (:id %) (:messageId %) (:toolCallId %))
           flush!     (fn [result]
                        (u/prog1 (cond-> result
                                   (seq @acc) (rf (aisdk-chunks->part @acc)))
                          (vreset! current-id nil)
                          (vreset! acc [])))]
       (fn
         ([result]
          (cond-> result
            (seq @acc) (rf (aisdk-chunks->part @acc))
            true       rf))
         ([result chunk]
          (let [chunk-id (getid chunk)]
            (cond
              (= :tool-input-start (:type chunk))
              (let [result (flush! result)]
                (vreset! current-id chunk-id)
                (vreset! acc [chunk])
                (rf result {:type     :tool-input-start
                            :id       (:toolCallId chunk)
                            :function (:toolName chunk)}))

              (#{:tool-output-available :start :usage :error} (:type chunk))
              (-> (flush! result)
                  (rf (aisdk-chunks->part [chunk])))

              (and stream-text? (#{:text-start :text-end} (:type chunk)))
              (flush! result)

              (and stream-text? (#{:text-delta :text-start :text-end} (:type chunk)))
              (-> (flush! result)
                  ;; TODO: check if I can just pass through text-delta?
                  (rf {:type :text :id (:id chunk) :text (:delta chunk)}))

              (not= chunk-id @current-id)
              (u/prog1 (flush! result)
                (vreset! current-id chunk-id)
                (vreset! acc [chunk]))

              :else
              (u/prog1 result
                (vswap! acc conj chunk))))))))))

(defn lite-aisdk-xf
  "Like `aisdk-xf` but text is streamed through as chunks"
  []
  (aisdk-xf {:stream-text? true}))

;;; AI SDK v6 Line Protocol Output

(defn format-sse-event
  "Format a payload map as an SSE event line: data: {JSON}\n"
  [payload]
  (str "data: " (json/encode payload) "\n"))

(defn- ->message-metadata
  "Translate internal per-model usage into an AI SDK v6 `messageMetadata` shape.

  Input: `{\"provider/model\" {:promptTokens N :completionTokens N}}` .

  Output: `{:usage {:inputTokens N :outputTokens N :totalTokens N}
            :usageByModel {\"provider/model\" {:inputTokens N :outputTokens N
                                                :totalTokens N}}}`
  Returns `nil` if no usage observed.

  `reasoningTokens` and `cachedInputTokens` are intentionally omitted — our
  provider adapters don't surface them yet."
  [usage-by-model]
  (when (seq usage-by-model)
    (let [by-model (update-vals usage-by-model
                                (fn [{:keys [promptTokens completionTokens]
                                      :or   {promptTokens 0 completionTokens 0}}]
                                  {:inputTokens  promptTokens
                                   :outputTokens completionTokens
                                   :totalTokens  (+ promptTokens completionTokens)}))
          totals   (reduce (fn [acc {:keys [inputTokens outputTokens totalTokens]}]
                             (-> acc
                                 (update :inputTokens  + inputTokens)
                                 (update :outputTokens + outputTokens)
                                 (update :totalTokens  + totalTokens)))
                           {:inputTokens 0 :outputTokens 0 :totalTokens 0}
                           (vals by-model))]
      {:usage        totals
       :usageByModel by-model})))

(defn parts->aisdk-sse-xf
  "Transducer that converts internal parts to SSE protocol format.
  Returns strings ready to be written to the output stream. Each string is one
  SSE event line ending with \\n; the streaming writer adds another \\n to form
  the SSE event boundary (\\n\\n).

  The agent loop emits :start per LLM call (iteration), but the SSE protocol
  expects a single `start` for the whole message. Subsequent :start parts are
  treated as step boundaries (finish-step + start-step).

  Consecutive `:text` parts that share the same `:id` are coalesced into one
  text block — one `text-start`, many `text-delta`s, one `text-end`. Any
  intervening non-text part (or end of stream) closes the open block.
  Non-text events implicitly close any open text block before emitting their
  own SSE events, so the wire order is always:
  text-start ... text-delta* ... text-end ... <next event>

  Input types and their SSE events:
    :start (1st)      -> {type:start, messageId:...} + {type:start-step}
    :start (Nth)      -> {type:finish-step} + {type:start-step}
    :text             -> [{type:text-end,id:prev}]? [{type:text-start,id}]?
                         + {type:text-delta, id, delta}
    :tool-input-start -> {type:tool-input-start, toolCallId, toolName}
    :tool-input       -> {type:tool-input-available, toolCallId, toolName, input}
    :tool-output      -> {type:tool-output-available}
    :data             -> {type:data-STATE_TYPE, id:..., data:...}
    :error            -> {type:error, errorText:...}
    :usage            -> (accumulated; carried out on finish.messageMetadata)
    :finish           -> (ignored - completion arity handles final finish)
    completion        -> {type:finish-step} + {type:finish, messageMetadata?:...} + [DONE]"
  []
  (fn [rf]
    (let [error?           (volatile! false)
          started?         (volatile! false)
          usage-by-model   (volatile! {})
          ;; non-nil while a text block is open. Holds the block id so we can
          ;; emit a matching text-end when the block closes.
          current-text-id  (volatile! nil)
          close-text-block (fn [result]
                             (if-let [id @current-text-id]
                               (do (vreset! current-text-id nil)
                                   (rf result (format-sse-event {:type "text-end" :id id})))
                               result))]
      (fn
        ([] (rf))
        ([result]
         (-> result
             ;; Close any open text block before tearing down the step
             close-text-block
             ;; Close the current step if started
             (cond-> @started? (rf (format-sse-event {:type "finish-step"})))
             ;; Emit finish (with finishReason + optional messageMetadata) + [DONE]
             (rf (format-sse-event
                  (cond-> {:type         "finish"
                           :finishReason (if @error? "error" "stop")}
                    (seq @usage-by-model)
                    (assoc :messageMetadata (->message-metadata @usage-by-model)))))
             (rf "data: [DONE]\n")
             (rf)))
        ([result part]
         ;; Any non-text part implicitly closes the current text block before
         ;; its own events are emitted. The :text branch below handles its own
         ;; closing semantics (only closes when the id changes).
         (let [result (if (= :text (:type part))
                        result
                        (close-text-block result))]
           (case (:type part)
             :start
             (if @started?
               ;; Subsequent iteration: close previous step, open new one
               (-> result
                   (rf (format-sse-event {:type "finish-step"}))
                   (rf (format-sse-event {:type "start-step"})))
               ;; First iteration: emit message start + first step
               (do
                 (vreset! started? true)
                 (-> result
                     (rf (format-sse-event {:type "start" :messageId (or (:id part) (mkid))}))
                     (rf (format-sse-event {:type "start-step"})))))

             :text
             (let [id (or (:id part) (mkid))]
               (if (= id @current-text-id)
                 ;; Same id as the open block — append a delta to it.
                 (rf result (format-sse-event {:type "text-delta" :id id :delta (:text part)}))
                 ;; New id (or no open block) — close any prior block, open
                 ;; this one, then emit the first delta.
                 (let [result (close-text-block result)]
                   (vreset! current-text-id id)
                   (-> result
                       (rf (format-sse-event {:type "text-start" :id id}))
                       (rf (format-sse-event {:type "text-delta" :id id :delta (:text part)}))))))

             :tool-input-start
             (rf result (format-sse-event {:type       "tool-input-start"
                                           :toolCallId (:id part)
                                           :toolName   (:function part)}))

             :tool-input
             (rf result (format-sse-event {:type       "tool-input-available"
                                           :toolCallId (:id part)
                                           :toolName   (:function part)
                                           :input      (:arguments part)}))

             :tool-output
             (rf result
                 (format-sse-event
                  (if-let [error (:error part)]
                    {:type       "tool-output-error"
                     :toolCallId (:id part)
                     :errorText  (or (:message error) (str error))}
                    {:type       "tool-output-available"
                     :toolCallId (:id part)
                     :output     (:result part)})))

             :data
             (rf result (format-sse-event {:type (str "data-" (or (:data-type part) "data"))
                                           :id   (or (:id part) (mkid))
                                           :data (:data part)}))

             :error
             (do
               (vreset! error? true)
               (rf result (format-sse-event {:type      "error"
                                             :errorText (or (some-> (:error part) :message)
                                                            (str (:error part)))})))

             :finish
             result

             :usage
             ;; Accumulate cumulative-per-model snapshot. Carried out on
             ;; finish.messageMetadata in the completion arity.
             (do
               (vswap! usage-by-model assoc (or (:model part) "unknown") (:usage part))
               result)

             ;; Unknown types: emit as data parts
             (rf result (format-sse-event {:type (str "data-" (name (:type part)))
                                           :id   (or (:id part) (mkid))
                                           :data part})))))))))

;;; Tool executor

(defonce ^:private tool-executor
  (Executors/newFixedThreadPool
   20
   (.. (Thread/ofVirtual) (name "tool-executor-") factory)))

(defn- submit-virtual
  "Submit a thunk to run on a virtual thread, bounded by pool size."
  [thunk]
  (.submit ^ExecutorService tool-executor ^Callable thunk))

(defn- collect-tool-result
  "Normalize tool result into a vector of output chunks.

  Tools can return:
  - Plain value (map): wrapped as single :tool-output-available
  - IReduceInit (reducible): reduced into chunks, filtering :start/:finish"
  [tool-call-id tool-name result]
  (let [ids {:toolCallId tool-call-id :toolName tool-name}]
    (if (reducible? result)
      (into []
            (comp (remove #(#{:start :finish} (:type %)))
                  (map #(merge % ids)))
            result)
      [(assoc ids :type :tool-output-available :result result)])))

(defn- concise-tool-error
  "Produce a concise error message for the LLM from a tool execution exception.
  For malli validation errors, extracts the humanized map and summarizes it.
  For other errors, uses the exception message."
  [^Exception e]
  (let [data (ex-data e)]
    (if-let [humanized (:humanized data)]
      ;; Malli validation error — produce a short summary the LLM can act on
      (str "Invalid tool arguments: " (pr-str humanized))
      ;; Other errors
      (or (ex-message e) "Unknown error"))))

(defn- try-decode-json-string
  "If `v` is a string that looks like a JSON object or array, decode it.
  Returns the decoded value on success, or the original value on failure."
  [v]
  (if (and (string? v)
           (let [trimmed (str/trim v)]
             (or (str/starts-with? trimmed "{")
                 (str/starts-with? trimmed "["))))
    (try
      (json/decode+kw v)
      (catch Exception _ v))
    v))

(defn- coerce-stringified-json
  "Walk tool arguments and decode any string values that are actually stringified
  JSON objects/arrays. LLMs sometimes double-encode nested arguments."
  [args]
  (if (map? args)
    (reduce-kv (fn [m k v]
                 (assoc m k (cond
                              (string? v) (try-decode-json-string v)
                              (map? v)    (coerce-stringified-json v)
                              :else       v)))
               {}
               args)
    args))

(defn- tool-decode-fn
  "Extract the `:decode` function from a tool definition map.
  The decode function transforms tool arguments before the tool runs.
  Returns `nil` if the tool has no decoder."
  [tool]
  (:decode tool))

(defn- tool-call-fn
  "Extract the callable function from a tool definition map."
  [tool]
  (:fn tool))

(defn- run-tool
  "Execute a tool and return output chunks. Handles errors gracefully.

  If the tool has a `:decode` metadata function, it is applied to the parsed
  arguments before invocation. The decode function can coerce values and throw
  `:agent-error?` exceptions for validation failures.

  Chunks have a ::duration-ms key added for internal use which is not part of the aisdk spec."
  [tool-call-id tool-name tool chunks]
  (with-span :info {:name         :metabot.agent/run-tool
                    :tool-name    tool-name
                    :tool-call-id tool-call-id}
    (let [start-ms (u/start-timer)
          assoc-ms (fn [duration-ms]
                     (fn [chunk]
                       (cond-> chunk
                         (= (:type chunk) :tool-output-available) (assoc ::duration-ms duration-ms))))
          results  (try
                     (let [{:keys [arguments]} (into {} (aisdk-xf) chunks)
                           arguments (or (coerce-stringified-json arguments) {})
                           decode    (tool-decode-fn tool)
                           arguments (cond-> arguments decode decode)]
                       (log/debug "Executing tool" {:tool-name tool-name :arguments arguments})
                       (let [tool-fn (tool-call-fn tool)
                             result  (tool-fn arguments)]
                         (log/debug "Tool returned" {:tool-name tool-name :result-type (type result)})
                         (collect-tool-result tool-call-id tool-name result)))
                     (catch Exception e
                       (if (:agent-error? (ex-data e))
                         (log/debugf "Tool %s: agent validation error: %s" tool-name (ex-message e))
                         (log/warn e "Tool execution failed" {:tool-name tool-name}))
                       [{:type         :tool-output-available
                         :toolCallId   tool-call-id
                         :toolName     tool-name
                         :error        {:message (concise-tool-error e)
                                        :type    (str (type e))}}]))]
      (mapv (assoc-ms (u/since-ms start-ms))
            results))))

(defn tool-executor-xf
  "Transducer that executes tool calls in parallel on virtual threads.

  Behavior:
  - Passes all chunks through unchanged as they arrive
  - Tracks tool calls from :tool-input-start through :tool-input-available
  - Spawns virtual thread for each tool when input is complete
  - At completion, waits for all tools and appends results

  Tools can return: plain values, IReduceInit (reducible), or channels (legacy)."
  [tools]
  (fn [rf]
    (let [active (volatile! {})] ;; tool-call-id -> {:chunks [...]} or {:task derefable}
      (fn
        ([result]
         (let [{tasks  true
                chunks false} (group-by #(contains? (val %) :task) @active)]
           (when (seq chunks)
             (log/warn "Multiple tool calls were not collected fully before stream finish"
                       {:tool-calls (map first chunks)}))
           (if-let [tasks (some->> (seq tasks) (map #(:task (second %))))]
             (rf (reduce rf result (mapcat deref tasks)))
             (rf result))))

        ([result {:keys [type toolCallId toolName] :as chunk}]
         (case type
           :tool-input-start
           (when (contains? tools toolName)
             (vswap! active assoc toolCallId {:chunks [chunk]}))

           :tool-input-delta
           (when (contains? @active toolCallId)
             (vswap! active update-in [toolCallId :chunks] conj chunk))

           :tool-input-available
           (when-let [{:keys [chunks]} (get @active toolCallId)]
             (let [tool (get tools toolName)
                   task (submit-virtual (bound-fn* #(run-tool toolCallId toolName tool chunks)))]
               (vswap! active assoc toolCallId {:task task})))

           ;; otherwise: do nothing
           nil)

         (rf result chunk))))))

(defn rethrow-api-error!
  "Rethrow a provider HTTP exception with a translated, user-facing message.

  `res->message` receives the decoded response map and must return the message
  to surface to the client.  If the exception already carries `:api-error true`
  in its ex-data (e.g. a missing-API-key error from [[resolve-auth]]) it is
  rethrown as-is so the original message is preserved."
  [provider res->message e]
  (let [data (ex-data e)]
    (cond
      (:api-error data) (throw e)
      (:body data)      (let [res (json/decode-body data)]
                          (throw (ex-info (res->message res)
                                          (assoc res
                                                 :api-error  true
                                                 :provider   provider
                                                 :error-code :provider-api-error)
                                          e)))
      :else             (throw (ex-info (tru "{0} API request failed: {1}" provider (ex-message e))
                                        {:api-error  true
                                         :provider   provider
                                         :error-code :provider-request-failed}
                                        e)))))

(defn missing-api-key-ex
  "Create a standardized missing-API-key exception for provider adapters."
  [llm-type]
  (ex-info (tru "No {0} API key is set" llm-type)
           {:api-error  true
            :error-code :api-key-missing}))

(defn resolve-auth
  "Pick the right auth map for an LLM request.

  - When `ai-proxy?` is true, uses the Metabase Cloud proxy (errors if unconfigured).
   - Otherwise uses the provider's BYOK `auth`."
  [provider-slug llm-type auth ai-proxy?]
  (let [proxy-auth (when-let [base (llm/llm-proxy-base-url)]
                     {:url     (str (str/replace base #"/+$" "") "/" provider-slug)
                      :headers {"x-metabase-instance-token" (premium-features/premium-embedding-token)}})]
    (if ai-proxy?
      (or proxy-auth
          (throw (ex-info (tru "AI proxy is not configured")
                          {:api-error  true
                           :error-code :proxy-not-configured})))
      (or auth
          (throw (missing-api-key-ex llm-type))))))

(defn request
  "Perform an LLM HTTP request with the given auth (a map of `:url` and `:headers`)."
  [{:keys [url headers]} req]
  (http/request (-> req
                    (update :url #(str url %))
                    (update :headers merge headers))))
