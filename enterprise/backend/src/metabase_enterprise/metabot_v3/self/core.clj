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
         (let [merged (a/merge (keep :chan (vals @active-tools)))]
           (rf (reduce rf result (take-while some? (repeatedly #(let [v (a/<!! merged)] v)))))))

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

