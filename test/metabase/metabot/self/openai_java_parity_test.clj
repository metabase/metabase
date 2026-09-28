(ns metabase.metabot.self.openai-java-parity-test
  "Experiment: the Java `ResponsesTranslator` against the Clojure translator it replaced, kept verbatim below."
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [clojure.test.check.clojure-test :refer [defspec]]
   [clojure.test.check.generators :as gen]
   [clojure.test.check.properties :as prop]
   [metabase.metabot.self.core :as core]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------ the replaced Clojure code ------------------------------------------

(def ^:private translated-chunk-type?
  "Output item types we translate into AI SDK chunks."
  #{:text :function_call :reasoning})

(def ^:private stop-reasons
  "Responses API `incomplete_details.reason` → AI SDK v5 `FinishReason`. Only an incomplete response carries a reason,
  so there is nothing here for a normal or tool-call finish."
  {"max_output_tokens" "length"
   "content_filter"    "content-filter"})

(defn- openai-usage->aisdk-usage
  "Convert an OpenAI Responses API `usage` block into the AISDK `:usage` shape.

  Unlike Anthropic's disjoint input buckets (see `metabase.metabot.providers.anthropic.MessagesEvent#parseUsage`), OpenAI
  reports cached tokens as a subset breakdown of the input total:

      input_tokens                             — total input, cached portion included
      input_tokens_details.cached_tokens       — the cached subset of input_tokens
      input_tokens_details.cache_write_tokens  — should always be 0 (see below)
      output_tokens                            — completion tokens

  cache_write_tokens is absent from the Responses API docs, but present in live responses. We pass it through
  as :cacheCreationTokens so a count would surface in usage tracking if OpenAI ever starts populating it.

  Nested *_details maps are otherwise dropped: the result must stay flat so downstream `merge-with +` usage
  accumulation is safe."
  [u]
  {:promptTokens        (:input_tokens u 0)
   :completionTokens    (:output_tokens u 0)
   :cacheCreationTokens (get-in u [:input_tokens_details :cache_write_tokens] 0)
   :cacheReadTokens     (get-in u [:input_tokens_details :cached_tokens] 0)})

(defn- legacy-xf
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
                         ;; only emit an end marker for chunk types we translate.
                         (u/prog1 (if-let [end-type (case @current-type
                                                      :text          :text-end
                                                      :function_call :tool-input-available
                                                      :reasoning     :reasoning-end
                                                      nil)]
                                    (rf result (merge {:type end-type} @payload))
                                    result)
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
                            "reasoning_summary_text"  :reasoning
                            "reasoning_summary_part"  :reasoning
                            (keyword middle))
               chunk-id   (or (case chunk-type
                                ;; chunks that have natural id in API response go here
                                :function_call (:call_id item)
                                :text          (:id chunk)
                                :reasoning     (:id item)
                                nil)
                              @current-id
                              (core/mkid))]
           (cond-> result
             (= t "response.created")           (-> (rf {:type :start :messageId (:id response)})
                                                    (u/prog1
                                                      (vreset! model-name (:model response))))
             ;; a finished reasoning item carries the encrypted content that lets us
             ;; replay it next round-trip — ride it out on the reasoning-end's metadata
             (and (= t "response.output_item.done")
                  (= "reasoning" (:type item))
                  (= @current-id (:id item))
                  (:encrypted_content item))
             (u/prog1
               (vswap! payload assoc :providerMetadata
                       {:openai {:itemId           (:id item)
                                 :encryptedContent (:encrypted_content item)}}))

             ;; time to finish previous chunk
             ;; this logic will skip most of the *.done types, but they seem to be always followed by one of those two?
             (or (= t "response.output_item.done")
                 (and @current-id
                      (not= chunk-id
                            @current-id)))      (close!)
             ;; start of a new chunk — only for types we translate
             (and (= t "response.output_item.added")
                  (translated-chunk-type? chunk-type)) (-> (u/prog1
                                                             (vreset! current-type chunk-type)
                                                             (vreset! current-id chunk-id)
                                                             (vreset! payload
                                                                      (case @current-type
                                                                        ;; no :type in payloads since we'll use that for finish msg too
                                                                        :text          {:id chunk-id}
                                                                        :function_call {:toolCallId chunk-id
                                                                                        :toolName   (:name item)}
                                                                        :reasoning     {:id chunk-id}
                                                                        nil)))
                                                           (rf (merge (case @current-type
                                                                        :text          {:type :text-start}
                                                                        :function_call {:type :tool-input-start}
                                                                        :reasoning     {:type :reasoning-start}
                                                                        nil)
                                                                      @payload)))
             ;; a 2nd+ summary part is a new paragraph within the same reasoning item
             (and (= t "response.reasoning_summary_part.added")
                  (= @current-type :reasoning)
                  (pos? (:summary_index chunk 0)))
             (rf {:type :reasoning-delta :id @current-id :delta "\n\n"})

             ;; just a middle of a chunk — ignore deltas for types we don't translate
             (and delta
                  (translated-chunk-type? @current-type)) (rf (case @current-type
                                                                :text          {:type  :text-delta
                                                                                :id    @current-id
                                                                                :delta delta}
                                                                :reasoning     {:type  :reasoning-delta
                                                                                :id    @current-id
                                                                                :delta delta}
                                                                :function_call {:type           :tool-input-delta
                                                                                :toolCallId     (:toolCallId @payload)
                                                                                :inputTextDelta delta}))
             ;; `response.completed` and `response.incomplete` are both terminal events carrying final usage.
             ;; An incomplete response (e.g. truncated at max_output_tokens or stopped by a content filter)
             ;; still has valid partial output, so we record its usage rather than treating it as an error.
             (contains? #{"response.completed" "response.incomplete"} t)
             (rf (let [raw (get-in response [:incomplete_details :reason])]
                   (cond-> {:type  :usage
                            :usage (openai-usage->aisdk-usage (:usage response))
                            ;; non-standard extension, not in AISDK5
                            :id    (:id response)
                            :model @model-name}
                     raw (assoc :finish-reason     (metabot.tu/stop-reason->finish-reason stop-reasons raw)
                                :raw-finish-reason raw))))
             ;; `response.failed` is the Responses API's terminal failure event. Its error lives nested under
             ;; `response.error`, not in a top-level `error` event, so surface it explicitly.
             (= t "response.failed")            (rf {:type      :error
                                                     :errorText (or (get-in response [:error :message])
                                                                    (get-in response [:error :code])
                                                                    (tru "The model provider failed to complete the response"))})
             (= t "error")                      (rf {:type      :error
                                                     :errorText (or (:message error) (:message chunk))}))))))))


;;; --------------------------------------------------- parity ---------------------------------------------------

(defn- same? [events]
  (metabot.tu/same-translation? (legacy-xf) (openai/openai->aisdk-chunks-xf) events))

(deftest ^:parallel recorded-fixtures-parity-test
  (doseq [f ["openai-text" "openai-tool-calls" "openai-text-and-tool-calls" "openai-structured-output"]]
    (testing f
      (is (same? (metabot.tu/raw-fixture f (constantly nil)))))))

(deftest ^:parallel hand-written-parity-test
  (doseq [[desc events]
          {"reasoning with encrypted replay"
           [{:type "response.created" :response {:id "r" :model "gpt-5.5"}}
            {:type "response.output_item.added" :item {:type "reasoning" :id "rs_1"}}
            {:type "response.reasoning_summary_part.added" :summary_index 0}
            {:type "response.reasoning_summary_text.delta" :delta "a"}
            {:type "response.reasoning_summary_part.added" :summary_index 1}
            {:type "response.reasoning_summary_text.delta" :delta "b"}
            {:type "response.output_item.done" :item {:type "reasoning" :id "rs_1" :encrypted_content "enc"}}
            {:type "response.completed" :response {:id "r" :usage {:input_tokens 3 :output_tokens 4
                                                                   :input_tokens_details {:cached_tokens 1}}}}]
           "incomplete"
           [{:type "response.created" :response {:id "r" :model "m"}}
            {:type "response.output_item.added" :item {:type "message"}}
            {:type "response.output_text.delta" :delta "x"}
            {:type "response.incomplete" :response {:id "r" :incomplete_details {:reason "max_output_tokens"}}}]
           "incomplete with an unknown reason"
           [{:type "response.incomplete" :response {:id "r" :incomplete_details {:reason "whatever"}}}]
           "failed"
           [{:type "response.failed" :response {:error {:code "server_error"}}}
            {:type "response.failed" :response {}}
            {:type "error" :error {:message "boom"}}
            {:type "error" :message "flat"}]
           "stream cut short leaves a tool call open"
           [{:type "response.output_item.added" :item {:type "function_call" :call_id "c1" :name "f"}}
            {:type "response.function_call_arguments.delta" :delta "{"}]}]
    (testing desc
      (is (same? events)))))

;;; A generator of plausible, well-bracketed Responses streams: every item that is added is done before the next.

(def ^:private gen-item
  (gen/one-of [(gen/return {:type "message"})
               (gen/fmap (fn [n] {:type "function_call" :call_id (str "call_" n) :name "tool"}) gen/nat)
               (gen/fmap (fn [n] {:type "reasoning" :id (str "rs_" n)}) gen/nat)
               (gen/return {:type "web_search_call" :id "ws"})]))

(def ^:private gen-inner-event
  (gen/one-of [(gen/fmap (fn [d] {:type "response.output_text.delta" :delta d}) gen/string-alphanumeric)
               (gen/fmap (fn [d] {:type "response.function_call_arguments.delta" :delta d}) gen/string-alphanumeric)
               (gen/fmap (fn [d] {:type "response.reasoning_summary_text.delta" :delta d}) gen/string-alphanumeric)
               (gen/fmap (fn [i] {:type "response.reasoning_summary_part.added" :summary_index i}) (gen/choose 0 2))
               (gen/return {:type "response.content_part.added"})
               (gen/return {:type "response.output_text.done"})]))

(def ^:private gen-block
  (gen/let [item  gen-item
            inner (gen/vector gen-inner-event 0 5)
            enc   (gen/one-of [(gen/return nil) gen/string-alphanumeric])]
    (concat [{:type "response.output_item.added" :item item}]
            inner
            [{:type "response.output_item.done" :item (cond-> item enc (assoc :encrypted_content enc))}])))

(def ^:private gen-stream
  (gen/let [blocks (gen/vector gen-block 0 5)
            end    (gen/elements [[{:type "response.completed" :response {:id "r" :usage {:input_tokens 1}}}]
                                  [{:type "response.incomplete" :response {:id "r" :incomplete_details {:reason "content_filter"}}}]
                                  [{:type "response.failed" :response {:error {:message "no"}}}]
                                  []])]
    (vec (concat [{:type "response.created" :response {:id "r" :model "m"}}]
                 (apply concat blocks)
                 end))))

(defspec ^:parallel generated-streams-parity-test 300
  (prop/for-all [events gen-stream]
    (same? events)))

(deftest ^:parallel early-termination-test
  (testing "a `reduced` from downstream stops the stream, including one raised on a multi-chunk step"
    (let [events [{:type "response.created" :response {:id "r"}}
                  {:type "response.output_item.added" :item {:type "message"}}
                  {:type "response.output_text.delta" :delta "a"}
                  {:type "response.output_text.delta" :delta "b"}]]
      (is (= [:start :text-start]
             (mapv :type (into [] (comp (openai/openai->aisdk-chunks-xf) (take 2)) events)))))))

;;; ------------------------------------------- request side: input items -------------------------------------------

(defn- legacy-input
  "Convert a sequence of AISDK parts into OpenAI Responses API input items.

  Input: flat sequence of AISDK parts and user messages.
  Output: OpenAI Responses API input array."
  [parts]
  (into []
        (keep (fn [part]
                (case (:type part)
                  ;; with store:false the API keeps nothing server-side, so reasoning
                  ;; items ride along as encrypted content ahead of their tool calls;
                  ;; parts without it (bare summaries, foreign providers) drop
                  :reasoning   (when-let [content (get-in part [:provider-metadata :openai :encryptedContent])]
                                 {:type              "reasoning"
                                  :id                (or (get-in part [:provider-metadata :openai :itemId])
                                                         (:id part))
                                  :summary           []
                                  :encrypted_content content})
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
                  ;; user messages
                  {:role    (name (or (:role part) "user"))
                   :content (or (:content part) "")})))
        parts))

(def ^:private gen-part
  (let [s gen/string-alphanumeric]
    (gen/one-of
     [(gen/let [role    (gen/elements [nil :user "user" :system :assistant "tool"])
                content (gen/one-of [(gen/return nil) s])]
        (cond-> {:content content} role (assoc :role role)))
      (gen/fmap (fn [t] {:type :text :text t}) s)
      (gen/let [id s
                t  s
                pm (gen/elements [nil
                                  {:openai {:encryptedContent "enc" :itemId "rs_1"}}
                                  {:openai {:encryptedContent "enc"}}
                                  {:openai {:itemId "rs_2"}}
                                  {:anthropic {:signature "sig"}}
                                  {:anthropic {:signature "sig"} :openai {:encryptedContent "enc2"}}])]
        (cond-> {:type :reasoning :id id :text t} pm (assoc :provider-metadata pm)))
      (gen/let [id   s
                args (gen/elements [nil "{\"a\":1}" {:tz "UTC" :n 2}])]
        {:type :tool-input :id id :function "get-time" :arguments args})
      (gen/let [id     s
                result (gen/elements [nil "plain" 42 {:output "out"} {:output ""} {:structured-output {:a 1}}])
                error  (gen/elements [nil {:message "boom"} {}])]
        (cond-> {:type :tool-output :id id :result result} error (assoc :error error)))])))

(defspec ^:parallel generated-input-parity-test 300
  (prop/for-all [parts (gen/vector gen-part 0 8)]
    (= (legacy-input parts) (openai/parts->openai-input parts))))

(deftest ^:parallel unknown-message-role-is-refused-test
  (testing "a role the Responses API has no use for fails here, rather than at the provider"
    (is (= [{:role "developer" :content "x"}] (legacy-input [{:role :developer :content "x"}])))
    (is (thrown-with-msg? IllegalArgumentException #"not a message role: developer"
                          (openai/parts->openai-input [{:role :developer :content "x"}])))))
