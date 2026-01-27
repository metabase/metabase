(ns metabase-enterprise.metabot-v3.self.claude
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

(defn claude->aisdk-xf
  "Translates Claude /v1/messages streaming events into AI SDK v5 protocol format.

   https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol

   Claude Streaming Format:
   - Each event: {:type \"message_start\" :message {...}}
                 {:type \"content_block_start\" :index 0 :content_block {:type \"text\"}}
                 {:type \"content_block_delta\" :index 0 :delta {:type \"text_delta\" :text \"...\"}}
                 {:type \"content_block_stop\" :index 0}
                 {:type \"message_delta\" :delta {:stop_reason \"end_turn\"}}
                 {:type \"message_stop\"}

   AI SDK v5 Format (SSE protocol):
   - Message parts: {:type :start, :messageId ...}
   - Part types: start, text-start, text-delta, text-end, finish-step, finish
   - Ends with: 'data: [DONE]\\n'"
  [rf]
  (let [current-type (volatile! nil)
        current-id   (volatile! nil)
        message-id   (volatile! nil)
        payload      (volatile! {})]
    (fn
      ([result]
       (cond-> result
         ;; close up latest type if incomplete
         @current-type (rf (merge {:type (case @current-type
                                           :text     :text-end
                                           :tool_use :tool-input-available)}
                                  @payload))
         true          (rf)))
      ([result {t :type :keys [message content_block delta usage]}]
       (let [block-type (when content_block
                          (keyword (:type content_block)))
             chunk-id   (or (:id content_block)
                            #_(when (= @current-id index)
                                (:id @payload))
                            @current-id
                            (core/mkid))]
         (cond-> result
           ;; start of message
           (= t "message_start")       (-> (rf {:type :start :messageId (:id message)})
                                           (u/prog1
                                             (vreset! message-id (:id message))))
           ;; start of new content block
           (= t "content_block_start") (-> (u/prog1
                                             (vreset! current-type block-type)
                                             (vreset! current-id chunk-id)
                                             (vreset! payload
                                                      (case block-type
                                                        :text     {:id chunk-id}
                                                        :tool_use {:toolCallId chunk-id
                                                                   :toolName   (:name content_block)}
                                                        nil)))
                                           (rf (merge (case block-type
                                                        :text     {:type :text-start}
                                                        :tool_use {:type :tool-input-start})
                                                      @payload)))

           ;; content block delta
           (= t "content_block_delta") (rf (case (:type delta)
                                             "text_delta"       {:type  :text-delta
                                                                 :id    (:id @payload)
                                                                 :delta (:text delta)}
                                             "input_json_delta" {:type           :tool-input-delta
                                                                 :toolCallId     (:toolCallId @payload)
                                                                 :inputTextDelta (:partial_json delta)}))

           ;; end of content block
           (= t "content_block_stop") (-> (rf (merge {:type (case @current-type
                                                              :text     :text-end
                                                              :tool_use :tool-input-available)}
                                                     @payload))
                                          (u/prog1
                                            (vreset! current-type nil)
                                            (vreset! current-id nil)
                                            (vreset! payload {})))
           ;; message delta (usage info)
           (= t "message_delta")      (cond->
                                       usage (rf {:type  :usage
                                                  :usage {:promptTokens     (:input_tokens usage)
                                                          :completionTokens (:output_tokens usage)}
                                                  :id    @message-id}))

           ;; end of message
           (= t "message_stop") identity))))))

(defn- tool->claude
  "Convert a tool to Claude API format.
  Accepts either:
  - A var (legacy) - uses var name as tool name
  - A [name, var] pair - uses explicit name
  - A [name, {:doc :schema :fn}] map - for wrapped tools"
  [tool-or-pair]
  (let [[tool-name tool] (if (vector? tool-or-pair)
                           tool-or-pair
                           [nil tool-or-pair])
        {:keys [doc schema]} (if (map? tool) tool (meta tool))
        [_:=> [_:cat params] _out] schema
        doc (if (str/starts-with? (or doc "") "Inputs: ")
              ;; strip that stuff we're appending in mu/defn
              (second (str/split doc #"\n\n  " 2))
              doc)
        ;; For wrapped tools, tool-name is provided; for vars, extract from metadata
        final-name (or tool-name
                       (when (var? tool) (name (:name (meta tool))))
                       "unknown")]
    {:name         final-name
     :description  doc
     :input_schema (mjs/transform params {:additionalProperties false})}))

(mu/defn claude-raw
  "Perform a request to Claude API"
  [{:keys [model system input tools schema]
    :or   {model "claude-haiku-4-5"
           input [{:role "user" :content "Hello"}]}}
   :- [:map
       [:model {:optional true} :string]
       [:system {:optional true} :string]
       [:input {:optional true} [:vector [:map
                                          [:role [:enum "user" "assistant"]]
                                          ;; Content can be string or array of content blocks
                                          ;; (for tool_use and tool_result in multi-turn)
                                          [:content [:or :string [:sequential :map]]]]]]
       [:tools {:optional true} [:sequential [:or
                                              [:fn var?]
                                              [:tuple :string [:fn var?]]
                                                  ;; Also accept [name, {:doc :schema :fn}] for wrapped tools
                                              [:tuple :string [:map
                                                               [:doc {:optional true} [:maybe :string]]
                                                               [:schema :any]
                                                               [:fn [:fn fn?]]]]]]]
       [:schema {:optional true} :any]]]
  (assert (llm/ee-anthropic-api-key) "No Anthropic API key!")
  (let [req (cond-> {:model      model
                     :max_tokens 4096
                     :stream     true
                     :messages   input}
              system      (assoc :system system)
              (seq tools) (assoc :tools (mapv tool->claude tools))
              schema      (assoc :tool_choice {:type "tool"
                                               :name "structured_output"}
                                 :tools [{:name         "structured_output"
                                          :description  "Output structured data"
                                          :input_schema (mjs/transform (mut/closed-schema schema))}]))]
    (try
      (let [res (http/post "https://api.anthropic.com/v1/messages"
                           {:as      :stream
                            :headers {"x-api-key"         (llm/ee-anthropic-api-key)
                                      "anthropic-version" "2023-06-01"
                                      "content-type"      "application/json"}
                            :body    (json/encode req)})]
        (core/sse-reducible (:body res)))
      (catch Exception e
        (if-let [res (ex-data e)]
          (throw (ex-info (.getMessage e) (json/decode-body res)))
          (throw e))))))

(defn claude
  "Call Claude API, return AISDK stream"
  [& args]
  (eduction claude->aisdk-xf (apply claude-raw args)))

(comment
  ;; Now just use standard `into` - no core.async needed!
  (def q (into [] (claude-raw {:input [{:role "user" :content "How are you feeling today?"}]})))

  (into [] (comp claude->aisdk-xf core/aisdk-xf) q))
