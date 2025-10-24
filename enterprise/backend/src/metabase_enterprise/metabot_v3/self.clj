(ns metabase-enterprise.metabot-v3.self
  "TODO:
  - done: figure out request cancellation
  - done: async tool calls appended to the same xf results
  - done: usage tracking - they'll go through and we can do whatever we want later on
  - done: test structured output
  - add anthropic api support to see how hard is to be heterogeneous
  - figure out what's lacking compared to ai-service"
  (:require
   [clj-http.client :as http]
   [clojure.core.async :as a]
   [clojure.core.async.impl.protocols :as impl]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [malli.util :as mut]
   [metabase-enterprise.llm.settings :as llm]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; abstractions

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

;;; OpenAI

(defn mkid
  "Generate a random id"
  []
  (str "mb-" (random-uuid)))

(defn openai->aisdk-xf
  "Translates OpenAI /v1/responses streaming events into AI SDK v5 protocol format.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   OpenAI Responses Format:
   - Each event: {:type \"response.output_text.delta\" :delta ...}
                 {:type \"response.output_item.added\" :item {:id :type :output ...}}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  [rf]
  ;; we've got lots of state since aisdk has lots of start/stop/etc messages that raw openai does not
  (let [current-type (volatile! nil)
        current-id   (volatile! nil)
        payload      (volatile! {})]
    ;; some notes about the approach:
    ;; - most of message types carry similar payload, like id for messages, or id+name for tool calls
    ;; - this trick with u/prog1 was chosen deliberately, a few approaches were made and they all looked worse
    ;; - most of dispatch is inlined rather than separated as multimethods is not an overlook to make function
    ;;   smaller, I'd rather contain this hairyness in a single piece while it's possible
    (fn
      ([result]
       (cond-> result
         ;; in case the response was incomplete we'll close up latest type
         @current-type    (rf (merge {:type (case @current-type
                                              :text          :text-end
                                              :function_call :tool-input-available)}
                                     @payload))
         true             (rf)))
      ([result {t :type :keys [response item delta] :as chunk}]
       (let [middle     (second (str/split t #"\."))
             chunk-type (case middle
                          "output_item"             (case (:type item)
                                                      "message" :text
                                                      (keyword (:type item)))
                          "content_part"            :text
                          "output_text"             :text
                          "function_call_arguments" :function_call
                          (keyword middle))
             chunk-id   (or (case chunk-type
                              ;; chunks that have natural id in API response go here
                              :function_call (:call_id item)
                              :text          (:id chunk)
                              nil)
                            @current-id
                            (mkid))]
         (cond-> result
           (= t "response.created")           (rf {:type :start :messageId (:id response)})
           ;; time to finish previous chunk
           ;; this logic will skip most of the *.done types, but they seem to be always followed by one of those two?
           (or (= t "response.output_item.done")
               (and @current-id
                    (not= chunk-id
                          @current-id)))      (-> (rf (merge {:type (case @current-type
                                                                      :text          :text-end
                                                                      :function_call :tool-input-available)}
                                                             @payload))
                                                  (u/prog1
                                                    (vreset! current-type nil)
                                                    (vreset! current-id nil)
                                                    (vreset! payload {})))
           ;; start of a new chunk
           (= t "response.output_item.added") (-> (u/prog1
                                                    (vreset! current-type chunk-type)
                                                    (vreset! current-id chunk-id)
                                                    (vreset! payload
                                                             (case @current-type
                                                               ;; no :type in payloads since we'll use that for finish msg too
                                                               :text          {:id chunk-id}
                                                               :function_call {:toolCallId chunk-id
                                                                               :toolName   (:name item)}
                                                               nil)))
                                                  (rf (merge (case @current-type
                                                               :text          {:type :text-start}
                                                               :function_call {:type :tool-input-start})
                                                             @payload)))
           ;; just a middle of a chunk
           delta                              (rf (case @current-type
                                                    :text          {:type  :text-delta
                                                                    :id    @current-id
                                                                    :delta delta}
                                                    :function_call {:type           :tool-input-delta
                                                                    :toolCallId     (:toolCallId @payload)
                                                                    :inputTextDelta delta}))
           (= (:type chunk)
              "response.completed")           (rf {:type  :usage
                                                   :usage (:usage response)
                                                   ;; non-standard extension, not in AISDK5
                                                   :id    (:id response)})))))))

(defn- tool->openai [tool]
  (let [{:keys [doc schema] :as tool} (if (map? tool) tool (meta tool))
        [_:=> [_:cat params] _out]    schema
        doc                           (if (str/starts-with? doc "Inputs: ")
                                        ;; strip that stuff we're appending in mu/defn
                                        (second (str/split doc #"\n\n  " 2))
                                        doc)]
    {:type        "function"
     :name        (name (:name tool))
     :description doc
     :parameters  (mjs/transform params {:additionalProperties false})}))

(mu/defn openai-raw
  "Perform a request to OpenAI"
  [{:keys [model system input tools schema]
    :or   {model "gpt-4.1-mini"
           input [{:role "system" :content "Just tell something to a user"}]}}
   :- [:map
       [:model {:optional true} :string]
       [:system {:optional true} :string]
       [:input {:optional true} [:vector [:map
                                          [:role [:enum "user" "assistant"]]
                                          [:content :string]]]]
       [:tools {:optional true} [:sequential [:fn var?]]]
       ;; malli schema expected here
       ;; TODO: check it's a `:map`
       [:schema {:optional true} :any]]]
  (assert (llm/ee-openai-api-key) "No OpenAI API key!")
  (let [req {:model        model
             :stream       true
             :store        false
             :instructions system
             :input        input
             :tool_choice  (when (seq tools) "auto")
             :tools        (when (seq tools) (mapv tool->openai tools))
             :text         (when schema
                             {:format {:type   "json_schema"
                                       :strict true
                                       :name   "schema"
                                       ;; OpenAI insists on `{additionalProperties false}`
                                       :schema (mjs/transform (mut/closed-schema schema))}})}]
    (try
      (let [res (http/post "https://api.openai.com/v1/responses"
                           {:as      :stream
                            :headers {"Authorization" (str "Bearer " (llm/ee-openai-api-key))
                                      "Content-Type"  "application/json"}
                            :body    (json/encode req)})]
        (sse-chan (:body res)))
      (catch Exception e
        (if-let [res (ex-data e)]
          (throw (ex-info (.getMessage e) (json/decode-body res)))
          (throw e))))))

(defn openai
  "Perform a request to OpenAI"
  [& args]
  ;; pipe returns destination channel \o/
  (a/pipe (apply openai-raw args) (a/chan 64 openai->aisdk-xf)))

(comment
  (llm/ee-openai-api-key)
  (llm/ee-ai-features-enabled)
  (def sys
    "You MUST call tools for time or currency questions. If asked 'what time' or 'convert X to Y', do not guess—always call the relevant tool first.")

  (def usr
    "What time is it right now in Europe/Kyiv, and convert 100 EUR to UAH.")

  (def q (a/<!! (a/into [] (openai-raw {:messages [{:role "system" :content sys}
                                                   {:role "user" :content usr}]
                                        :tools    (vals TOOLS)})))))

;;; AISDK helpers

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

;;; tools

(mu/defn get-time
  "Return current time for a given IANA timezone."
  [{:keys [tz]} :- [:map {:closed true}
                    [:tz [:string {:description "IANA timezone, e.g. Europe/Bucharest"}]]]]
  (str (java.time.ZonedDateTime/now (java.time.ZoneId/of tz))))

(mu/defn convert-currency
  "Convert an amount between two ISO currencies using a dummy rate."
  [{:keys [amount from to]} :- [:map {:closed true}
                                [:amount :float]
                                [:from :string]
                                [:to :string]]]
  (Thread/sleep 500) ;; we're doing some request to some far away service
  (let [rate (if (= [from to] ["EUR" "USD"]) 1.16 1.0)]
    {:amount    amount
     :from      from
     :to        to
     :rate      rate
     :converted (* amount rate)}))

(mu/defn analyze-data-trend
  "Analyze a data trend by calling back to the LLM for natural language insights.
  This demonstrates a recursive LLM call pattern commonly used in agentic workflows."
  [{:keys [metric values period]} :- [:map {:closed true}
                                      [:metric [:string {:description "The metric being analyzed, e.g. 'revenue', 'users'"}]]
                                      [:values [:vector {:description "Time series values"} number?]]
                                      [:period [:string {:description "Time period, e.g. 'Q1 2025', 'last 6 months'"}]]]]
  ;; Simulate calling back to LLM with a mini-prompt
  (let [prompt (format "Analyze this %s trend over %s: %s. Provide a 1-2 sentence insight highlighting key patterns."
                       metric period (pr-str values))]
    (openai {:messages [{:role "user" :content prompt}]})))

(def TOOLS
  "All the defined tools"
  (u/index-by
   #(-> % meta :name name)
   [#'get-time
    #'convert-currency
    #'analyze-data-trend]))

(comment
  (map tool->openai (vals TOOLS)))

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

(comment
  (def q (a/<!! (a/into [] (analyze-data-trend {:metric "revenue"
                                                :values [100.0 120.0 145.0 160.0]
                                                :period "Q1 2025"}))))
  (def w (into [] (comp openai->aisdk-xf #_(tool-executor-rff TOOLS)) q))
  (def e (into [] aisdk-xf w))

  (def q (a/<!! (a/into [] (openai-raw
                            {:system "You are a data analysis assistant. When users provide time-series data and ask for insights, use the analyze-data-trend tool to generate interpretations. Always call the tool rather than making up your own analysis."
                             :input [{:role "user" :content "Can you analyze these trends? Revenue for Q1: [50000, 55000, 58000, 62000] and customer count: [100, 110, 105, 115]. What story do these numbers tell?"}]
                             :tools    (vals TOOLS)}))))

  (def q (a/<!! (a/into [] (openai-raw
                            {:input [{:role "user" :content "Can you tell me currencies of three northmost American countries?"}]
                             :schema [:map
                                      [:currencies [:sequential [:map
                                                                 [:country [:string {:description "Three-letter code"}]]
                                                                 [:currency [:string {:description "Three-letter code"}]]]]]]})))))
