(ns metabase.metabot.self.google.stream-generate-content-java-parity-test
  "Experiment: the Java `GenerateContentTranslator` against the Clojure translator it replaced, kept verbatim below."
  (:require
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.google.stream-generate-content :as sgc]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ the replaced Clojure code ------------------------------------------

(defn- usage->aisdk-usage
  "Converts a `usageMetadata` block into the AISDK `:usage` shape.

  `promptTokenCount` is the total input count. `cachedContentTokenCount` is a part of that total, as with OpenAI, and
  not a separate bucket, as with Anthropic. Gemini reports thinking output separately as `thoughtsTokenCount`. Google
  bills it as output, thus it goes into :completionTokens. Implicit caching has no cache-write count, thus
  :cacheCreationTokens is always 0.

  `toolUsePromptTokenCount` counts the results of Google's server-side tools (code execution, URL context) fed back to
  the model as input. It is a bucket of its own, not a part of `promptTokenCount`, thus we sum it in, even though we
  don't currently support built-in server-side tools."
  [u]
  {:promptTokens        (+ (:promptTokenCount u 0)
                           (:toolUsePromptTokenCount u 0))
   :completionTokens    (+ (:candidatesTokenCount u 0)
                           (:thoughtsTokenCount u 0))
   :cacheCreationTokens 0
   :cacheReadTokens     (:cachedContentTokenCount u 0)})

(def ^:private finish-reason-completed
  "The one `finishReason` that means the model said all it had to say."
  "STOP")

(def ^:private finish-reason-truncated
  "The `finishReason` for a turn the model cut off at its output-token limit."
  "MAX_TOKENS")

(def ^:private stop-reasons
  "Gemini `finishReason` → AI SDK v5 `FinishReason`.
  Covers both Gemini surfaces: every reason Vertex documents, plus four exclusive to the Gemini Developer API.  We
  only ever call Vertex today, so those four are here in case we ever add Gemini API support or in case these ever
  wind up making their way into Vertex.
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/GenerateContentResponse#FinishReason
  https://ai.google.dev/api/generate-content#FinishReason"
  {finish-reason-completed     "stop"
   finish-reason-truncated     "length"
   "BLOCKLIST"                 "content-filter"
   "ESCALATION"                "content-filter" ; Gemini API only
   "IMAGE_PROHIBITED_CONTENT"  "content-filter"
   "IMAGE_RECITATION"          "content-filter"
   "IMAGE_SAFETY"              "content-filter"
   "LANGUAGE"                  "content-filter"
   "MODEL_ARMOR"               "content-filter"
   "PROHIBITED_CONTENT"        "content-filter"
   "RECITATION"                "content-filter"
   "SAFETY"                    "content-filter"
   "SPII"                      "content-filter"
   "IMAGE_OTHER"               "other"
   "NO_IMAGE"                  "other"
   "OTHER"                     "other"
   "FINISH_REASON_UNSPECIFIED" "other"
   "MALFORMED_FUNCTION_CALL"   "error"
   "MALFORMED_RESPONSE"        "error"          ; Gemini API only
   "MISSING_THOUGHT_SIGNATURE" "error"          ; Gemini API only
   "TOO_MANY_TOOL_CALLS"       "error"          ; Gemini API only
   "UNEXPECTED_TOOL_CALL"      "error"})

(def ^:private early-stops-without-error
  "The `finishReason` values that end the turn early but emit no :error chunk.
  The client already renders a message of its own for the AI SDK finish reason they translate to: \"length\" offers to
  continue the truncated answer, and \"content-filter\" says the response was filtered and suggests rephrasing. Every
  other early stop still needs an :error chunk, because nothing downstream would otherwise say what went wrong."
  (into #{}
        (keep (fn [[reason finish-reason]]
                (when (#{"length" "content-filter"} finish-reason)
                  reason)))
        stop-reasons))

(def ^:private finish-reasons-without-error
  "The `finishReason` values that emit no :error chunk: the early stops that speak for themselves, plus STOP, the one
  reason that is not a failure at all."
  (conj early-stops-without-error finish-reason-completed))

(defn- finish-reason-error
  "Returns the error text for a `finishReason` that needs one, or nil for the reasons that do not."
  [reason]
  (when-not (finish-reasons-without-error reason)
    (str "Gemini stopped early (" reason ")")))

(defn- legacy-xf
  "Translates `streamGenerateContent` SSE events into AI SDK v5 protocol chunks.

  Each SSE event is a `GenerateContentResponse`:
    {:responseId \"...\"
     :modelVersion \"gemini-...\"
     :candidates [{:content {:role \"model\" :parts [{:text \"...\"} {:functionCall {:name ... :args ...}}]}
                   :finishReason \"STOP\"}]
     :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 5 ...}}

  Emits the same internal chunk types as the other adapters:
    :start, :text-start, :text-delta, :text-end,
    :reasoning-start, :reasoning-delta, :reasoning-end,
    :tool-input-start, :tool-input-delta, :tool-input-available,
    :usage, :error

  Unlike Claude, there are no content-block start and stop events. Text streams as consecutive parts, and one open
  text block holds them all. Each functionCall part arrives with complete args, thus its start, delta, and available
  chunks go out together. Parts with `:thought true` are the thought summaries that [[request-body]] asks for; they
  stream as reasoning blocks the same way text does, and a thought/text transition closes the one block kind and
  opens the other. A `thoughtSignature` on a thought or text part is dropped: replaying one is optional, per the
  \"Signatures in non-functionCall Parts\" section of
  https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/thinking/thought-signatures, and reasoning
  is display-only for us. A `finishReason` closes the open text and reasoning blocks and is added to the :usage
  chunk as :finish-reason and :raw-finish-reason; the reasons that need one also emit an :error chunk (see
  [[finish-reason-error]]). Usage is buffered, the last value wins, and it goes out once at the end of the stream,
  because an event in the middle can have partial usageMetadata."
  []
  (fn [rf]
    (let [message-id       (volatile! nil)
          model-name       (volatile! nil)
          text-id          (volatile! nil) ; Non-nil while a text block is open.
          reasoning-id     (volatile! nil) ; Non-nil while a reasoning block is open.
          usage-acc        (volatile! nil)
          stop-reason      (volatile! nil)
          close-text!      (fn [result]
                             (if-let [id @text-id]
                               (do (vreset! text-id nil)
                                   (rf result {:type :text-end :id id}))
                               result))
          close-reasoning! (fn [result]
                             (if-let [id @reasoning-id]
                               (do (vreset! reasoning-id nil)
                                   (rf result {:type :reasoning-end :id id}))
                               result))
          close-blocks!    (fn [result]
                             (-> result close-text! close-reasoning!))
          finish!          (fn [result reason]
                             (vreset! stop-reason reason)
                             (when-not (= reason finish-reason-completed)
                               (log/info "Gemini stopped early" {:finishReason reason}))
                             (let [result (close-blocks! result)]
                               (if-let [error-text (finish-reason-error reason)]
                                 (rf result {:type :error :errorText error-text})
                                 result)))
          emit-part        (fn [result {:keys [text functionCall thought thoughtSignature]}]
                             (cond
                               functionCall
                               (let [tool-id (core/mkid)
                                     ids     {:toolCallId tool-id :toolName (:name functionCall)}
                                     ;; Gemini 3.x adds a thoughtSignature to functionCall parts, which
                                     ;; must go back to Google on replay. Put it on the start chunk,
                                     ;; thus it stays in the :tool-input part as :provider-metadata.
                                     start   (cond-> (merge {:type :tool-input-start} ids)
                                               thoughtSignature
                                               (assoc :providerMetadata
                                                      {:google {:thoughtSignature thoughtSignature}}))]
                                 (-> (close-blocks! result)
                                     (rf start)
                                     (rf {:type           :tool-input-delta
                                          :toolCallId     tool-id
                                          :inputTextDelta (json/encode (or (:args functionCall) {}))})
                                     (rf (merge {:type :tool-input-available} ids))))

                               ;; Thought and text share one block discipline: open a block only for
                               ;; text that is not empty, thus an empty part between tool calls does
                               ;; not divide them, and close the other block kind only when actually
                               ;; opening — a part that emits nothing must close nothing, because a
                               ;; signature can ride a part with empty text mid-stream. In an open
                               ;; block, blank deltas pass through and keep the whitespace.
                               thought
                               (if-let [id @reasoning-id]
                                 (if (some? text)
                                   (rf result {:type :reasoning-delta :id id :delta text})
                                   result)
                                 (if (empty? text)
                                   result
                                   (let [id (core/mkid)]
                                     (vreset! reasoning-id id)
                                     (-> (close-text! result)
                                         (rf {:type :reasoning-start :id id})
                                         (rf {:type :reasoning-delta :id id :delta text})))))

                               (some? text)
                               (if-let [id @text-id]
                                 (rf result {:type :text-delta :id id :delta text})
                                 (if (empty? text)
                                   result
                                   (let [id (core/mkid)]
                                     (vreset! text-id id)
                                     (-> (close-reasoning! result)
                                         (rf {:type :text-start :id id})
                                         (rf {:type :text-delta :id id :delta text})))))

                               :else
                               result))]
      (fn
        ([result]
         ;; An early stop that emits no :error chunk still needs a :usage chunk when the stream carried no
         ;; usageMetadata, so a truncated or filtered turn is never misinterpreted as a complete answer. The
         ;; reasons that do emit an :error chunk already say what went wrong, so they get no synthetic usage.
         (let [reason @stop-reason
               usage  (or @usage-acc
                          (when (early-stops-without-error reason)
                            (usage->aisdk-usage nil)))]
           (-> result
               (close-blocks!)
               (cond-> usage
                 (rf (cond-> {:type  :usage
                              :usage usage
                              :id    @message-id
                              :model @model-name}
                       reason (assoc :finish-reason     (metabot.tu/stop-reason->finish-reason stop-reasons reason)
                                     :raw-finish-reason reason))))
               (rf))))
        ([result {:keys [candidates usageMetadata responseId modelVersion promptFeedback error] :as _event}]
         (when (some? usageMetadata)
           (vreset! usage-acc (usage->aisdk-usage usageMetadata)))
         ;; modelVersion can appear on any event. Keep the last one for the :usage chunk.
         (when (some? modelVersion)
           (vreset! model-name modelVersion))
         (let [{:keys [content finishReason]} (first candidates)
               block-reason                   (:blockReason promptFeedback)]
           (cond-> result
             ;; Emit :start on the first event.
             (not @message-id)    (-> (u/prog1
                                        (vreset! message-id (or responseId (core/mkid))))
                                      (rf {:type :start :messageId @message-id}))
             (seq (:parts content)) (as-> res (u/reduce-preserving-reduced emit-part res (:parts content)))
             (some? finishReason) (finish! finishReason)
             ;; A blocked prompt ends the stream with no candidates, only promptFeedback.
             (some? block-reason) (-> (close-blocks!)
                                      (rf {:type      :error
                                           :errorText (str "Prompt blocked by Google: " block-reason)}))
             ;; An error envelope in the stream, e.g. a failure in the middle of the stream.
             (some? error)        (-> (close-blocks!)
                                      (rf {:type      :error
                                           :errorText (or (:message error) (pr-str error))})))))))))

;;; --------------------------------------------------- parity ---------------------------------------------------

(defn- same? [events]
  (metabot.tu/same-translation? (legacy-xf) (sgc/->aisdk-chunks-xf) events))

(deftest ^:parallel hand-written-parity-test
  (doseq [[desc events]
          {"thoughts then text then a signed function call, usage last-wins"
           [{:responseId "r1" :modelVersion "gemini-3-pro"
             :candidates [{:content {:role "model" :parts [{:text "plan" :thought true}]}}]
             :usageMetadata {:promptTokenCount 3}}
            {:candidates [{:content {:parts [{:text " more" :thought true} {:text "Answer"}]}}]}
            {:candidates [{:content {:parts [{:text "" :thoughtSignature "sig-tail"}]}}]}
            {:candidates [{:content {:parts [{:functionCall {:name "get-time" :args {:tz "UTC"}}
                                              :thoughtSignature "sig-1"}
                                             {:functionCall {:name "noop"}}]}
                           :finishReason "STOP"}]
             :modelVersion "gemini-3-pro-002"
             :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 5 :thoughtsTokenCount 2
                             :cachedContentTokenCount 4 :toolUsePromptTokenCount 1}}]
           "an early stop that speaks for itself gets synthetic usage"
           [{:candidates [{:content {:parts [{:text "partial"}]} :finishReason "SAFETY"}]}]
           "an early stop that needs an error gets none"
           [{:responseId "r" :candidates [{:finishReason "MALFORMED_FUNCTION_CALL"}]}]
           "blocked prompt, then an error envelope with and without a message"
           [{:responseId "r" :promptFeedback {:blockReason "PROHIBITED_CONTENT"}}
            {:error {:code 500 :message "Internal error"}}
            {:error {:code 503 :status "UNAVAILABLE"}}]
           "empty parts divide nothing, blank deltas pass through an open block"
           [{:candidates [{:content {:parts [{:text ""} {:text "a"} {:text " "} {:text "" :thought true}
                                             {:thought true} {:text "b"}]}}]}]}]
    (testing desc
      (is (same? events)))))

(def ^:private gen-part
  (gen/one-of
   [(gen/fmap (fn [t] {:text t}) (gen/one-of [(gen/elements ["" " "]) gen/string-alphanumeric]))
    (gen/fmap (fn [t] (cond-> {:thought true} t (assoc :text t)))
              (gen/one-of [(gen/elements [nil ""]) gen/string-alphanumeric]))
    (gen/let [args (gen/one-of [(gen/return nil)
                                (gen/map (gen/elements [:tz :city :n]) gen/string-alphanumeric {:max-elements 2})])
              sig  (gen/one-of [(gen/return nil) gen/string-alphanumeric])]
      (cond-> {:functionCall (cond-> {:name "tool"} args (assoc :args args))}
        sig (assoc :thoughtSignature sig)))
    (gen/return {:text "" :thoughtSignature "sig"})
    (gen/return {:inlineData {:mimeType "image/png"}})]))

(def ^:private gen-event
  (gen/let [parts (gen/vector gen-part 0 3)
            usage (gen/one-of [(gen/return nil)
                               (gen/fmap (fn [n] {:promptTokenCount n :candidatesTokenCount 1}) gen/nat)])
            model (gen/elements [nil "gemini-3-pro" "gemini-3-flash"])]
    (cond-> {:candidates [{:content {:role "model" :parts parts}}]}
      usage (assoc :usageMetadata usage)
      model (assoc :modelVersion model))))

(def ^:private gen-stream
  (gen/let [events  (gen/vector gen-event 0 5)
            id      (gen/elements [nil "resp-1"])
            reason  (gen/elements [nil "STOP" "MAX_TOKENS" "SAFETY" "RECITATION" "OTHER" "MALFORMED_FUNCTION_CALL" "BRAND_NEW"])
            ending  (gen/elements [:none :blocked :error])]
    (vec (concat (if (seq events)
                   (cond-> events
                     id     (update 0 assoc :responseId id)
                     reason (update (dec (count events)) assoc-in [:candidates 0 :finishReason] reason))
                   events)
                 (case ending
                   :none    []
                   :blocked [{:promptFeedback {:blockReason "SAFETY"}}]
                   :error   [{:error {:message "Overloaded"}}])))))

(defspec ^:parallel generated-streams-parity-test 300
  (prop/for-all [events gen-stream]
    (same? events)))

(deftest early-stop-still-logs-from-the-clojure-namespace-test
  (testing "the Java translator logs through Metabase's logging, so the line keeps its namespace and is captured"
    (let [messages (log.capture/with-log-messages-for-level [messages [metabase.metabot.self.google.stream-generate-content :info]]
                     (is (seq (into [] (sgc/->aisdk-chunks-xf) [{:candidates [{:finishReason "MAX_TOKENS"}]}])))
                     (messages))]
      (is (=? [{:namespace 'metabase.metabot.self.google.stream-generate-content
                :level     :info
                :message   #"Gemini stopped early.*MAX_TOKENS.*"}]
              messages)))))
