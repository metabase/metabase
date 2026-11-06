(ns metabase.metabot.self.litellm-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.litellm :as litellm]
   [metabase.metabot.test-util :as metabot.tu]
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.net ConnectException SocketTimeoutException)))

(set! *warn-on-reflection* true)

(def ^:private base-url "http://litellm.internal:4000")

(def ^:private credentials
  "What a resolved LiteLLM connection hands the adapter: adapters read credentials only, never settings."
  {:base-url base-url})

(def ^:private keyed-credentials
  "A connection to a proxy that checks a virtual key or a master key."
  (assoc credentials :api-key "sk-litellm-test-key"))

(def ^:private input
  [{:role :user :content "hi"}])

;;; ──────────────────────────────────────────────────────────────────
;;; litellm-request-body
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel request-body-no-default-model-test
  (testing "there is no default model. A proxy serves the aliases that its operator sets"
    (is (nil? (:model (litellm/litellm-request-body {:input input}))))))

(deftest ^:parallel request-body-system-and-stream-test
  (testing "the system prompt leads the messages and the request streams with usage included"
    (let [body (litellm/litellm-request-body {:model  "gpt-6-luna"
                                              :system "You are a helpful assistant."
                                              :input  input})]
      (is (= "gpt-6-luna" (:model body)))
      (is (= {:role "system" :content "You are a helpful assistant."}
             (-> body :messages first)))
      (is (true? (:stream body)))
      (is (= {:include_usage true} (:stream_options body))))))

(deftest ^:parallel request-body-sends-no-temperature-test
  (testing "the body has no temperature, if the caller gives one or not. The alias can be on an upstream that
           rejects it, so the upstream's own default rules"
    (is (not (contains? (litellm/litellm-request-body {:model "gpt-6-luna" :input input})
                        :temperature)))
    (is (not (contains? (litellm/litellm-request-body {:model "gpt-6-luna" :input input :temperature 0.7})
                        :temperature)))
    (is (not (contains? (litellm/litellm-request-body {:model "gpt-6-luna" :input input :temperature 0})
                        :temperature)))))

(deftest ^:parallel request-body-sends-no-default-max-tokens-test
  (testing "the body has no max_tokens when the caller gives none. An alias can be on an upstream whose output
           limit is below the chat cap"
    (is (not (contains? (litellm/litellm-request-body {:model "gpt-6-luna" :input input})
                        :max_tokens))))
  (testing "a caller-supplied max-tokens is sent as-is"
    (is (= 128
           (:max_tokens (litellm/litellm-request-body {:model      "gpt-6-luna"
                                                       :input      input
                                                       :max-tokens 128}))))))

(deftest ^:parallel request-body-tools-test
  (testing "tools are sent in OpenAI function format with tool_choice auto"
    (is (=? {:tools       [{:type     "function"
                            :function {:name "get-time"}}]
             :tool_choice "auto"}
            (litellm/litellm-request-body {:model "gpt-6-luna"
                                           :input input
                                           :tools [(metabot.tu/get-time-tool)]})))))

(deftest ^:parallel request-body-schema-forces-structured-output-test
  (testing "a schema forces a structured_output tool call"
    (is (=? {:tools       [{:type     "function"
                            :function {:name       "structured_output"
                                       :parameters {:type "object"}}}]
             :tool_choice "required"}
            (litellm/litellm-request-body {:model  "gpt-6-luna"
                                           :input  input
                                           :schema {:type       "object"
                                                    :properties {:title {:type "string"}}}})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion
;;; ──────────────────────────────────────────────────────────────────

(defn- stream-chunk
  "A Chat Completions stream chunk, as the proxy emits it for the `gpt-6-luna` alias."
  [m]
  (merge {:id "chatcmpl-1" :object "chat.completion.chunk" :model "gpt-6-luna"} m))

(def ^:private reasoning-tool-call-stream
  "A turn that reasons, then calls a tool. The proxy puts the upstream's thinking in `delta.reasoning_content`,
  streams the tool call in one delta, ends on `finish_reason`, and reports usage on a final chunk with no
  choices."
  (mapv stream-chunk
        [{:choices [{:index 0 :delta {:role "assistant" :content ""}}]}
         {:choices [{:index 0 :delta {:reasoning_content "Checking the"}}]}
         {:choices [{:index 0 :delta {:reasoning_content " time."}}]}
         {:choices [{:index 0 :delta {:tool_calls [{:id       "call_1"
                                                    :index    0
                                                    :type     "function"
                                                    :function {:name      "get-time"
                                                               :arguments "{\"tz\":\"Europe/Bucharest\"}"}}]}}]}
         {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}
         {:choices []
          :usage   {:prompt_tokens 291 :completion_tokens 26 :total_tokens 317}}]))

(def ^:private text-stream
  "A plain answer from an upstream that does not reason: no `reasoning_content` anywhere."
  (mapv stream-chunk
        [{:choices [{:index 0 :delta {:role "assistant" :content ""}}]}
         {:choices [{:index 0 :delta {:content "Four"}}]}
         {:choices [{:index 0 :delta {:content "."}}]}
         {:choices [{:index 0 :delta {} :finish_reason "stop"}]}
         {:choices [] :usage {:prompt_tokens 12 :completion_tokens 2 :total_tokens 14}}]))

(deftest ^:parallel reasoning-and-tool-call-stream-test
  (testing "reasoning, the tool call and usage come through"
    (let [parts (into [] (comp (litellm/litellm->aisdk-chunks-xf) (self.core/aisdk-xf)) reasoning-tool-call-stream)]
      (is (= ["Checking the time."]
             (map :text (filter #(= :reasoning (:type %)) parts))))
      (is (=? {:type      :tool-input
               :id        "call_1"
               :function  "get-time"
               :arguments {:tz "Europe/Bucharest"}}
              (first (filter #(= :tool-input (:type %)) parts))))
      (is (=? {:type          :usage
               :model         "gpt-6-luna"
               :finish-reason "tool-calls"
               :usage         {:promptTokens 291 :completionTokens 26}}
              (first (filter #(= :usage (:type %)) parts)))))))

(deftest ^:parallel text-stream-has-no-reasoning-test
  (testing "an upstream that does not reason yields text and usage, and no reasoning part"
    (let [parts (into [] (comp (litellm/litellm->aisdk-chunks-xf) (self.core/aisdk-xf)) text-stream)]
      (is (empty? (filter #(= :reasoning (:type %)) parts)))
      (is (= ["Four."] (map :text (filter #(= :text (:type %)) parts))))
      (is (=? {:type          :usage
               :finish-reason "stop"
               :usage         {:promptTokens 12 :completionTokens 2}}
              (first (filter #(= :usage (:type %)) parts)))))))

(deftest ^:parallel thinking-signature-capture-and-replay-test
  (testing "the thinking signature of an Anthropic upstream in `delta.thinking_blocks` goes into the provider
           metadata of the reasoning part"
    (is (=? [{:type :start}
             {:type :reasoning :text "hmm"}
             {:type :reasoning :provider-metadata {:anthropic {:signature "sig-abc"}}}
             {:type :tool-input :id "call_1"}]
            (into [] (comp (litellm/litellm->aisdk-chunks-xf) (self.core/lite-aisdk-xf))
                  [{:id "chatcmpl-1" :model "claude-sonnet" :choices [{:index 0 :delta {:role "assistant" :content ""}}]}
                   {:choices [{:index 0 :delta {:reasoning_content "hmm"
                                                :thinking_blocks [{:type "thinking" :thinking "hmm"}]}}]}
                   {:choices [{:index 0 :delta {:reasoning_content ""
                                                :thinking_blocks [{:type "thinking" :thinking "" :signature "sig-abc"}]}}]}
                   {:choices [{:index 0 :delta {:tool_calls [{:id "call_1" :index 0 :type "function"
                                                              :function {:name "get-time" :arguments "{}"}}]}}]}
                   {:choices [{:index 0 :delta {} :finish_reason "tool_calls"}]}]))))
  (testing "the signed block goes back as `thinking_blocks` on the assistant message with the tool call"
    (let [msgs (:messages (litellm/litellm-request-body
                           {:model "claude-sonnet"
                            :input [{:role :user :content "time?"}
                                    {:type :reasoning :id "r1" :text "hmm"}
                                    {:type :reasoning :id "r1" :text ""
                                     :provider-metadata {:anthropic {:signature "sig-abc"}}}
                                    {:type :tool-input :id "call_1" :function "get-time" :arguments {}}
                                    {:type :tool-output :id "call_1" :result {:time "noon"}}]}))]
      (is (=? {:role            "assistant"
               :thinking_blocks [{:type "thinking" :thinking "hmm" :signature "sig-abc"}]
               :tool_calls      [{:id "call_1"}]}
              (second msgs)))))
  (testing "reasoning without a signature (from a non-Anthropic upstream) does not go back"
    (is (not-any? :thinking_blocks
                  (:messages (litellm/litellm-request-body
                              {:model "gpt-6-luna"
                               :input [{:role :user :content "q"}
                                       {:type :reasoning :id "r1" :text "hmm"}
                                       {:type :text :text "a"}]})))))
  (testing "with :reasoning? false, a signed block does not go back"
    (is (not-any? :thinking_blocks
                  (:messages (litellm/litellm-request-body
                              {:model      "claude-sonnet"
                               :reasoning? false
                               :input      [{:role :user :content "q"}
                                            {:type :reasoning :id "r1" :text "hmm"
                                             :provider-metadata {:anthropic {:signature "sig-abc"}}}
                                            {:type :text :text "a"}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; litellm-raw
;;; ──────────────────────────────────────────────────────────────────

(defn- captured-chat-request!
  "Run `litellm-raw` against a stubbed transport and return the request it issued."
  [opts]
  (let [captured (atom nil)]
    (with-redefs [self.core/sse-reducible (fn [_] (reify clojure.lang.IReduceInit
                                                    (reduce [_ _rf init] init)))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [req] (reset! captured req) {:body nil})]
      (litellm/litellm-raw opts))
    @captured))

(deftest litellm-auth-sends-bearer-token-when-configured-test
  (testing "the connection's key becomes an Authorization header against its base URL"
    (is (=? {:method  :post
             :url     "http://litellm.internal:4000/chat/completions"
             :headers {"Authorization" "Bearer sk-litellm-test-key"}
             :body    string?}
            (captured-chat-request! {:model "gpt-6-luna" :input input :credentials keyed-credentials})))))

(deftest litellm-auth-omits-authorization-without-a-key-test
  (testing "a proxy with no master key is a complete configuration. There is no Authorization header and no missing-key error"
    (let [req (captured-chat-request! {:model "gpt-6-luna" :input input :credentials credentials})]
      (is (= "http://litellm.internal:4000/chat/completions" (:url req)))
      (is (not (contains? (:headers req) "Authorization"))))))

(deftest litellm-accepts-a-base-url-with-a-v1-suffix-test
  (testing "the proxy serves the API under /v1 as well, so a base URL that ends in /v1 works"
    (is (= "http://litellm.internal:4000/v1/chat/completions"
           (:url (captured-chat-request! {:model       "gpt-6-luna"
                                          :input       input
                                          :credentials {:base-url "http://litellm.internal:4000/v1"}}))))))

(deftest litellm-raw-sends-the-request-body-test
  (testing "the body carries the alias and the caller's options, with no temperature"
    (let [req (captured-chat-request! {:model       "gpt-6-luna"
                                       :input       input
                                       :temperature 0.7
                                       :max-tokens  256
                                       :credentials credentials})
          body (json/decode+kw (:body req))]
      (is (=? {:model "gpt-6-luna" :stream true :max_tokens 256} body))
      (is (not (contains? body :temperature))))))

(deftest litellm-auth-missing-base-url-test
  (testing "a connection carrying no base URL fails with a message naming LiteLLM, not a clj-http error about a
           relative URL"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No LiteLLM base URL is set"
           (litellm/litellm-raw {:model       "gpt-6-luna"
                                 :input       input
                                 :credentials {:api-key "sk-litellm-test-key"}})))
      (is (= :base-url-missing
             (:error-code (try (litellm/list-models {:credentials {:api-key "sk-litellm-test-key"}})
                               (catch clojure.lang.ExceptionInfo e (ex-data e)))))))))

(deftest litellm-missing-model-test
  (testing "a blank model fails with a LiteLLM-specific message before any request is made"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No LiteLLM model is set"
           (litellm/litellm-raw {:input input :credentials credentials})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No LiteLLM model is set"
           (litellm/litellm-raw {:model "" :input input :credentials credentials}))))))

(deftest litellm-ai-proxy-unsupported-test
  (testing "ai-proxy? is refused, since the Metabase AI proxy fronts hosted providers only"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for LiteLLM"
           (litellm/litellm-raw {:model "gpt-6-luna" :input input :ai-proxy? true})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for LiteLLM"
           (litellm/list-models {:ai-proxy? true}))))))

(deftest litellm-mid-stream-error-is-translated-test
  (testing "a failure while consuming the stream gets the descriptor's message for its status"
    (with-redefs [self.core/sse-reducible (fn [_]
                                            (reify clojure.lang.IReduceInit
                                              (reduce [_ _rf _init]
                                                (throw (ex-info "clj-http: status 500"
                                                                {:status 500 :body "{\"message\":\"boom\"}"})))))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (try (into [] (litellm/litellm-raw {:model "gpt-6-luna" :input input :credentials credentials}))
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= :provider-api-error (:error-code (ex-data e))))
        (is (re-find #"LiteLLM returned an internal server error" (ex-message e)))))))

(deftest litellm-http-errors-reach-the-status-specific-message-test
  (testing "a non-2xx while opening the stream is translated by the descriptor's `:errors`"
    (doseq [[status pattern] {401 #"LiteLLM API key expired or invalid"
                              404 #"LiteLLM API endpoint was not found"
                              429 #"LiteLLM is rate limiting this request"}]
      (testing (str "HTTP " status)
        (with-redefs [http/request (fn [_] (throw (ex-info (str "clj-http: status " status)
                                                           {:status status :body "{\"error\":{\"message\":\"no\"}}"})))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               pattern
               (litellm/litellm-raw {:model "gpt-6-luna" :input input :credentials credentials}))))))))

(deftest litellm-unlisted-status-uses-the-generic-message-test
  (testing "a status the descriptor does not name reads as a LiteLLM error with the status"
    (with-redefs [http/request (fn [_] (throw (ex-info "clj-http: status 418" {:status 418 :body "teapot"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"LiteLLM API error \(HTTP 418\)"
           (litellm/litellm-raw {:model "gpt-6-luna" :input input :credentials credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(def ^:private catalog
  "A `/models` answer in the shape the proxy returns: one entry per model alias in its configuration, in the
  order the operator wrote them. The ids are aliases, not the upstream model names."
  [{:id "gpt-6-luna" :object "model" :created 1677610602 :owned_by "openai"}
   {:id "openai/gpt-6-luna" :object "model" :created 1677610602 :owned_by "openai"}])

(deftest list-models-passes-the-catalog-through-test
  (testing "all aliases are shown, in the order of the proxy list. There is no whitelist"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (=? {:method  :get
                                                        :url     "http://litellm.internal:4000/models"
                                                        :headers {"Authorization" "Bearer sk-litellm-test-key"}}
                                                       req))
                                               {:status 200 :body {:object "list" :data catalog}})]
      (is (= {:models [{:id "gpt-6-luna" :display_name "gpt-6-luna"}
                       {:id "openai/gpt-6-luna" :display_name "openai/gpt-6-luna"}]}
             (litellm/list-models {:credentials keyed-credentials}))))))

(deftest list-models-probe-reports-the-initial-model-test
  (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data catalog}})]
    (testing "without a probe, the result has no connection-info"
      (is (not (contains? (litellm/list-models {:credentials credentials}) :connection-info))))
    (testing "a probe with no model starts on the first alias in the catalog"
      (is (= {:probed-model "gpt-6-luna"}
             (:connection-info (litellm/list-models {:credentials credentials :probe? true})))))
    (testing "a proposed model that the proxy still serves comes before the first alias"
      (is (= {:probed-model "openai/gpt-6-luna"}
             (:connection-info (litellm/list-models {:credentials credentials :probe? true
                                                     :proposed-model "openai/gpt-6-luna"})))))
    (testing "if the proxy does not serve the proposed model, the probe uses the first alias"
      (is (= {:probed-model "gpt-6-luna"}
             (:connection-info (litellm/list-models {:credentials credentials :probe? true
                                                     :proposed-model "gone"})))))
    (testing "a requested model stays as the caller gives it"
      (is (= {:probed-model "my-alias"}
             (:connection-info (litellm/list-models {:credentials credentials :probe? true
                                                     :model "my-alias"}))))))
  (testing "an empty catalog gives no probed model"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data []}})]
      (is (= {:models []} (litellm/list-models {:credentials credentials :probe? true}))))))

(deftest list-models-sends-no-authorization-without-a-key-test
  (testing "a keyless connection lists the catalog without an Authorization header"
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (is (= "http://litellm.internal:4000/models" (:url req)))
                                               (is (not (contains? (:headers req) "Authorization")))
                                               {:status 200 :body {:data catalog}})]
      (is (= ["gpt-6-luna" "openai/gpt-6-luna"]
             (map :id (:models (litellm/list-models {:credentials credentials}))))))))

(deftest list-models-keeps-slashes-in-an-alias-test
  (testing "an alias with a provider prefix survives the listing intact"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               {:status 200 :body {:data [{:id "openai/gpt-6-luna"}]}})]
      (is (= {:models [{:id "openai/gpt-6-luna" :display_name "openai/gpt-6-luna"}]}
             (litellm/list-models {:credentials credentials}))))))

(deftest list-models-skips-an-entry-without-a-string-id-test
  (testing "an entry with no usable id is left out rather than offered as a blank choice"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               {:status 200
                                                :body   {:data [{:object "model"}
                                                                {:id nil}
                                                                {:id "gpt-6-luna"}]}})]
      (is (= {:models [{:id "gpt-6-luna" :display_name "gpt-6-luna"}]}
             (litellm/list-models {:credentials credentials}))))))

(deftest list-models-does-not-fall-back-to-the-single-provider-settings-test
  (testing "the credentials of the connection are the only source. A setting for a different connection
           is not a fallback"
    (mt/with-temporary-setting-values [llm.settings/llm-litellm-api-base-url "http://saved:4000"
                                       llm.settings/llm-litellm-api-key      "saved-key"]
      (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                 (is (=? {:url     "http://explicit:4000/models"
                                                          :headers {"Authorization" "Bearer explicit-key"}}
                                                         req))
                                                 {:status 200 :body {:data []}})]
        (is (= {:models []}
               (litellm/list-models {:credentials {:base-url "http://explicit:4000"
                                                   :api-key  "explicit-key"}}))))
      (testing "and a connection without a base URL fails rather than borrowing the setting's"
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"No LiteLLM base URL is set"
             (litellm/list-models {:credentials {:api-key "explicit-key"}})))))))

(deftest list-models-fails-closed-on-a-body-that-is-not-a-catalog-test
  (testing "a 2xx whose body carries no model list throws, naming the base URL"
    (doseq [body [{:status "ok" :service "some-other-thing"} {:object "list"} 404]]
      (testing (str "body " (pr-str body))
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body body})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"LiteLLM returned an unexpected model list response.*http://litellm\.internal:4000"
               (litellm/list-models {:credentials credentials})))))))
  (testing "a well-formed but empty catalog lists nothing"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list" :data []}})]
      (is (= {:models []} (litellm/list-models {:credentials credentials}))))))

(deftest list-models-fails-closed-on-a-2xx-that-is-not-json-test
  (testing "a 2xx body that is not JSON (for example, an HTML page of a proxy) shows that a server answered, so it reads as a bad
           address rather than an unreachable one. The stub throws what `:as :json` throws: clj-http parses a
           2xx whatever its content type."
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (json/decode "<html>404 Not Found</html>"))]
      (is (=? {:error-code  :malformed-model-catalog
               :status-code 400}
              (try
                (litellm/list-models {:credentials credentials})
                (catch clojure.lang.ExceptionInfo e (ex-data e)))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"LiteLLM returned an unexpected model list response.*http://litellm\.internal:4000"
           (litellm/list-models {:credentials credentials}))))))

(deftest list-models-keeps-the-parse-error-as-the-cause-test
  (testing "the parse error travels as the cause, so a log shows whether the body was HTML, empty or cut off"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (json/decode "<html>404 Not Found</html>"))]
      (is (instance? com.fasterxml.jackson.core.JsonProcessingException
                     (try (litellm/list-models {:credentials credentials})
                          (catch clojure.lang.ExceptionInfo e (ex-cause e))))))))

(deftest list-models-401-maps-to-invalid-key-message-test
  (testing "a 401 surfaces as the canonical message naming the virtual key and the master key"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               (throw (ex-info "clj-http: status 401"
                                                               {:status 401
                                                                :body   "{\"error\":{\"message\":\"Authentication Error\"}}"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"LiteLLM API key expired or invalid.*virtual key"
           (litellm/list-models {:credentials (assoc credentials :api-key "wrong-key")}))))))

(deftest list-models-404-points-at-the-base-url-test
  (testing "a 404 tells the admin to check the base URL"
    (mt/with-dynamic-fn-redefs [http/request (fn [_]
                                               (throw (ex-info "clj-http: status 404" {:status 404 :body "not found"})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"LiteLLM API endpoint was not found.*base URL"
           (litellm/list-models {:credentials credentials}))))))

(deftest list-models-unreachable-proxy-is-a-client-error-test
  (testing "a refused connection while fetching the catalog names the base URL and is tagged 400, so a
           mistyped base URL reaches the admin as the message instead of a 500"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ConnectException. "Connection refused")))]
      (let [e (try (litellm/list-models {:credentials credentials})
                   (catch clojure.lang.ExceptionInfo e e))]
        (is (= {:api-error true :status-code 400 :error-code :litellm-unreachable}
               (select-keys (ex-data e) [:api-error :status-code :error-code])))
        (is (re-find #"Could not reach the LiteLLM proxy at http://litellm\.internal:4000" (ex-message e)))))))

(deftest list-models-timeout-names-the-proxy-test
  (testing "a stall while fetching the catalog reports the shared request timeout"
    (mt/with-temporary-setting-values [llm.settings/llm-request-timeout-ms 120000]
      (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (SocketTimeoutException. "Read timed out")))]
        (let [e (try (litellm/list-models {:credentials credentials})
                     (catch clojure.lang.ExceptionInfo e e))]
          (is (= {:api-error true :status-code 400 :error-code :litellm-timeout}
                 (select-keys (ex-data e) [:api-error :status-code :error-code])))
          (is (re-find #"http://litellm\.internal:4000 did not respond within 120000ms" (ex-message e))))))))
