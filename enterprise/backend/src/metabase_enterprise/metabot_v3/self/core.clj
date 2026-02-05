(ns metabase-enterprise.metabot-v3.self.core
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log])
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
  "Format tool-output part as AI SDK line: a:{\"toolCallId\":...,\"result\":...}"
  [{:keys [id result error]}]
  (str "a:" (json/encode (cond-> {:toolCallId id}
                           result (assoc :result (if (string? result)
                                                   result
                                                   (json/encode result)))
                           error  (assoc :error (json/encode error))))))

(defn format-finish-line
  "Format finish part as AI SDK line: d:{\"finishReason\":\"stop\",\"usage\":{...}}"
  [error? accumulated-usage]
  (str "d:" (json/encode {:finishReason (if error? "error" "stop")
                          :usage        (or accumulated-usage {})})))

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
           :usage       (do
                          ;; Accumulate usage - format: {model-name {:prompt X :completion Y}}
                          (let [{:keys [usage id]} part
                                ;; FIXME: this is not the model id right now, plus it's not accumulated
                                model              (or id "claude-haiku-4-5")]
                            (vswap! usage-acc assoc model
                                    {:prompt     (:promptTokens usage 0)
                                     :completion (:completionTokens usage 0)}))
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

(defn- run-tool
  "Execute a tool and return output chunks. Handles errors gracefully."
  [tool-call-id tool-name tool-fn chunks]
  (try
    (let [{:keys [arguments]} (into {} (aisdk-xf) chunks)]
      (log/debug "Executing tool" {:tool-name tool-name :arguments arguments})
      (let [result (tool-fn arguments)]
        (log/debug "Tool returned" {:tool-name tool-name :result-type (type result)})
        (collect-tool-result tool-call-id tool-name result)))
    (catch Exception e
      (log/error e "Tool execution failed" {:tool-name tool-name})
      [{:type       :tool-output-available
        :toolCallId tool-call-id
        :toolName   tool-name
        :error      {:message (.getMessage e)
                     :type    (str (type e))}}])))

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
             (let [tool    (get tools toolName)
                   tool-fn (if (map? tool) (:fn tool) tool)
                   task    (submit-virtual (bound-fn* #(run-tool toolCallId toolName tool-fn chunks)))]
               (vswap! active assoc toolCallId {:task task})))

           ;; otherwise: do nothing
           nil)

         (rf result chunk))))))
