(ns metabase.metabot.self.vllm-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.openai.chat-completions :as chat-completions]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.net ConnectException SocketTimeoutException)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private base-url "http://vllm.internal:8000/v1")

(def ^:private credentials
  "What a resolved vLLM connection hands the adapter: adapters read credentials only, never settings."
  {:base-url base-url})

(def ^:private keyed-credentials
  "A connection to a server started with --api-key."
  (assoc credentials :api-key "local-dev-key"))

(def ^:private reasoning-credentials
  "A connection whose connect-time probe found the served model streaming its reasoning."
  (assoc credentials vllm/reasoning-config-key "true"))

;;; ──────────────────────────────────────────────────────────────────
;;; vllm-request-body
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-applies-default-max-tokens-test
  (testing "an explicit max_tokens is always sent — without one vLLM falls back to the whole remaining context window"
    (is (= (llm.settings/llm-max-tokens)
           (:max_tokens (vllm/vllm-request-body {:model "vllm-test"
                                                 :input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-caller-max-tokens-wins-test
  (testing "a caller-supplied max-tokens is not overridden by the default"
    (is (= 128
           (:max_tokens (vllm/vllm-request-body {:model      "vllm-test"
                                                 :input      [{:role :user :content "hi"}]
                                                 :max-tokens 128}))))))

(deftest ^:parallel request-body-raises-max-tokens-for-a-forced-tool-call-test
  (testing "a forced tool call gets the token floor even when the caller asked for less"
    (testing "schema"
      (is (= 2048
             (:max_tokens (vllm/vllm-request-body {:model      "vllm-test"
                                                   :input      [{:role :user :content "hi"}]
                                                   :schema     {:type "object"}
                                                   :max-tokens 128})))))
    (testing "tool_choice required"
      (is (= 2048
             (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                   :input       [{:role :user :content "hi"}]
                                                   :tools       [(metabot.tu/get-time-tool)]
                                                   :tool_choice "required"
                                                   :max-tokens  128})))))))

(deftest ^:parallel request-body-floor-never-lowers-a-ceiling-test
  (testing "a caller-supplied ceiling above the floor is left alone"
    (is (= 8192
           (:max_tokens (vllm/vllm-request-body {:model      "vllm-test"
                                                 :input      [{:role :user :content "hi"}]
                                                 :schema     {:type "object"}
                                                 :max-tokens 8192}))))))

(deftest ^:parallel request-body-floor-applies-only-to-forced-tool-calls-test
  (testing "an unforced request keeps the caller's ceiling — the floor exists for thinking that precedes a tool call"
    (is (= 128
           (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                 :input       [{:role :user :content "hi"}]
                                                 :tools       [(metabot.tu/get-time-tool)]
                                                 :tool_choice "auto"
                                                 :max-tokens  128}))))))

(deftest ^:parallel request-body-raises-max-tokens-for-a-reasoning-model-test
  (testing "the agent path forces nothing and supplies no ceiling, so a reasoning model would otherwise get
           the shared 4096 default for thinking, answer, and tool call combined"
    (is (= 16384
           (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                 :input       [{:role :user :content "hi"}]
                                                 :credentials reasoning-credentials}))))
    (testing "and a model the probe found does not reason keeps the default"
      (is (= (llm.settings/llm-max-tokens)
             (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                   :input       [{:role :user :content "hi"}]
                                                   :credentials credentials})))))))

(deftest ^:parallel request-body-reasoning-floor-outranks-the-forced-tool-call-floor-test
  (testing "a reasoning model has to clear its thinking before the forced call, so the higher floor wins"
    (is (= 16384
           (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                 :input       [{:role :user :content "hi"}]
                                                 :schema      {:type "object"}
                                                 :max-tokens  128
                                                 :credentials reasoning-credentials}))))))

(deftest ^:parallel request-body-reasoning-floor-never-lowers-a-ceiling-test
  (testing "a caller asking for more than the floor is left alone"
    (is (= 32000
           (:max_tokens (vllm/vllm-request-body {:model       "vllm-test"
                                                 :input       [{:role :user :content "hi"}]
                                                 :max-tokens  32000
                                                 :credentials reasoning-credentials}))))))

(deftest ^:parallel request-body-no-default-model-test
  (testing "the model is never defaulted — a vLLM server's model name is whatever the operator loaded"
    (is (nil? (:model (vllm/vllm-request-body {:input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-system-and-stream-test
  (testing "the system prompt leads the messages and the request streams with usage included"
    (let [body (vllm/vllm-request-body {:model  "vllm-test"
                                        :system "You are a helpful assistant."
                                        :input  [{:role :user :content "hi"}]})]
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first)))
      (is (true? (:stream body)))
      (is (= {:include_usage true} (:stream_options body))))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (vllm/vllm-request-body {:model "vllm-test"
                                     :input [{:role :user :content "hi"}]
                                     :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (vllm/vllm-request-body {:model  "vllm-test"
                                     :input  [{:role :user :content "hi"}]
                                     :schema {:type       "object"
                                              :properties {:title {:type "string"}}}})))))

(deftest ^:parallel request-body-temperature-test
  (testing "a caller's temperature passes through"
    (is (= 0.7
           (:temperature (vllm/vllm-request-body {:model       "vllm-test"
                                                  :input       [{:role :user :content "hi"}]
                                                  :temperature 0.7})))))
  (testing "temperature 0 is honoured rather than treated as absent"
    (is (= 0
           (:temperature (vllm/vllm-request-body {:model       "vllm-test"
                                                  :input       [{:role :user :content "hi"}]
                                                  :temperature 0}))))))

(deftest ^:parallel request-body-supplies-a-default-temperature-test
  (testing "a caller that supplies none gets the adapter default rather than vLLM's own 1.0"
    (is (= @#'vllm/default-temperature
           (:temperature (vllm/vllm-request-body {:model "vllm-test"
                                                  :input [{:role :user :content "hi"}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion
;;;
;;; Recorded verbatim from vLLM 0.26.0 serving Qwen3-14B with
;;; `--tool-call-parser hermes`.
;;; ──────────────────────────────────────────────────────────────────

(def ^:private recorded-tool-call-stream
  (let [msg-id "chatcmpl-ba409270f617984a"
        arg    (fn [s] {:id      msg-id :model "vllm-test"
                        :choices [{:index 0 :delta {:content nil :tool_calls [{:index 0 :function {:arguments s}}]}
                                   :finish_reason nil}]})]
    (into [{:id msg-id :model "vllm-test" :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
           {:id msg-id :model "vllm-test" :choices [{:index 0 :delta {:content "<think>"} :finish_reason nil}]}
           {:id msg-id :model "vllm-test" :choices [{:index 0 :delta {:content "\n\n"} :finish_reason nil}]}
           {:id msg-id :model "vllm-test" :choices [{:index 0 :delta {:content "</think>"} :finish_reason nil}]}
           {:id msg-id :model "vllm-test" :choices [{:index 0 :delta {:content "\n\n"} :finish_reason nil}]}
           {:id      msg-id :model "vllm-test"
            :choices [{:index 0
                       :delta {:content    nil
                               :tool_calls [{:id       "chatcmpl-tool-acf1cddb0052df26"
                                             :type     "function"
                                             :index    0
                                             :function {:name "record_table_name"}}]}
                       :finish_reason nil}]}]
          cat
          [(map arg ["{\"" "table" "_name" "\":" " \"" "orders" "\"}"])
           [{:id msg-id :model "vllm-test" :choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
            {:id      msg-id :model "vllm-test" :choices []
             :usage   {:prompt_tokens 163 :total_tokens 189 :completion_tokens 26}}]])))

(deftest ^:parallel recorded-streamed-tool-call-conv-test
  (testing "a tool call whose id arrives only on the first delta accumulates into one tool-input"
    (let [parts (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)) recorded-tool-call-stream)]
      (is (=? {:type      :tool-input
               :id        "chatcmpl-tool-acf1cddb0052df26"
               :function  "record_table_name"
               :arguments {:table_name "orders"}}
              (first (filter #(= :tool-input (:type %)) parts)))))))

(deftest ^:parallel recorded-usage-has-no-cache-details-test
  (testing "vLLM reports no prompt_tokens_details, so the cache columns come through as zero rather than throwing"
    (let [parts (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)) recorded-tool-call-stream)]
      (is (=? {:type  :usage
               :model "vllm-test"
               :usage {:promptTokens        163
                       :completionTokens    26
                       :cacheCreationTokens 0
                       :cacheReadTokens     0}}
              (first (filter #(= :usage (:type %)) parts)))))))

(deftest ^:parallel think-tags-reach-the-text-stream-test
  (testing "without --reasoning-parser a model's thinking arrives in delta.content and streams as assistant text"
    (let [text (->> (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)) recorded-tool-call-stream)
                    (filter #(= :text (:type %)))
                    (map :text)
                    (apply str))]
      (is (re-find #"<think>" text)))))

;;; Recorded from vLLM 0.26.0 serving Qwen3-14B with `--reasoning-parser qwen3`. The shape that
;;; could not be guessed: the field is `reasoning`, not `reasoning_content` — 0.26 renamed it and
;;; documents the old spelling as deprecated. The opening chunk carries `content ""`, which must not
;;; open a text block ahead of the reasoning.
(def ^:private reasoning-stream
  [{:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {:role "assistant" :content ""} :finish_reason nil}]}
   {:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {:reasoning "\nOkay"} :finish_reason nil}]}
   {:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {:reasoning ", the user asks 2+2."} :finish_reason nil}]}
   {:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {:content "Four"} :finish_reason nil}]}
   {:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {:content "."} :finish_reason nil}]}
   {:id "chatcmpl-b3043ba7f7b178ce" :model "vllm-test"
    :choices [{:index 0 :delta {} :finish_reason "stop"}]}])

;;; The deprecated spelling, still emitted by older vLLM builds and other OpenAI-compatible servers.
(def ^:private deprecated-reasoning-stream
  (mapv (fn [chunk]
          (update-in chunk [:choices 0 :delta]
                     (fn [delta]
                       (if-let [r (:reasoning delta)]
                         (-> delta (dissoc :reasoning) (assoc :reasoning_content r))
                         delta))))
        reasoning-stream))

(deftest ^:parallel reasoning-becomes-reasoning-parts-test
  (testing "with --reasoning-parser, thinking streams as reasoning and the answer still streams as text"
    (doseq [[spelling stream] {"reasoning"         reasoning-stream
                               "reasoning_content" deprecated-reasoning-stream}]
      (testing spelling
        (let [parts (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)) stream)]
          (is (= ["\nOkay, the user asks 2+2."] (map :text (filter #(= :reasoning (:type %)) parts))))
          (is (= ["Four."] (map :text (filter #(= :text (:type %)) parts)))))))))

(deftest ^:parallel reasoning-chunks-are-bracketed-test
  (testing "the raw chunk stream brackets reasoning the way self.core expects to group it"
    (let [chunks  (into [] (vllm/vllm->aisdk-chunks-xf) reasoning-stream)
          by-type (group-by :type chunks)]
      (testing "the opening `content \"\"` chunk does not open a text block ahead of the reasoning"
        (is (= [:start :reasoning-start :reasoning-delta :reasoning-delta :reasoning-end
                :text-start :text-delta :text-delta :text-end]
               (mapv :type chunks))))
      (testing "every reasoning chunk shares one id, so aisdk-xf joins them into a single part"
        (is (= 1 (count (into #{} (map :id) (mapcat by-type [:reasoning-start :reasoning-delta :reasoning-end])))))))))

(deftest ^:parallel reasoning-forwarding-is-opt-in-test
  (testing "the shared xf still drops reasoning for the adapters that did not opt in"
    (doseq [[spelling stream] {"reasoning"         reasoning-stream
                               "reasoning_content" deprecated-reasoning-stream}]
      (testing spelling
        (let [parts (into [] (comp (chat-completions/chat-completions->aisdk-chunks-xf) (self.core/aisdk-xf))
                          stream)]
          (is (empty? (filter #(= :reasoning (:type %)) parts)))
          (is (= ["Four."] (map :text (filter #(= :text (:type %)) parts)))))))))

;;; Recorded verbatim from vLLM 0.26.0 serving vllm-test with
;;; `--served-model-name vllm-test --max-model-len 32768 --enable-auto-tool-choice --tool-call-parser hermes --reasoning-parser qwen3`.
;;; Inert envelope fields (created, logprobs, object, prompt_text, prompt_token_ids, service_tier, system_fingerprint, token_ids) dropped for size;
;;; the full capture is under `logs/ai/requests/`.
;;; 155 chunks captured, 22 kept: each run of reasoning deltas is truncated
;;; to its first 2 (133 reasoning dropped). Nothing structural is removed.
(def ^:private recorded-parallel-tool-call-stream
  [{:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [{:index 0, :delta {:role "assistant", :content ""}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [{:index 0, :delta {:reasoning "\n"}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [{:index 0, :delta {:reasoning "Okay"}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [{:index 0, :delta {:content "\n\n"}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0,
      :delta
      {:content nil,
       :tool_calls
       [{:id "chatcmpl-tool-96102e0493e264b7", :type "function", :index 0, :function {:name "record_table_name"}}]},
      :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "{\""}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "table"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "_name"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "\":"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments " \""}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "orders"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 0, :function {:arguments "\"}"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0,
      :delta
      {:content nil,
       :tool_calls
       [{:id "chatcmpl-tool-b34f3b547d2105f2", :type "function", :index 1, :function {:name "record_column_name"}}]},
      :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "{\""}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "column"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "_name"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "\":"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments " \""}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "total"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices
    [{:index 0, :delta {:content nil, :tool_calls [{:index 1, :function {:arguments "\"}"}}]}, :finish_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [{:index 0, :delta {}, :finish_reason "tool_calls", :stop_reason nil}]}
   {:id "chatcmpl-8ad4c404bbb917ae",
    :model "vllm-test",
    :choices [],
    :usage {:prompt_tokens 244, :total_tokens 426, :completion_tokens 182}}])

(deftest ^:parallel recorded-parallel-tool-calls-become-separate-parts-test
  (testing "two tool calls in one assistant message accumulate into two parts, each with its own arguments"
    (let [calls (->> recorded-parallel-tool-call-stream
                     (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)))
                     (filter #(= :tool-input (:type %))))]
      (is (= [{:id "chatcmpl-tool-96102e0493e264b7" :function "record_table_name"
               :arguments {:table_name "orders"}}
              {:id "chatcmpl-tool-b34f3b547d2105f2" :function "record_column_name"
               :arguments {:column_name "total"}}]
             (mapv #(select-keys % [:id :function :arguments]) calls))))))

(deftest ^:parallel recorded-parallel-tool-calls-do-not-interleave-test
  (testing "the xf keys transitions on the tool-call id and never reads index, which is safe only because
           hermes emits each call's deltas as one contiguous run"
    (let [deltas (for [chunk  recorded-parallel-tool-call-stream
                       choice (:choices chunk)
                       tc     (get-in choice [:delta :tool_calls])]
                   tc)]
      (testing "index arrives in contiguous runs, not interleaved"
        (is (= [0 0 0 0 0 0 0 0 1 1 1 1 1 1 1 1] (mapv :index deltas))))
      (testing "id arrives on each call's opening delta only — a provider repeating it would lose the
                arguments, since neither the start branch nor the argument-delta branch would fire"
        (is (= [0 1] (keep #(when (:id %) (:index %)) deltas)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-chat-request!
  "Run `vllm-raw` against a stubbed transport and return the request it issued."
  [opts]
  (let [captured (atom nil)]
    (with-redefs [self.core/sse-reducible (fn [_] (reify clojure.lang.IReduceInit
                                                    (reduce [_ _rf init] init)))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [req] (reset! captured req) {:body nil})]
      (vllm/vllm-raw opts))
    @captured))

(deftest vllm-auth-sends-bearer-token-when-configured-test
  (testing "the connection's API key becomes an Authorization header against its base URL"
    (is (=? {:method  :post
             :url     "http://vllm.internal:8000/v1/chat/completions"
             :headers {"Authorization" "Bearer local-dev-key"}
             :body    string?}
            (captured-chat-request! {:model       "vllm-test"
                                     :input       [{:role :user :content "hi"}]
                                     :credentials keyed-credentials})))))

(deftest vllm-auth-omits-authorization-without-a-key-test
  (testing "a keyless server is a complete configuration — no Authorization header, and no missing-key error"
    (let [req (captured-chat-request! {:model       "vllm-test"
                                       :input       [{:role :user :content "hi"}]
                                       :credentials credentials})]
      (is (= "http://vllm.internal:8000/v1/chat/completions" (:url req)))
      (is (not (contains? (:headers req) "Authorization"))))))

(deftest vllm-sets-a-socket-timeout-test
  (testing "generation requests carry the vLLM socket timeout and the shared connection timeout"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-request-timeout-ms 300000]
      (is (=? {:socket-timeout     300000
               :connection-timeout (llm.settings/llm-connection-timeout-ms)}
              (captured-chat-request! {:model       "vllm-test"
                                       :input       [{:role :user :content "hi"}]
                                       :credentials credentials}))))))

(deftest vllm-auth-missing-base-url-test
  (testing "a connection carrying no base URL fails with a message naming vLLM, not a clj-http error about a
           relative URL"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No vLLM base URL is set"
           (vllm/vllm-raw {:model       "vllm-test"
                           :input       [{:role :user :content "hi"}]
                           :credentials {:api-key "local-dev-key"}})))
      (is (= :base-url-missing
             (:error-code (try (vllm/list-models {:credentials {:api-key "local-dev-key"}})
                               (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))

(deftest vllm-missing-model-test
  (testing "a blank model fails with a vLLM-specific message before any request is made"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No vLLM model is set"
           (vllm/vllm-raw {:input [{:role :user :content "hi"}] :credentials credentials}))))))

(deftest vllm-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for vLLM"
           (vllm/vllm-raw {:model "vllm-test" :input [{:role :user :content "hi"}] :ai-proxy? true})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for vLLM"
           (vllm/list-models {:ai-proxy? true}))))))

(deftest vllm-stream-socket-timeout-is-not-retryable-test
  (testing "a socket timeout while consuming the stream surfaces as a tagged vLLM error, not a raw SocketTimeoutException"
    (with-redefs [self.core/sse-reducible (fn [_]
                                            (reify clojure.lang.IReduceInit
                                              (reduce [_ _rf _init]
                                                (throw (SocketTimeoutException. "Read timed out")))))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (try (into [] (vllm/vllm-raw {:model       "vllm-test"
                                            :input       [{:role :user :content "hi"}]
                                            :credentials credentials}))
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= :vllm-timeout (:error-code (ex-data e))))
        (is (re-find #"stopped responding" (ex-message e)))
        (testing "and is not retryable"
          (is (false? (#'self/retryable-error? e))))))))

(deftest vllm-stream-connection-failure-is-not-retryable-test
  (testing "a stream severed mid-body surfaces as a tagged vLLM error, not a raw IOException"
    (with-redefs [self.core/sse-reducible (fn [_]
                                            (reify clojure.lang.IReduceInit
                                              (reduce [_ _rf _init]
                                                (throw (java.io.IOException. "Connection reset")))))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (try (into [] (vllm/vllm-raw {:model       "vllm-test"
                                            :input       [{:role :user :content "hi"}]
                                            :credentials credentials}))
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= :vllm-stream-interrupted (:error-code (ex-data e))))
        (is (re-find #"interrupted before the response finished" (ex-message e)))
        (testing "and is not retryable"
          (is (false? (#'self/retryable-error? e))))))))

(deftest vllm-mid-stream-non-io-error-is-translated-test
  (testing "a mid-stream failure that is not IO gets the shared provider translation, the same as every
           other adapter — `io-guarded` composes with `reducible-with-api-errors` rather than replacing it"
    (with-redefs [self.core/sse-reducible (fn [_]
                                            (reify clojure.lang.IReduceInit
                                              (reduce [_ _rf _init]
                                                (throw (ex-info "clj-http: status 500"
                                                                {:status 500 :body "{\"message\":\"boom\"}"})))))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (try (into [] (vllm/vllm-raw {:model       "vllm-test"
                                            :input       [{:role :user :content "hi"}]
                                            :credentials credentials}))
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= :provider-api-error (:error-code (ex-data e))))
        (is (re-find #"vLLM returned an internal server error" (ex-message e)))))))

(deftest vllm-request-timeout-names-vllm-and-its-setting-test
  (testing "a timeout while establishing the request gets the same treatment the preflight already gives it,
           rather than `rethrow-api-error!`'s \"vllm API request failed: Read timed out\""
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-request-timeout-ms 300000]
      (with-redefs [http/request (fn [_] (throw (SocketTimeoutException. "Read timed out")))]
        (let [e (try (vllm/vllm-raw {:model       "vllm-test"
                                     :input       [{:role :user :content "hi"}]
                                     :credentials credentials})
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (= :vllm-timeout (:error-code (ex-data e))))
          (is (re-find #"did not respond within 300000ms" (ex-message e)))
          (is (re-find #"raise the vLLM request timeout" (ex-message e)))
          (testing "and is not retryable"
            (is (false? (#'self/retryable-error? e)))))))))

(deftest vllm-unreachable-server-names-the-base-url-test
  (testing "a refused connection is the base URL being wrong or the server being down — say which URL failed"
    (with-redefs [http/request (fn [_] (throw (ConnectException. "Connection refused")))]
      (let [e (try (vllm/vllm-raw {:model       "vllm-test"
                                   :input       [{:role :user :content "hi"}]
                                   :credentials credentials})
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= :vllm-unreachable (:error-code (ex-data e))))
        (is (re-find #"Could not reach the vLLM server at http://vllm\.internal:8000/v1" (ex-message e)))
        (testing "and is not retryable"
          (is (false? (#'self/retryable-error? e))))))))

(deftest vllm-http-errors-still-reach-the-status-specific-message-test
  (testing "the IOException catch runs first, so a non-2xx must still be translated by `vllm-error-msg`"
    (with-redefs [http/request (fn [_] (throw (ex-info "clj-http: status 401"
                                                       {:status 401 :body "{\"message\":\"Unauthorized\"}"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"vLLM API key expired or invalid"
           (vllm/vllm-raw {:model       "vllm-test"
                           :input       [{:role :user :content "hi"}]
                           :credentials credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models
;;; ──────────────────────────────────────────────────────────────────

;;; Recorded from vLLM 0.26.0 serving mlx-community/Qwen3-14B-4bit with
;;; `--served-model-name vllm-test vllm-test-alias qwen3-14b` (BOT-1930 L-10). Aliases are the cheapest
;;; multi-entry catalog: several ids over one loaded model. Note the key set — there is no `name`, so
;;; `display_name` always falls back to the served id on vLLM, and `parent` is present-and-nil rather
;;; than absent. `:permission` is dropped here; nothing reads it.
(def ^:private recorded-multi-model-catalog
  [{:id "vllm-test"       :object "model" :created 1786676106 :owned_by "vllm"
    :root "mlx-community/Qwen3-14B-4bit" :parent nil :max_model_len 32768}
   {:id "vllm-test-alias" :object "model" :created 1786676106 :owned_by "vllm"
    :root "mlx-community/Qwen3-14B-4bit" :parent nil :max_model_len 32768}
   {:id "qwen3-14b"       :object "model" :created 1786676106 :owned_by "vllm"
    :root "mlx-community/Qwen3-14B-4bit" :parent nil :max_model_len 32768}])

(deftest list-models-passes-the-catalog-through-test
  (testing "every served model is offered — there is no whitelist — in the order the server lists them"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "http://vllm.internal:8000/v1/models"
                                                        :headers {"Authorization" "Bearer local-dev-key"}}
                                                       req))
                                               {:status 200 :body {:data recorded-multi-model-catalog}})]
      (is (= {:models [{:id "vllm-test"       :display_name "vllm-test"}
                       {:id "vllm-test-alias" :display_name "vllm-test-alias"}
                       {:id "qwen3-14b"       :display_name "qwen3-14b"}]}
             (vllm/list-models {:credentials keyed-credentials}))))))

;;; Recorded from the same server started **without** `--served-model-name` (BOT-1930 L-10), which is
;;; how an operator who does not rename their deployment sees it: the catalog id is the Hugging Face
;;; repo id, slashes and all, and `root` equals `id` rather than sitting behind an alias.
(def ^:private recorded-no-alias-catalog
  [{:id "mlx-community/Qwen3-14B-4bit" :object "model" :created 1786676633 :owned_by "vllm"
    :root "mlx-community/Qwen3-14B-4bit" :parent nil :max_model_len 32768}])

(deftest list-models-keeps-slashes-in-a-served-model-id-test
  (testing "a Hugging Face repo id survives the listing intact — `llm-metabot-provider` stores it as
           `vllm/{id}`, so the model segment is the only one allowed to keep its slashes"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data recorded-no-alias-catalog}})]
      (is (= {:models [{:id "mlx-community/Qwen3-14B-4bit" :display_name "mlx-community/Qwen3-14B-4bit"}]}
             (vllm/list-models {:credentials credentials}))))))

(deftest list-models-display-name-falls-back-to-the-served-id-test
  (testing "a `name` is honoured when present, though no vLLM build emits one — the tolerance is for the
           other OpenAI-compatible servers the same UI copy invites"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               {:status 200
                                                :body   {:data [{:id "some-finetune" :name "Some Finetune"}]}})]
      (is (= {:models [{:id "some-finetune" :display_name "Some Finetune"}]}
             (vllm/list-models {:credentials credentials}))))))

(deftest list-models-does-not-fall-back-to-the-single-provider-settings-test
  (testing "the connection's credentials are the only source — a setting configuring another connection
           is not a fallback"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url "http://saved:8000/v1"
                                       llm.settings/llm-vllm-api-key      "saved-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "http://explicit:8000/v1/models"
                                                          :headers {"Authorization" "Bearer explicit-key"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (vllm/list-models {:credentials {:base-url "http://explicit:8000/v1"
                                                :api-key  "explicit-key"}}))))
      (testing "and a connection without a base URL fails rather than borrowing the setting's"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No vLLM base URL is set"
             (vllm/list-models {:credentials {:api-key "explicit-key"}})))))))

(deftest list-models-fails-closed-on-a-body-that-is-not-a-catalog-test
  (testing "a 2xx whose body carries no model list throws, naming the base URL"
    (doseq [body [{:status "ok" :service "some-other-thing"} {:object "list"} "<html>404</html>"]]
      (testing (str "body " (pr-str body))
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body body})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"vLLM returned an unexpected model list response.*http://vllm\.internal:8000/v1"
               (vllm/list-models {:credentials credentials})))))))
  (testing "a well-formed but empty catalog lists nothing and gets its own distinct message"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list" :data []}})]
      (is (= {:models []} (vllm/list-models {:credentials credentials})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"reachable but is not serving any models"
           (vllm/list-models {:credentials credentials :probe? true}))))))

(deftest list-models-fails-closed-before-probing-test
  (testing "a malformed catalog throws without issuing a probe request"
    (let [chat-requests (atom 0)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                 (when-not (re-find #"/models$" (str url))
                                                   (swap! chat-requests inc))
                                                 {:status 200 :body {:status "ok"}})]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"vLLM returned an unexpected model list response"
             (vllm/list-models {:credentials credentials :probe? true})))
        (is (zero? @chat-requests))))))

(deftest list-models-401-maps-to-invalid-key-message-test
  (testing "a 401 surfaces as the canonical message naming --api-key"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               (throw (ex-info "clj-http: status 401"
                                                               {:status 401
                                                                :body   "{\"message\":\"Unauthorized\"}"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"vLLM API key expired or invalid"
           (vllm/list-models {:credentials (assoc credentials :api-key "wrong-key")}))))))

(deftest list-models-404-points-at-the-base-url-test
  (testing "a 404 tells the admin the base URL should end in /v1"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               (throw (ex-info "clj-http: status 404" {:status 404 :body "not found"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"base URL should end in /v1"
           (vllm/list-models {:credentials {:base-url "http://vllm.internal:8000"}}))))))

(deftest list-models-unreachable-server-is-a-client-error-test
  (testing "a refused connection while fetching the catalog names the base URL and is tagged 400, so a
           mistyped base URL reaches the admin as the message instead of a 500"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ConnectException. "Connection refused")))]
      (let [e (try (vllm/list-models {:credentials credentials})
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= {:api-error true :status-code 400 :error-code :vllm-unreachable}
               (select-keys (ex-data e) [:api-error :status-code :error-code])))
        (is (re-find #"Could not reach the vLLM server at http://vllm\.internal:8000/v1" (ex-message e)))))))

(deftest list-models-timeout-names-the-server-test
  (testing "the catalog fetch runs on the shared request timeout, so a stall there reports that budget
           rather than the vLLM generation one"
    (mt/with-temporary-setting-values [llm.settings/llm-request-timeout-ms      120000
                                       llm.settings/llm-vllm-request-timeout-ms 300000]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (SocketTimeoutException. "Read timed out")))]
        (let [e (try (vllm/list-models {:credentials credentials})
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (= {:api-error true :status-code 400 :error-code :vllm-timeout}
                 (select-keys (ex-data e) [:api-error :status-code :error-code])))
          (is (re-find #"http://vllm\.internal:8000/v1 did not respond within 120000ms" (ex-message e))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Preflight
;;; ──────────────────────────────────────────────────────────────────

(defn- probing-server
  "Stub `http/request` for the preflight path: `GET /models` returns `models`, and each
  `POST /chat/completions` returns whatever `choice-by-tool-choice` holds for the `tool_choice` it
  was sent.

  Dispatching on `tool_choice` is what lets the two probes disagree. They exercise different server
  capabilities — the tool-call parser under `auto`, guided decoding under `required` — so a stub that
  answers both identically can only ever reach `check-structured-output!` on the happy path."
  [models choice-by-tool-choice]
  (fn [{:keys [url body]}]
    (if (re-find #"/models$" (str url))
      {:status 200 :body {:data models}}
      (let [tool-choice (:tool_choice (json/decode+kw (str body)))]
        {:status 200 :body {:choices [(get choice-by-tool-choice tool-choice)]}}))))

(def ^:private tool-calling-message
  {:content    ""
   :tool_calls [{:id       "chatcmpl-tool-1"
                 :type     "function"
                 :function {:name "record_table_name" :arguments "{\"table_name\": \"orders\"}"}}]})

(defn- probe-choice!
  "Run a preflight against a stub. The 2-arity answers both probes alike; the 3-arity lets them differ."
  ([models chat-choice]
   (probe-choice! models chat-choice chat-choice))
  ([models auto-choice required-choice]
   (mt/with-dynamic-fn-redefs [http/request (probing-server models {"auto"     auto-choice
                                                                    "required" required-choice})]
     (vllm/list-models {:credentials credentials :probe? true}))))

(defn- probe!
  "[[probe-choice!]] for a server that runs to a natural stop, where only the message shape matters."
  [models chat-message]
  (probe-choice! models {:message chat-message :finish_reason "tool_calls"}))

(deftest preflight-passes-on-a-correctly-configured-server-test
  (testing "a server that returns a well-formed tool call passes and still lists its models"
    (is (= {:models         [{:id "vllm-test" :display_name "vllm-test"}]
            :learned-config {vllm/reasoning-config-key "false"
                             :probed-model             "vllm-test"}}
           (probe! [{:id "vllm-test" :max_model_len 32768}] tool-calling-message)))))

(deftest preflight-reports-the-model-it-probed-test
  (testing "the probed model is named in the result rather than left to be re-derived from the listing —
           the connect path must adopt the model the contract checks actually ran against"
    (testing "the first catalog entry, in the order the server lists it"
      (is (= "vllm-test"
             (get-in (probe! recorded-multi-model-catalog tool-calling-message)
                     [:learned-config :probed-model]))))
    (testing "including a slash-bearing repo id, which the connect path stores as `vllm/{id}`"
      (is (= "mlx-community/Qwen3-14B-4bit"
             (get-in (probe! recorded-no-alias-catalog tool-calling-message)
                     [:learned-config :probed-model])))))
  (testing "and a listing that did not probe reports nothing"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data [{:id "vllm-test"}]}})]
      (is (= [:models] (keys (vllm/list-models {:credentials credentials})))))))

(deftest preflight-skips-lora-adapters-when-picking-a-default-test
  (testing "an adapter registered with --lora-modules carries `parent`; adopting one would point Metabot
           at an adapter the admin never chose"
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200
                                                    :body   {:data [{:id     "sql-lora"
                                                                     :parent "vllm-test"
                                                                     :max_model_len 32768}
                                                                    {:id     "vllm-test"
                                                                     :parent nil
                                                                     :max_model_len 32768}]}}
                                                   (do (reset! probed (:model (json/decode+kw (str body))))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (is (= "vllm-test" (get-in (vllm/list-models {:credentials credentials :probe? true}) [:learned-config :probed-model])))
        (is (= "vllm-test" @probed)))))
  (testing "an explicitly requested adapter is still honoured — the filter only picks the default"
    (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                               (if (re-find #"/models$" (str url))
                                                 {:status 200
                                                  :body   {:data [{:id "sql-lora" :parent "vllm-test" :max_model_len 32768}
                                                                  {:id "vllm-test" :max_model_len 32768}]}}
                                                 {:status 200 :body {:choices [{:message tool-calling-message}]}}))]
      (is (= "sql-lora" (get-in (vllm/list-models {:credentials credentials
                                                   :probe?      true
                                                   :model       "sql-lora"})
                                [:learned-config :probed-model]))))))

(deftest preflight-skipped-without-probe-flag-test
  (testing "without :probe? no generation request is made at all — listing models must stay cheap"
    (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                               (when-not (re-find #"/models$" (str url))
                                                 (throw (ex-info "preflight must not run on a plain listing" {})))
                                               {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}})]
      (is (= {:models [{:id "vllm-test" :display_name "vllm-test"}]}
             (vllm/list-models {:credentials credentials}))))))

(deftest preflight-rejects-a-prose-answer-test
  (testing "a server that answers with text instead of a tool call names the two flags that cause it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"--enable-auto-tool-choice"
         (probe! [{:id "vllm-test" :max_model_len 32768}]
                 {:content "I'll record the table name orders for you." :tool_calls []})))))

(deftest preflight-rejects-unparseable-tool-arguments-test
  (testing "a tool call whose arguments are not JSON points at a mismatched --tool-call-parser"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"--tool-call-parser"
         (probe! [{:id "vllm-test" :max_model_len 32768}]
                 {:content    ""
                  :tool_calls [{:id       "chatcmpl-tool-1"
                                :type     "function"
                                :function {:name "record_table_name" :arguments "table_name=orders"}}]})))))

(deftest preflight-rejects-leaked-reasoning-test
  (testing "reasoning arriving as chat text points at --reasoning-parser, even when the tool call itself is fine"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"--reasoning-parser"
         (probe! [{:id "vllm-test" :max_model_len 32768}]
                 (assoc tool-calling-message :content "<think>\nThe user wants orders.\n</think>\n\n"))))))

(deftest preflight-rejects-a-context-window-that-is-too-small-test
  (testing "a model served under the context floor is rejected before any generation request"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"too small for Metabot"
         (probe! [{:id "vllm-test" :max_model_len 4096}] tool-calling-message)))))

(deftest preflight-rejects-a-server-with-no-models-test
  (testing "a reachable server serving nothing is a configuration error, not an empty dropdown"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"not serving any models"
         (probe! [] tool-calling-message)))))

(deftest preflight-probes-the-requested-model-test
  (testing "the probe targets the requested model, not merely the first one served"
    (let [probed (atom nil)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "first" :max_model_len 32768}
                                                                              {:id "second" :max_model_len 32768}]}}
                                                   (do (reset! probed (re-find #"second" (str body)))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (vllm/list-models {:credentials credentials :probe? true :model "second"})
        (is (= "second" @probed))))))

(deftest preflight-prefers-a-proposed-model-that-is-still-served-test
  (testing "an edit without an explicit model re-probes the model previously verified for the connection"
    (let [probed (atom #{})]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "first" :max_model_len 32768}
                                                                              {:id "previous" :max_model_len 32768}]}}
                                                   (do (swap! probed conj (:model (json/decode+kw (str body))))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (is (= "previous"
               (get-in (vllm/list-models {:credentials    credentials
                                          :probe?         true
                                          :proposed-model "previous"})
                       [:learned-config :probed-model])))
        (is (= #{"previous"} @probed))))))

(deftest preflight-falls-back-when-the-proposed-model-is-no-longer-served-test
  (testing "a stale proposal does not become a hard request and the normal candidate selection still applies"
    (let [probed (atom #{})]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200
                                                    :body   {:data [{:id "sql-lora" :parent "first" :max_model_len 32768}
                                                                    {:id "first" :max_model_len 32768}]}}
                                                   (do (swap! probed conj (:model (json/decode+kw (str body))))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (is (= "first"
               (get-in (vllm/list-models {:credentials    credentials
                                          :probe?         true
                                          :proposed-model "removed"})
                       [:learned-config :probed-model])))
        (is (= #{"first"} @probed))))))

(deftest preflight-rejects-a-model-the-server-does-not-serve-test
  (testing "a requested model absent from the catalog fails and names what is served, rather than probing something else"
    (let [generated? (atom false)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "served-a" :max_model_len 32768}
                                                                              {:id "served-b" :max_model_len 32768}]}}
                                                   (do (reset! generated? true)
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"not serving missing-model. It is serving: served-a, served-b"
             (vllm/list-models {:credentials credentials :probe? true :model "missing-model"})))
        (is (false? @generated?)
            "no generation request is issued for a model the server cannot run")))))

(deftest preflight-reports-a-thinking-budget-overrun-test
  (testing "a reasoning model that never stops thinking is named as such, not as a server missing tool-calling flags"
    (let [e (try (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                                {:message       {:content           nil
                                                 :reasoning "Okay, the user wants me to record a table name, so"
                                                 :tool_calls        []}
                                 :finish_reason "length"})
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (re-find #"reasoning without calling a tool" (ex-message e)))
      (is (not (re-find #"--enable-auto-tool-choice" (ex-message e)))
          "the flags this server needs are already set, so naming them would send the admin the wrong way"))))

;;; The `content` below is the shape a live vLLM 0.26.0 returns for a tool call cut off at
;;; `max_tokens`, serving mlx-community/Qwen3-14B-4bit with `--enable-auto-tool-choice
;;; --tool-call-parser hermes` and `chat_template_kwargs {enable_thinking false}` (BOT-1930 L-7).
;;; The parser extracts from complete output, so without its closing `</tool_call>` the call yields no
;;; `tool_calls` entry at all and the raw text stays in `content`.
(deftest preflight-reports-a-truncated-tool-call-as-a-ceiling-overrun-test
  (testing "a generation cut off at the ceiling names the ceiling rather than the tool-calling flags,
           which the unterminated sentinel in the content shows are working"
    (let [e (try (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                                {:message       {:content    "<tool_call>\n{\"name\": \"record_table_name\", \"arguments\": {\""
                                                 :tool_calls []}
                                 :finish_reason "length"})
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (re-find #"before completing a tool call" (ex-message e)))
      (is (re-find #"2048 token" (ex-message e)))
      (is (not (re-find #"--enable-auto-tool-choice" (ex-message e)))))))

(deftest preflight-reports-truncated-prose-as-a-ceiling-overrun-test
  (testing "prose truncated at the ceiling gets the same verdict — finish_reason is the only signal
           separating it from a truncated tool call"
    (let [e (try (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                                {:message       {:content    "Sure! To record the table name I would first need to"
                                                 :tool_calls []}
                                 :finish_reason "length"})
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (re-find #"before completing a tool call" (ex-message e))))))

(deftest preflight-probe-timeout-is-capped-test
  (testing "a probe runs on its own budget, capped below the inference timeout"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-request-timeout-ms 600000]
      (let [socket-timeouts (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url socket-timeout]}]
                                                   (if (re-find #"/models$" (str url))
                                                     {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                     (do (swap! socket-timeouts conj socket-timeout)
                                                         {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
          (vllm/list-models {:credentials credentials :probe? true})
          (is (= #{120000} (set @socket-timeouts))))))))

(deftest preflight-surfaces-a-probe-timeout-test
  (testing "a probe that times out says the server is too slow, not that the request failed"
    (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                               (if (re-find #"/models$" (str url))
                                                 {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                 (throw (SocketTimeoutException. "Read timed out"))))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"did not answer the connection test"
           (vllm/list-models {:credentials credentials :probe? true}))))))

(deftest preflight-probes-run-concurrently-test
  (testing "both probes are in flight at once, so a slow server costs one probe budget rather than two"
    (let [arrived (CountDownLatch. 2)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                   (do (.countDown arrived)
                                                       ;; Only satisfiable if the other probe is
                                                       ;; already in flight.
                                                       (is (.await arrived 10 TimeUnit/SECONDS))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (vllm/list-models {:credentials credentials :probe? true})))))

(deftest preflight-reports-whether-the-probed-model-reasons-test
  (testing "the probe is the only place this is knowable — /v1/models carries no reasoning field, so what it
           saw is reported back for the connection to record"
    ;; Recorded shape: vLLM 0.26 puts it on the non-streaming message under `reasoning`.
    (is (=? {vllm/reasoning-config-key "true"}
            (:learned-config
             (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                            {:message       (assoc tool-calling-message
                                                   :reasoning "\nOkay, the user wants me to record \"orders\".")
                             :finish_reason "tool_calls"})))))
  (testing "and under the deprecated spelling older servers still use"
    (is (=? {vllm/reasoning-config-key "true"}
            (:learned-config
             (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                            {:message       (assoc tool-calling-message
                                                   :reasoning_content "Older vLLM builds spell it this way.")
                             :finish_reason "tool_calls"})))))
  (testing "a model that answers without reasoning reports false"
    (is (=? {vllm/reasoning-config-key "false"}
            (:learned-config (probe! [{:id "vllm-test" :max_model_len 32768}] tool-calling-message)))))
  (testing "and a connection carrying the flag is what the request body reads it from"
    (is (true? (vllm/reasoning-connection? {vllm/reasoning-config-key "true"})))
    (is (false? (vllm/reasoning-connection? {vllm/reasoning-config-key "false"})))
    (is (false? (vllm/reasoning-connection? {})))
    (testing "including the JSON boolean a hand-written llm-providers can hold"
      (is (true? (vllm/reasoning-connection? {vllm/reasoning-config-key true}))))))

(deftest preflight-reports-nothing-when-it-fails-test
  (testing "a failed probe throws rather than reporting a guess, so the connection records nothing"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"--enable-auto-tool-choice"
         (probe! [{:id "vllm-test" :max_model_len 32768}]
                 {:content "I'll record the table name orders for you." :tool_calls []})))))

(deftest preflight-failures-are-surfaced-as-client-errors-test
  (testing "a preflight failure is tagged 400 so the admin sees the message instead of a 500"
    (let [data (try (probe! [{:id "vllm-test" :max_model_len 4096}] tool-calling-message)
                    (catch clojure.lang.ExceptionInfo e (ex-data e)))]
      (is (= {:api-error true :status-code 400 :error-code :vllm-preflight-failed}
             (select-keys data [:api-error :status-code :error-code]))))))

(deftest preflight-rejects-a-server-that-cannot-force-a-tool-call-test
  (testing "a server whose --tool-call-parser is right but whose model cannot compile a grammar answers
           `auto` correctly and `required` with prose — ordinary chat looks fine while conversation
           titling and the whole sql profile break"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"did not honor a forced tool call"
         (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message       {:content "I can record the table name for you." :tool_calls []}
                         :finish_reason "stop"})))))

(deftest preflight-reports-a-forced-tool-call-that-ran-out-of-budget-test
  (testing "a forced call truncated at the ceiling is named as such, not as a server refusing to honor it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"reached the 2048 token connection-test ceiling"
         (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message       {:content "" :tool_calls []}
                         :finish_reason "length"})))))

(deftest preflight-cancels-the-sibling-probe-on-failure-test
  (testing "the first verdict returns immediately and its sibling is cancelled — an abandoned future would
           keep generating against the operator's server after the admin already has a 400"
    (let [interrupted (promise)
          never       (CountDownLatch. 1)]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                   (case (:tool_choice (json/decode+kw (str body)))
                                                     "auto"     {:status 200
                                                                 :body   {:choices [{:message {:content    "I'll record orders."
                                                                                               :tool_calls []}}]}}
                                                     "required" (try
                                                                  (.await never 10 TimeUnit/SECONDS)
                                                                  (deliver interrupted false)
                                                                  {:status 200 :body {:choices [{:message tool-calling-message}]}}
                                                                  (catch InterruptedException _
                                                                    (deliver interrupted true)
                                                                    (throw (SocketTimeoutException. "interrupted")))))))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"--enable-auto-tool-choice"
             (vllm/list-models {:credentials credentials :probe? true})))
        (is (true? (deref interrupted 10000 :never-cancelled)))))))

(deftest preflight-probe-request-shape-test
  (testing "both probes ask for the same trivial completion, non-streaming and deterministic — the ceiling
           is the one a forced tool call is guaranteed to be given at request time"
    (let [requests (atom [])]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body] :as req}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                   (do (swap! requests conj (assoc req :decoded (json/decode+kw (str body))))
                                                       {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
        (vllm/list-models {:credentials credentials :probe? true})
        (is (= 2 (count @requests)))
        (is (= #{"auto" "required"} (set (map #(-> % :decoded :tool_choice) @requests))))
        (doseq [{:keys [decoded] :as req} @requests]
          (is (= :post (:method req)))
          (is (= "http://vllm.internal:8000/v1/chat/completions" (:url req)))
          (is (= :json (:as req))
              "a probe reads a whole response; :stream would leave the verdict unreadable")
          (is (nil? (:stream decoded)))
          (is (= 0 (:temperature decoded)))
          (is (= 2048 (:max_tokens decoded))
              "must not drift from the floor a forced tool call is raised to — the preflight's promise is
               that a model which connected can already clear the budget it will be run at")
          (is (= 1 (count (:tools decoded))))
          (is (= "record_table_name" (-> decoded :tools first :function :name))))))))

(deftest preflight-surfaces-an-http-error-as-a-provider-error-test
  (testing "a 400 from /chat/completions is the server rejecting the request, not a contract failure —
           it must keep vLLM's own status text rather than being reworded as a preflight verdict"
    (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                               (if (re-find #"/models$" (str url))
                                                 {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                 (throw (ex-info "clj-http: status 400"
                                                                 {:status 400
                                                                  :body   "{\"message\":\"cannot compile grammar\"}"}))))]
      (let [e (try (vllm/list-models {:credentials credentials :probe? true})
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (re-find #"vLLM rejected the request" (ex-message e)))
        (is (= :provider-api-error (:error-code (ex-data e))))))))

(deftest preflight-accepts-a-catalog-without-a-context-window-test
  (testing "`max_model_len` is vLLM's own field: Ollama, LM Studio, and TGI omit it. The floor is
           best-effort, so a catalog without it connects rather than being rejected on a missing field"
    (is (= {:models         [{:id "vllm-test" :display_name "vllm-test"}]
            :learned-config {vllm/reasoning-config-key "false"
                             :probed-model             "vllm-test"}}
           (probe! [{:id "vllm-test"}] tool-calling-message)))))

(deftest preflight-does-not-leak-the-context-window-to-the-client-test
  (testing "`max_model_len` feeds the context check and stops there — the model list the admin sees carries
           only what the dropdown renders"
    (let [models (:models (probe! [{:id "vllm-test" :max_model_len 32768 :parent nil :root "org/Model"}]
                                  tool-calling-message))]
      (is (= [{:id "vllm-test" :display_name "vllm-test"}] models)))))
