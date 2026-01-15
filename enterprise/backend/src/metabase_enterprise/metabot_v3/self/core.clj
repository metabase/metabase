(ns metabase-enterprise.metabot-v3.self.core
  (:require
   [clojure.core.async :as a]
   [clojure.core.async.impl.protocols :as impl]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(defn mkid
  "Generate a random id"
  []
  (str "mb-" (random-uuid)))

(defn chan?
  "Checks if argument is a `core.async/chan`"
  [x]
  (satisfies? impl/Channel x))

;; we're using channels because of backpressure and ability to close them
(defn sse-chan
  "Turn an SSE InputStream into a channel of `data` strings.
   Closes the channel on EOF."
  [^java.io.Closeable input]
  (let [out (a/chan 64)]
    (.start
     (doto (Thread/ofVirtual) (.name "sse-reader"))
     (fn []
       ;; NOTE: parsing is oriented towards OpenAI-like SSE stream, where there are only `data: ...` lines with json.
       ;; Feel free to adjust once we have better understanding.
       (with-open [r (io/reader input)]
         (loop []
           (when-let [line (.readLine ^java.io.BufferedReader r)]
             (cond
               (= line "data: [DONE]")          nil
               ;; this `when` is doing the heavy lifting here: `>!!` will return `false` if the channel is closed:
               ;; - which exits the loop
               ;; - which exits `with-open`
               ;; - which closes the `io/reader`
               ;; - which closes the underlying `InputStream`
               ;; and closes the http connection, which should stop the LLM
               (str/starts-with? line "data: ") (when (a/>!! out (json/decode+kw (subs line 6)))
                                                  (recur))
               :else                            (recur)))))
       (a/close! out)))
    out))

;;; AISDK5

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
                            :arguments (->> (map :inputTextDelta chunks)
                                            (str/join "")
                                            json/decode+kw)}
    :tool-output-available {:type     :tool-output
                            :id       (:toolCallId chunk)
                            :function (:toolName chunk)
                            :result   (:result chunk)
                            :error    (:error chunk)}))

(defn aisdk-xf
  "Collect a stream of AI SDK v5 messages into a list of parts (joins by id)."
  [rf]
  ;; FIXME: logic relies on chunks pieces not being interleaved which won't hold for long if we will use
  ;; `tool-executor-rff`
  (let [current-id (volatile! nil)
        acc        (volatile! [])]
    (fn
      ([result]
       (cond-> result
         (seq @acc) (rf (aisdk-chunks->part @acc))
         true       rf))
      ([result chunk]
       (let [chunk-id (or (:id chunk)
                          (:toolCallId chunk))]
         (if (not= chunk-id @current-id)
           (u/prog1 (cond-> result
                      (seq @acc) (rf (aisdk-chunks->part @acc)))
             (vreset! current-id chunk-id)
             (vreset! acc [chunk]))
           (u/prog1 result
             (vswap! acc conj chunk))))))))

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
        value (or data (dissoc part :type :id))]
    (str "2:" (json/encode {:type (if (keyword? type-str) (name type-str) type-str)
                            :version 1
                            :value value}))))

(defn format-error-line
  "Format error part as AI SDK line: 3:\"error message\""
  [{:keys [error]}]
  (str "3:" (json/encode (or (:message error) (str error)))))

(defn format-tool-call-line
  "Format tool-input part as AI SDK line: 9:{\"toolCallId\":...,\"toolName\":...,\"args\":...}"
  [{:keys [id function arguments]}]
  (str "9:" (json/encode {:toolCallId id
                          :toolName function
                          :args (if (string? arguments)
                                  arguments
                                  (json/encode arguments))})))

(defn format-tool-result-line
  "Format tool-output part as AI SDK line: a:{\"toolCallId\":...,\"result\":...}"
  [{:keys [id result error]}]
  (str "a:" (json/encode (cond-> {:toolCallId id}
                           result (assoc :result (if (string? result)
                                                   result
                                                   (json/encode result)))
                           error (assoc :error (json/encode error))))))

(defn format-finish-line
  "Format finish part as AI SDK line: d:{\"finishReason\":\"stop\",\"usage\":{...}}"
  [accumulated-usage]
  (str "d:" (json/encode {:finishReason "stop"
                          :usage (or accumulated-usage {})})))

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
  [rf]
  (let [usage-acc (volatile! {})]
    (fn
      ([] (rf))
      ([result]
       ;; Emit finish message with accumulated usage at the end
       (rf (rf result (format-finish-line @usage-acc))))
      ([result part]
       (case (:type part)
         :text        (rf result (format-text-line part))
         :data        (rf result (format-data-line part))
         :error       (rf result (format-error-line part))
         :tool-input  (rf result (format-tool-call-line part))
         :tool-output (rf result (format-tool-result-line part))
         :start       (rf result (format-start-line part))
         :finish      result ;; Don't emit here, we emit in completion arity
         :usage       (do
                        ;; Accumulate usage - format: {model-name {:prompt X :completion Y}}
                        (let [{:keys [usage id]} part
                              model (or id "claude-sonnet-4-5-20250929")]
                          (vswap! usage-acc assoc model
                                  {:prompt (:promptTokens usage 0)
                                   :completion (:completionTokens usage 0)}))
                        result)
         ;; Pass through unknown types as data
         (rf result (format-data-line part)))))))

;;; Fancy tool executor guy

(defn tool-executor-rff
  "Transducer that intercepts tool calls, executes them asynchronously, and appends results at the end.

  - Passes all chunks through unchanged
  - When `:tool-input-start` appears with a tool name from TOOLS, starts tracking that tool call
  - Collects arguments from `:tool-input-delta` chunks
  - When `:tool-input-available` appears, fires off async tool execution
  - At completion, appends all tool results to the stream

  NOTE: AISDK5 has only `:tool-output-available` that's sync in nature, so for channels returned (presumably from
  LLMS) we just directly append them to our stream."
  [tools]
  (fn [rf]
    ;; id -> [chunks...] at first, id -> part + :chan later
    (let [active-tools (volatile! {})]
      (fn
        ([result]
         (let [chans (keep :chan (vals @active-tools))]
           (if (empty? chans)
             (rf result)
             ;; Use a/thread to drain channels to avoid blocking in dispatch thread
             ;; a/<!! is safe inside a/thread block
             (let [results-promise (promise)
                   merged (a/merge chans)]
               (a/thread
                 (deliver results-promise
                          (loop [acc []]
                            (if-let [v (a/<!! merged)]
                              (recur (conj acc v))
                              acc))))
               (rf (reduce rf result @results-promise))))))

        ([result chunk]
         (case (:type chunk)
           :tool-input-start            ; start collecting chunks if tool is known
           (let [tool-name    (:toolName chunk)
                 tool-call-id (:toolCallId chunk)]
             (when (contains? tools tool-name)
               (vswap! active-tools assoc tool-call-id [chunk]))
             (rf result chunk))

           :tool-input-delta            ; append a chunk if we're interested in this tool
           (let [tool-call-id (:toolCallId chunk)]
             (when (contains? @active-tools tool-call-id)
               (vswap! active-tools update tool-call-id conj chunk))
             (rf result chunk))

           ;; grab a tool, execute and send everything to a channel that's going to be examined in
           ;; reducing arity up there
           :tool-input-available
           (let [tool-name    (:toolName chunk)
                 tool-call-id (:toolCallId chunk)]
             (when-let [chunks (seq (get @active-tools tool-call-id))]
               (let [tool-fn (get tools tool-name)
                     chan    (a/chan 10)]
                 (vswap! active-tools assoc tool-call-id {:chan chan})
                 (future
                   (try
                     ;; time to combine those chunks in a sensible representation;
                     ;; we're doing that in a `future` because we're saving some μs (haven't measured yet)
                     (let [{:keys [arguments]
                            :as   tool-call} (into {} aisdk-xf chunks)
                           _                 (vswap! active-tools update tool-call-id merge tool-call)
                           result            (tool-fn arguments)
                           done-ch           (a/chan)]
                       (if (chan? result)
                         (do
                           (a/pipeline 1 chan (remove #(#{:start :finish} (:type %))) result done-ch)
                           (a/<!! done-ch)) ;; wait until pipeline stops
                         (a/>!! chan {:type       :tool-output-available
                                      :toolCallId tool-call-id
                                      :toolName   tool-name
                                      :result     result})))
                     (catch Exception e
                       (a/>!! chan {:type       :tool-output-available
                                    :toolCallId tool-call-id
                                    :toolName   tool-name
                                    :error      {:message (.getMessage e)
                                                 :type    (str (type e))}}))
                     (finally
                       (a/close! chan))))))
             (rf result chunk))

           ;; default
           (rf result chunk)))))))
