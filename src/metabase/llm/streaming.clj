(ns metabase.llm.streaming
  "Streaming infrastructure for OSS LLM integration.

   Provides utilities for:
   - Parsing SSE (Server-Sent Events) streams from Anthropic
   - Converting Anthropic Messages format to AI SDK v5 protocol
   - Formatting output as AI SDK v5 SSE lines"
  (:require
   [clojure.core.async :as a]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ AI SDK v5 Type Prefixes ------------------------------------------------

(def type-prefix
  "AI SDK v5 type to prefix mapping.
   See: https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol"
  {:text           "0:"
   :data           "2:"
   :error          "3:"
   :finish-message "d:"
   :finish-step    "e:"
   :start-step     "f:"})

;;; ------------------------------------------------ SSE Parsing ------------------------------------------------

(defn- parse-sse-data
  "Parse SSE data JSON. Returns parsed map on success, or error map on failure."
  [data]
  (try
    {:ok (json/decode+kw data)}
    (catch Exception e
      (log/error e "Failed to parse SSE data" {:data data})
      {:error {:message (str "JSON parse error: " (ex-message e))}})))

(defn sse-chan
  "Turn an SSE InputStream into a channel of parsed JSON objects.

   Parses OpenAI-style SSE streams where each event is a `data: {...}` line.
   Closes the channel on EOF or when `data: [DONE]` is received.

   The channel closing will propagate back to close the InputStream,
   which terminates the HTTP connection."
  [^java.io.Closeable input]
  (let [out (a/chan 64)]
    (.start
     (doto (Thread/ofVirtual) (.name "sse-reader"))
     (fn []
       (try
         (with-open [r (io/reader input)]
           (loop []
             (when-let [line (.readLine ^java.io.BufferedReader r)]
               (cond
                 (= line "data: [DONE]")
                 nil

                 (str/starts-with? line "data: ")
                 (let [result (parse-sse-data (subs line 6))]
                   (if-let [parsed (:ok result)]
                     (when (a/>!! out parsed)
                       (recur))
                     (do
                       (a/>!! out result)
                       nil)))

                 :else
                 (recur)))))
         (catch Exception e
           (log/error e "SSE reader error"))
         (finally
           (a/close! out)))))
    out))

;;; ------------------------------------------ Anthropic SSE Parsing ------------------------------------------

(defn anthropic-sse-chan
  "Turn an Anthropic SSE InputStream into a channel of parsed JSON objects.

   Parses Anthropic-style SSE streams where events have an `event:` line followed by `data:`.
   Closes the channel on EOF or when `event: message_stop` is received.

   Anthropic streaming format:
   event: message_start
   data: {\"type\":\"message_start\",...}

   event: content_block_delta
   data: {\"type\":\"content_block_delta\",\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"...\"}}

   event: message_stop
   data: {\"type\":\"message_stop\"}"
  [^java.io.Closeable input]
  (let [out (a/chan 64)]
    (.start
     (doto (Thread/ofVirtual) (.name "anthropic-sse-reader"))
     (fn []
       (try
         (with-open [r (io/reader input)]
           (loop [current-event nil]
             (when-let [line (.readLine ^java.io.BufferedReader r)]
               (cond
                 (str/starts-with? line "event: ")
                 (let [event-type (subs line 7)]
                   (if (= event-type "message_stop")
                     nil
                     (recur event-type)))

                 (and (str/starts-with? line "data: ") current-event)
                 (let [result (parse-sse-data (subs line 6))]
                   (if-let [parsed (:ok result)]
                     (when (a/>!! out parsed)
                       (recur nil))
                     (do
                       (a/>!! out result)
                       nil)))

                 :else
                 (recur current-event)))))
         (catch Exception e
           (log/error e "Anthropic SSE reader error"))
         (finally
           (a/close! out)))))
    out))

;;; ------------------------------------------ OpenAI Chat Completions → AI SDK v5 ------------------------------------------

(defn openai-chat->aisdk-xf
  "Transducer: Convert OpenAI /v1/chat/completions streaming chunks to AI SDK text deltas.

   OpenAI Chat Completions streaming format:
   {:id \"chatcmpl-...\"
    :object \"chat.completion.chunk\"
    :choices [{:delta {:content \"Hello\"}}]}

   Output format:
   {:type :text-delta :delta \"Hello\"}"
  [rf]
  (fn
    ([] (rf))
    ([result] (rf result))
    ([result chunk]
     (if-let [content (-> chunk :choices first :delta :content)]
       (rf result {:type :text-delta :delta content})
       result))))

;;; ------------------------------------------ Anthropic Messages → AI SDK v5 ------------------------------------------

(defn anthropic-chat->aisdk-xf
  "Transducer: Convert Anthropic /v1/messages streaming chunks to AI SDK text deltas.

   Extracts partial JSON from tool_use input_json_delta events.

   Anthropic streaming format for tool_use:
   {:type \"content_block_delta\"
    :index 0
    :delta {:type \"input_json_delta\"
            :partial_json \"{\\\"sql\\\":\"}}

   Output format:
   {:type :text-delta :delta \"{\\\"sql\\\":\"}"
  [rf]
  (fn
    ([] (rf))
    ([result] (rf result))
    ([result chunk]
     (if (and (= "content_block_delta" (:type chunk))
              (= "input_json_delta" (-> chunk :delta :type)))
       (if-let [partial-json (-> chunk :delta :partial_json)]
         (rf result {:type :text-delta :delta partial-json})
         result)
       result))))

;;; ------------------------------------------------ SSE Output Formatting ------------------------------------------------

(defn format-sse-line
  "Format a value as an SSE line with AI SDK v5 type prefix.

   Type keys: :text, :data, :error, :finish-message, :finish-step, :start-step

   Example:
     (format-sse-line :text \"Hello\")
     ;; => \"0:\\\"Hello\\\"\\n\""
  [type-key value]
  (str (get type-prefix type-key) (json/encode value) "\n"))

(defn format-code-edit-part
  "Create an AI SDK v5 code_edit data part."
  [buffer-id sql]
  {:type    "code_edit"
   :version 1
   :value   {:buffer_id buffer-id
             :mode      "rewrite"
             :value     sql}})

(defn format-context-part
  "Create an AI SDK v5 context data part containing the system prompt and metadata."
  [{:keys [system-prompt dialect table-ids]}]
  {:type    "context"
   :version 1
   :value   {:system_prompt system-prompt
             :dialect       dialect
             :table_ids     (vec table-ids)}})

(defn format-finish-message
  "Create an AI SDK v5 finish message."
  [reason]
  {:finishReason reason})
