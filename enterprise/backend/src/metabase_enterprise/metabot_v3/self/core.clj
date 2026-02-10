(ns metabase-enterprise.metabot-v3.self.core
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.o11y :refer [with-span]])
  (:import
   (java.io BufferedReader Closeable)
   (java.util.concurrent Callable Executors ExecutorService)))

(set! *warn-on-reflection* true)

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
              (cond
                (= line "data: [DONE]")
                (reduced acc)

                (str/starts-with? line "data: ")
                ;; NOTE: we can do that since not one of providers spit json in multiple lines
                (recur (rf acc (json/decode+kw (subs line 6))))

                :else ;; FIXME: check if we get anything aside from empty lines here
                (recur acc))
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
    :text-start            {:type :text
                            :id   (:id chunk)
                            :text (->> (map :delta chunks)
                                       (str/join ""))}
    :tool-input-start      {:type      :tool-input
                            :id        (:toolCallId chunk)
                            :function  (:toolName chunk)
                            :arguments (parse-tool-arguments chunks)}
    :tool-output-available {:type     :tool-output
                            :id       (:toolCallId chunk)
                            :function (:toolName chunk)
                            :result   (:result chunk)
                            :error    (:error chunk)}))

(defn aisdk-xf
  "Collect a stream of AI SDK v5 messages into a list of parts (joins by id)."
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

;;; AI SDK v4 Line Protocol Output
;;
;; Converts internal parts to the AI SDK v4 line protocol format used by the Python ai-service.
;; Format examples:
;;   0:"text content"           - Text (just the string, JSON encoded)
;;   2:{"type":"state",...}     - Data parts
;;   3:"error message"          - Errors
;;   9:{"toolCallId":...}       - Tool calls
;;   a:{"toolCallId":...}       - Tool results
;;   d:{"finishReason":...}     - Finish message
;;   e:{...}                    - Finish step
;;   f:{"messageId":...}        - Start step

(defn format-text-line
  "Format text part as AI SDK line: 0:\"content\""
  [{:keys [text]}]
  (str "0:" (json/encode text)))

(defn format-data-line
  "Format data part as AI SDK line: 2:{\"type\":...,\"version\":1,\"value\":...}"
  [{:keys [data-type data] :as part}]
  ;; Support both old format (data-type + data) and new format (data map with type inside)
  (let [type-str (or data-type
                     (get data :type)
                     "data")
        value    (or data (dissoc part :type :id))]
    (str "2:" (json/encode {:type    (if (keyword? type-str) (name type-str) type-str)
                            :version 1
                            :value   value}))))

(defn format-error-line
  "Format error part as AI SDK line: 3:\"error message\""
  [{:keys [error]}]
  (str "3:" (json/encode (or (:message error) (str error)))))

(defn format-tool-call-line
  "Format tool-input part as AI SDK line: 9:{\"toolCallId\":...,\"toolName\":...,\"args\":...}"
  [{:keys [id function arguments]}]
  (str "9:" (json/encode {:toolCallId id
                          :toolName   function
                          :args       (if (string? arguments)
                                        arguments
                                        (json/encode arguments))})))

(defn format-tool-result-line
  "Format tool-output part as AI SDK line: a:{\"toolCallId\":...,\"result\":...}
  Always includes :result key (AI SDK protocol requirement). When there is only
  an error and no result, :result is set to the error message string."
  [{:keys [id result error]}]
  (let [output (cond
                 (string? result) result
                 (map? result)    (or (:output result) (json/encode result))
                 ;; When result is nil but error is present, use the error message as result
                 ;; so the `result` key is always present in the output.
                 (nil? result)    (some-> error :message str)
                 :else            (str result))]
    (str "a:" (json/encode (cond-> {:toolCallId id
                                    :result     (or output "")}
                             error (assoc :error (json/encode error)))))))

(defn format-finish-line
  "Format finish part as AI SDK line: d:{\"finishReason\":\"stop\",\"usage\":{...}}"
  [error? usage]
  (str "d:" (json/encode (cond-> {:finishReason (if error? "error" "stop")}
                           usage (assoc :usage usage)))))

(defn format-start-line
  "Format start part as AI SDK line: f:{\"messageId\":...}"
  [{:keys [id messageId]}]
  (str "f:" (json/encode {:messageId (or messageId id)})))

(defn aisdk-line-xf
  "Transducer that converts internal parts to AI SDK v4 line protocol format.
  Returns strings ready to be written to the output stream (without newlines).

  Input types and their output:
    :text       -> 0:\"content\"
    :data       -> 2:{\"type\":...,\"version\":1,\"value\":...}
    :error      -> 3:\"message\"
    :tool-input -> 9:{\"toolCallId\":...,\"toolName\":...,\"args\":...}
    :tool-output -> a:{\"toolCallId\":...,\"result\":...}
    :start      -> f:{\"messageId\":...}
    :finish     -> d:{\"finishReason\":\"stop\",\"usage\":{...}}
    :usage      -> (accumulated into finish message)"
  []
  (fn [rf]
    (let [usage-acc (volatile! {})
          error?    (volatile! false)]
      (fn
        ([] (rf))
        ([result]
         (-> result
             ;; Emit finish message with accumulated usage at the end
             (rf (format-finish-line @error? @usage-acc))
             (rf)))
        ([result part]
         (case (:type part)
           :text        (rf result (format-text-line part))
           :data        (rf result (format-data-line part))
           :error       (do
                          (vreset! error? true)
                          (rf result (format-error-line part)))
           :tool-input  (rf result (format-tool-call-line part))
           :tool-output (rf result (format-tool-result-line part))
           :start       (rf result (format-start-line part))
           :finish      result ;; Don't emit here, we emit in completion arity
           :usage       (let [{:keys [usage model]} part]
                          ;; Accumulate usage - format: {model-name {:prompt X :completion Y}}
                          (vswap! usage-acc update (or model "unknown")
                                  (fn [prev]
                                    {:prompt     (+ (:prompt prev 0) (:promptTokens usage 0))
                                     :completion (+ (:completion prev 0) (:completionTokens usage 0))}))
                          result)
           ;; Pass through unknown types as data
           (rf result (format-data-line part))))))))

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
  "Extract the `:decode` function from a tool (var, wrapped map, or fn with metadata).
  The decode function transforms tool arguments before the tool runs.
  Returns `nil` if the tool has no decoder."
  [tool]
  (cond
    (map? tool) (:decode tool)
    :else       (:decode (meta tool))))

(defn- tool-call-fn
  "Extract the callable function from a tool (var or wrapped map)."
  [tool]
  (if (map? tool) (:fn tool) tool))

(defn- run-tool
  "Execute a tool and return output chunks. Handles errors gracefully.

  If the tool has a `:decode` metadata function, it is applied to the parsed
  arguments before invocation. The decode function can coerce values and throw
  `:agent-error?` exceptions for validation failures."
  [tool-call-id tool-name tool chunks]
  (with-span :info {:name         :metabot-v3.agent/run-tool
                    :tool-name    tool-name
                    :tool-call-id tool-call-id}
    (try
      (let [{:keys [arguments]} (into {} (aisdk-xf) chunks)
            arguments (coerce-stringified-json arguments)
            decode    (tool-decode-fn tool)
            arguments (cond-> arguments decode decode)]
        (log/debug "Executing tool" {:tool-name tool-name :arguments arguments})
        (let [tool-fn (tool-call-fn tool)
              result  (tool-fn arguments)]
          (log/debug "Tool returned" {:tool-name tool-name :result-type (type result)})
          (collect-tool-result tool-call-id tool-name result)))
      (catch Exception e
        (log/warn e "Tool execution failed" {:tool-name tool-name})
        [{:type       :tool-output-available
          :toolCallId tool-call-id
          :toolName   tool-name
          :error      {:message (concise-tool-error e)
                       :type    (str (type e))}}]))))

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
