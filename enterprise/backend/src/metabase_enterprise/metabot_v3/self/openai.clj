(ns metabase-enterprise.metabot-v3.self.openai
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [malli.json-schema :as mjs]
   [malli.util :as mut]
   [metabase-enterprise.llm.settings :as llm]
   [metabase-enterprise.metabot-v3.self.core :as core]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn openai->aisdk-chunks-xf
  "Translates OpenAI /v1/responses streaming events into AI SDK v5 protocol chunks.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   OpenAI Responses Format:
   - Each event: {:type \"response.output_text.delta\" :delta ...}
                 {:type \"response.output_item.added\" :item {:id :type :output ...}}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  []
  (fn [rf]
    ;; we've got lots of state since aisdk has lots of start/stop/etc messages that raw openai does not
    (let [current-type (volatile! nil)
          current-id   (volatile! nil)
          model-name   (volatile! nil)
          payload      (volatile! {})
          close!       (fn [result]
                         (u/prog1 (rf result (merge {:type (case @current-type
                                                             :text          :text-end
                                                             :function_call :tool-input-available)}
                                                    @payload))
                           (vreset! current-type nil)
                           (vreset! current-id nil)
                           (vreset! payload {})))]
      ;; some notes about the approach:
      ;; - most of message types carry similar payload, like id for messages, or id+name for tool calls
      ;; - this trick with u/prog1 was chosen deliberately, a few approaches were made and they all looked worse
      ;; - most of dispatch is inlined rather than separated as multimethods is not an overlook to make function
      ;;   smaller, I'd rather contain this hairyness in a single piece while it's possible
      (fn
        ([result]
         (cond-> result
           ;; in case the response was incomplete we'll close up latest type
           @current-type (close!)
           true          (rf)))
        ([result {t :type :keys [response item delta error] :as chunk}]
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
                              (core/mkid))]
           (cond-> result
             (= t "response.created")           (-> (rf {:type :start :messageId (:id response)})
                                                    (u/prog1
                                                      (vreset! model-name (:model response))))
             ;; time to finish previous chunk
             ;; this logic will skip most of the *.done types, but they seem to be always followed by one of those two?
             (or (= t "response.output_item.done")
                 (and @current-id
                      (not= chunk-id
                            @current-id)))      (close!)
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
                                                     :id    (:id response)
                                                     :model @model-name})
             (= t "error")                      (rf {:type      :error
                                                     :errorText (or (:message error) (:message chunk))}))))))))

;;; AISDK parts → OpenAI Responses API input items

(defn parts->openai-input
  "Convert a sequence of AISDK parts into OpenAI Responses API input items.

  Input: flat sequence of AISDK parts and user messages.
  Output: OpenAI Responses API input array."
  [parts]
  (mapv (fn [part]
          (case (:type part)
            :text        {:type    "message"
                          :role    "assistant"
                          :content [{:type "output_text"
                                     :text (:text part)}]}
            :tool-input  {:type      "function_call"
                          :call_id   (:id part)
                          :name      (:function part)
                          :arguments (let [args (:arguments part)]
                                       (if (string? args) args (json/encode args)))}
            :tool-output {:type    "function_call_output"
                          :call_id (:id part)
                          :output  (or (get-in part [:result :output])
                                       (when-let [err (:error part)]
                                         (str "Error: " (:message err)))
                                       (pr-str (:result part)))}
            ;; User messages
            {:role    (name (or (:role part) "user"))
             :content (or (:content part) "")}))
        parts))

;;; Tool definition format

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
  "Perform a request to OpenAI.

  `:input` is a sequence of AISDK parts (and user messages).  They are converted
  to OpenAI Responses API input items via [[parts->openai-input]]."
  [{:keys [model system input tools schema]
    :or   {model "gpt-4.1-mini"
           input [{:role :user :content "Just tell something to a user"}]}}
   :- [:map
       [:model {:optional true} :string]
       [:system {:optional true} :string]
       [:input {:optional true} [:sequential :map]]
       [:tools {:optional true} [:sequential [:fn var?]]]
       ;; malli schema expected here
       ;; TODO: check it's a `:map`
       [:schema {:optional true} :any]]]
  (assert (llm/ee-openai-api-key) "No OpenAI API key!")
  (let [req {:model        model
             :stream       true
             :store        false
             :instructions system
             :input        (parts->openai-input input)
             :tool_choice  (when (seq tools) "auto")
             :tools        (when (seq tools) (mapv tool->openai tools))
             :text         (when schema
                             {:format {:type   "json_schema"
                                       :strict true
                                       :name   "schema"
                                       ;; OpenAI insists on `{additionalProperties false}`
                                       :schema (mjs/transform (mut/closed-schema schema))}})}]
    (try
      (let [res (http/post (str (llm/ee-openai-api-base-url) "/v1/responses")
                           {:as      :stream
                            :headers {"Authorization" (str "Bearer " (llm/ee-openai-api-key))
                                      "Content-Type"  "application/json"}
                            :body    (json/encode req)})]
        (core/sse-reducible (:body res)))
      (catch Exception e
        (if-let [res (ex-data e)]
          (throw (ex-info (.getMessage e) (json/decode-body res)))
          (throw e))))))

(defn openai
  "Call OpenAI API, return AISDK stream."
  [& args]
  (eduction (openai->aisdk-chunks-xf) (apply openai-raw args)))
