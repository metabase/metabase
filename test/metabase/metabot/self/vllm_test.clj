(ns metabase.metabot.self.vllm-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.test :as mt])
  (:import
   (java.net SocketTimeoutException)
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(def ^:private base-url "http://vllm.internal:8000/v1")

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
  (testing "temperature passes through"
    (is (= 0.3
           (:temperature (vllm/vllm-request-body {:model       "vllm-test"
                                                  :input       [{:role :user :content "hi"}]
                                                  :temperature 0.3}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion
;;;
;;; Recorded verbatim from vLLM 0.26.0 serving Qwen3-14B with
;;; `--tool-call-parser hermes`. The shapes that matter and could not be
;;; guessed reliably: the first tool-call delta carries `id` and `name` but
;;; no `arguments` key at all, continuations carry only `index`, `content`
;;; is an explicit null on tool-call chunks, and the final usage block has
;;; no `prompt_tokens_details`.
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
    ;; This is what the connect-time `<think>` sniff exists to prevent; asserting it here keeps the
    ;; justification for that check honest.
    (let [text (->> (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf)) recorded-tool-call-stream)
                    (filter #(= :text (:type %)))
                    (map :text)
                    (apply str))]
      (is (re-find #"<think>" text)))))

(deftest ^:parallel reasoning-content-is-dropped-test
  (testing "with --reasoning-parser, thinking arrives on delta.reasoning_content and is dropped; the answer still streams"
    (let [parts (into [] (comp (vllm/vllm->aisdk-chunks-xf) (self.core/aisdk-xf))
                      [{:id "chatcmpl-1" :model "vllm-test"
                        :choices [{:index 0 :delta {:role "assistant" :reasoning_content "Let me"} :finish_reason nil}]}
                       {:id "chatcmpl-1" :model "vllm-test"
                        :choices [{:index 0 :delta {:reasoning_content " think."} :finish_reason nil}]}
                       {:id "chatcmpl-1" :model "vllm-test"
                        :choices [{:index 0 :delta {:content "Ready."} :finish_reason nil}]}
                       {:id "chatcmpl-1" :model "vllm-test"
                        :choices [{:index 0 :delta {} :finish_reason "stop"}]}])]
      (is (= ["Ready."] (map :text (filter #(= :text (:type %)) parts))))
      (is (empty? (filter #(= :reasoning (:type %)) parts))))))

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
  (testing "a configured API key becomes an Authorization header against the configured base URL"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url
                                       llm.settings/llm-vllm-api-key      "local-dev-key"]
      (is (=? {:method  :post
               :url     "http://vllm.internal:8000/v1/chat/completions"
               :headers {"Authorization" "Bearer local-dev-key"}
               :body    string?}
              (captured-chat-request! {:model "vllm-test" :input [{:role :user :content "hi"}]}))))))

(deftest vllm-auth-omits-authorization-without-a-key-test
  (testing "a keyless server is a complete configuration — no Authorization header, and no missing-key error"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url
                                       llm.settings/llm-vllm-api-key      nil]
      (let [req (captured-chat-request! {:model "vllm-test" :input [{:role :user :content "hi"}]})]
        (is (= "http://vllm.internal:8000/v1/chat/completions" (:url req)))
        (is (not (contains? (:headers req) "Authorization")))))))

(deftest vllm-sets-a-socket-timeout-test
  (testing "generation requests carry the vLLM socket timeout and the shared connection timeout"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url        base-url
                                       llm.settings/llm-vllm-request-timeout-ms  300000]
      (is (=? {:socket-timeout     300000
               :connection-timeout (llm.settings/llm-connection-timeout-ms)}
              (captured-chat-request! {:model "vllm-test" :input [{:role :user :content "hi"}]}))))))

(deftest vllm-auth-missing-base-url-test
  (testing "an unset base URL fails with a message naming vLLM, not a clj-http error about a relative URL"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url nil
                                       llm.settings/llm-vllm-api-key      "local-dev-key"]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No vLLM base URL is set"
             (vllm/vllm-raw {:model "vllm-test" :input [{:role :user :content "hi"}]})))
        (is (= :base-url-missing
               (:error-code (try (vllm/list-models)
                                 (catch clojure.lang.ExceptionInfo e (ex-data e))))))))))

(deftest vllm-missing-model-test
  (testing "a blank model fails with a vLLM-specific message before any request is made"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No vLLM model is set"
             (vllm/vllm-raw {:input [{:role :user :content "hi"}]})))))))

(deftest vllm-ai-proxy-unsupported-test
  (testing "ai-proxy? throws before credentials are even consulted"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url nil]
      (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for vLLM"
             (vllm/vllm-raw {:model "vllm-test" :input [{:role :user :content "hi"}] :ai-proxy? true})))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"AI proxy is not supported for vLLM"
             (vllm/list-models {:ai-proxy? true})))))))

(deftest vllm-stream-socket-timeout-is-not-retryable-test
  (testing "a socket timeout while consuming the stream surfaces as a tagged vLLM error, not a raw SocketTimeoutException"
    ;; A raw one satisfies `metabase.metabot.self/retryable-error?` and, since nothing has been
    ;; emitted yet, `call-llm` would replay the whole request — three full cold prefills.
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (with-redefs [self.core/sse-reducible (fn [_]
                                              (reify clojure.lang.IReduceInit
                                                (reduce [_ _rf _init]
                                                  (throw (SocketTimeoutException. "Read timed out")))))
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [_] {:body nil})]
        (let [e (try (into [] (vllm/vllm-raw {:model "vllm-test" :input [{:role :user :content "hi"}]}))
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (= :vllm-timeout (:error-code (ex-data e))))
          (is (re-find #"stopped responding" (ex-message e))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; list-models
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-passes-the-catalog-through-test
  (testing "every served model is offered — there is no whitelist — and display_name falls back to the served id"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url
                                       llm.settings/llm-vllm-api-key      "local-dev-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:method  :get
                                                          :url     "http://vllm.internal:8000/v1/models"
                                                          :headers {"Authorization" "Bearer local-dev-key"}}
                                                         req))
                                                 {:status 200
                                                  :body   {:data [{:id "mlx-community/Qwen3-14B-4bit" :max_model_len 32768}
                                                                  {:id "some-finetune" :name "Some Finetune"}]}})]
        (is (= {:models [{:id "mlx-community/Qwen3-14B-4bit" :display_name "mlx-community/Qwen3-14B-4bit"}
                         {:id "some-finetune" :display_name "Some Finetune"}]}
               (vllm/list-models)))))))

(deftest list-models-credentials-override-the-settings-test
  (testing "a passed-in base URL and key are used over the configured ones"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url "http://saved:8000/v1"
                                       llm.settings/llm-vllm-api-key      "saved-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "http://explicit:8000/v1/models"
                                                          :headers {"Authorization" "Bearer explicit-key"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (vllm/list-models {:credentials {:base-url "http://explicit:8000/v1"
                                                :api-key  "explicit-key"}})))))))

(deftest list-models-401-maps-to-invalid-key-message-test
  (testing "a 401 surfaces as the canonical message naming --api-key"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url
                                       llm.settings/llm-vllm-api-key      "wrong-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info "clj-http: status 401"
                                                                 {:status 401
                                                                  :body   "{\"message\":\"Unauthorized\"}"})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"vLLM API key expired or invalid"
             (vllm/list-models)))))))

(deftest list-models-404-points-at-the-base-url-test
  (testing "a 404 tells the admin the base URL should end in /v1"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url "http://vllm.internal:8000"]
      (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                                 (throw (ex-info "clj-http: status 404" {:status 404 :body "not found"})))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"base URL should end in /v1"
             (vllm/list-models)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Preflight
;;;
;;; Each case is a misconfiguration that produces no error at any layer
;;; today and looks like a Metabase bug at conversation time.
;;; ──────────────────────────────────────────────────────────────────

(defn- probing-server
  "Stub `http/request` for the preflight path: `GET /models` returns `models`, and every
  `POST /chat/completions` returns `chat-choice` as the first choice."
  [models chat-choice]
  (fn [{:keys [url]}]
    (if (re-find #"/models$" (str url))
      {:status 200 :body {:data models}}
      {:status 200 :body {:choices [chat-choice]}})))

(def ^:private tool-calling-message
  {:content    ""
   :tool_calls [{:id       "chatcmpl-tool-1"
                 :type     "function"
                 :function {:name "record_table_name" :arguments "{\"table_name\": \"orders\"}"}}]})

(defn- probe-choice!
  [models chat-choice]
  (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
    (mt/with-dynamic-fn-redefs [http/request (probing-server models chat-choice)]
      (vllm/list-models {:probe? true}))))

(defn- probe!
  "[[probe-choice!]] for a server that runs to a natural stop, where only the message shape matters."
  [models chat-message]
  (probe-choice! models {:message chat-message :finish_reason "tool_calls"}))

(deftest preflight-passes-on-a-correctly-configured-server-test
  (testing "a server that returns a well-formed tool call passes and still lists its models"
    (is (= {:models [{:id "vllm-test" :display_name "vllm-test"}]}
           (probe! [{:id "vllm-test" :max_model_len 32768}] tool-calling-message)))))

(deftest preflight-skipped-without-probe-flag-test
  (testing "without :probe? no generation request is made at all — GET /settings must stay cheap"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                 (when-not (re-find #"/models$" (str url))
                                                   (throw (ex-info "preflight must not run on a plain listing" {})))
                                                 {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}})]
        (is (= {:models [{:id "vllm-test" :display_name "vllm-test"}]}
               (vllm/list-models)))))))

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
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (let [probed (atom nil)]
        (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url body]}]
                                                   (if (re-find #"/models$" (str url))
                                                     {:status 200 :body {:data [{:id "first" :max_model_len 32768}
                                                                                {:id "second" :max_model_len 32768}]}}
                                                     (do (reset! probed (re-find #"second" (str body)))
                                                         {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
          (vllm/list-models {:probe? true :model "second"})
          (is (= "second" @probed)))))))

(deftest preflight-rejects-a-model-the-server-does-not-serve-test
  (testing "a requested model absent from the catalog fails and names what is served, rather than probing something else"
    ;; Falling back to another served model passes every check and then persists a provider string
    ;; pointing at a model the server does not have.
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
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
               (vllm/list-models {:probe? true :model "missing-model"})))
          (is (false? @generated?)
              "no generation request is issued for a model the server cannot run"))))))

(deftest preflight-reports-a-thinking-budget-overrun-test
  (testing "a reasoning model that never stops thinking is named as such, not as a server missing tool-calling flags"
    (let [e (try (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                                {:message       {:content           nil
                                                 :reasoning_content "Okay, the user wants me to record a table name, so"
                                                 :tool_calls        []}
                                 :finish_reason "length"})
                 (catch clojure.lang.ExceptionInfo e e))]
      (is (re-find #"reasoning without calling a tool" (ex-message e)))
      (is (not (re-find #"--enable-auto-tool-choice" (ex-message e)))
          "the flags this server needs are already set, so naming them would send the admin the wrong way"))))

(deftest preflight-reports-truncated-prose-as-a-tool-choice-failure-test
  (testing "a truncated answer carrying prose rather than reasoning still points at the tool-calling flags"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"--enable-auto-tool-choice"
         (probe-choice! [{:id "vllm-test" :max_model_len 32768}]
                        {:message       {:content "Sure! To record the table name I would first need to"
                                         :tool_calls []}
                         :finish_reason "length"})))))

(deftest preflight-probe-timeout-is-capped-test
  (testing "a probe runs on its own budget, capped below the inference timeout"
    ;; The admin is blocked on this behind a non-cancellable spinner, so the generous self-hosted
    ;; prefill budget cannot apply.
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url        base-url
                                       llm.settings/llm-vllm-request-timeout-ms 600000]
      (let [socket-timeouts (atom [])]
        (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url socket-timeout]}]
                                                   (if (re-find #"/models$" (str url))
                                                     {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                     (do (swap! socket-timeouts conj socket-timeout)
                                                         {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
          (vllm/list-models {:probe? true})
          (is (= #{120000} (set @socket-timeouts))))))))

(deftest preflight-surfaces-a-probe-timeout-test
  (testing "a probe that times out says the server is too slow, not that the request failed"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                 (if (re-find #"/models$" (str url))
                                                   {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                   (throw (SocketTimeoutException. "Read timed out"))))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"did not answer the connection test"
             (vllm/list-models {:probe? true})))))))

(deftest preflight-probes-run-concurrently-test
  (testing "both probes are in flight at once, so a slow server costs one probe budget rather than two"
    (mt/with-temporary-setting-values [llm.settings/llm-vllm-api-base-url base-url]
      (let [arrived (CountDownLatch. 2)]
        (mt/with-dynamic-fn-redefs [http/request (fn [{:keys [url]}]
                                                   (if (re-find #"/models$" (str url))
                                                     {:status 200 :body {:data [{:id "vllm-test" :max_model_len 32768}]}}
                                                     (do (.countDown arrived)
                                                         ;; Only satisfiable if the other probe is
                                                         ;; already in flight.
                                                         (is (.await arrived 10 TimeUnit/SECONDS))
                                                         {:status 200 :body {:choices [{:message tool-calling-message}]}})))]
          (vllm/list-models {:probe? true}))))))

(deftest preflight-failures-are-surfaced-as-client-errors-test
  (testing "a preflight failure is tagged 400 so the admin sees the message instead of a 500"
    (let [data (try (probe! [{:id "vllm-test" :max_model_len 4096}] tool-calling-message)
                    (catch clojure.lang.ExceptionInfo e (ex-data e)))]
      (is (= {:api-error true :status-code 400 :error-code :vllm-preflight-failed}
             (select-keys data [:api-error :status-code :error-code]))))))
