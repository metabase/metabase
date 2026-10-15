(ns metabase.metabot.self.ollama-test
  "Deliberately narrower than [[metabase.metabot.self.vllm-test]] — the two adapters share a
  transport, so what is covered here is what differs: telling Ollama Cloud's models apart, the catalog
  shape Ollama returns, the context-window check, and the diagnoses."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self :as self]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.ollama :as ollama]
   [metabase.metabot.self.ollama.capabilities :as ollama.capabilities]
   [metabase.metabot.self.ollama.connection :as ollama.connection]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log.capture :as log.capture])
  (:import
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

(defn- no-unstubbed-http
  "Refuse any HTTP request a test did not stub. Building a request body looks a model's capabilities
  up, so without this every `ollama-request-body` test below would resolve `ollama.internal` for real
  — on a resolver that wildcards, waiting out the socket timeout to do it. A refused lookup reads as
  a server that would not answer, which is what the adapter degrades to anyway."
  [thunk]
  (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (java.net.UnknownHostException. "unstubbed")))]
    (thunk)))

(use-fixtures :each no-unstubbed-http)

(defn- with-clean-capabilities!
  "Call `f` against an empty capability cache, emptied again afterwards so a failed assertion cannot
  leave one test's models behind for the next.

  Deliberately not a fixture: the cache is process-wide, and emptying shared state from an `:each`
  fixture would run against this namespace's `^:parallel` tests. `metabase/validate-deftest` rejects
  that, and is right to — only the few tests that assert on what Ollama said about a model need it,
  and none of those are parallel."
  [f]
  (ollama.capabilities/clear-cache!)
  (try
    (f)
    (finally
      (ollama.capabilities/clear-cache!))))

;; not localhost: Metabase is a server, so a realistic self-hosted address is another host
(def ^:private base-url "http://ollama.internal:11434/v1")

(def ^:private credentials
  "A self-hosted connection. No API key: a self-hosted Ollama is unauthenticated, so this is the
  ordinary case rather than a degenerate one."
  {:base-url base-url})

(def ^:private cloud-credentials
  "An Ollama Cloud connection: Cloud's own address, and the key it requires."
  {:base-url "https://ollama.com/v1" :api-key "sk-cloud-key"})

(def ^:private keyed-credentials
  "A self-hosted Ollama behind a proxy that requires a key."
  (assoc credentials :api-key "proxy-key"))

(defn- captured-request
  "Drive `list-models` against a stub and return the request it issued. Credentials go through
  `with-field-defaults` first, as every real caller does."
  [raw-config]
  (let [seen (atom nil)]
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (reset! seen req)
                                               {:status 200 :body {:data []}})]
      (ollama/list-models {:credentials (llm.provider/with-field-defaults "ollama" raw-config)}))
    @seen))

;;; The shape Ollama's OpenAI-compatible `/v1/models` actually returns: no `max_model_len`, no
;;; `parent`, no `name`. Every field vLLM's adapter reads beyond `id` is absent here, which is why
;;; the context-window check reads the window off `/api/ps` instead.
(def ^:private ollama-catalog
  [{:id "good-model"   :object "model" :created 1786676106 :owned_by "library"}
   {:id "chatty-model" :object "model" :created 1786676106 :owned_by "library"}])

;;; ──────────────────────────────────────────────────────────────────
;;; ollama-request-body
;;; ──────────────────────────────────────────────────────────────────

(def ^:private fake-tool
  {:tool-name "fake_tool"
   :doc       "Do a fake thing."
   :schema    [:=> [:cat [:map [:a :string]]] :any]
   :fn        identity})

(def ^:private other-fake-tool
  {:tool-name "other_fake_tool"
   :doc       "Do another fake thing."
   :schema    [:=> [:cat [:map [:b :int]]] :any]
   :fn        identity})

(deftest ^:parallel request-body-applies-default-max-tokens-test
  (testing "an explicit max_tokens is always sent — without one a looping small model consumes the
           whole context window in a single call"
    (is (= self.core/chat-max-output-tokens
           (:max_tokens (ollama/ollama-request-body {:model "good-model"
                                                     :input [{:role :user :content "hi"}]}))))))

(deftest ^:parallel request-body-caller-max-tokens-wins-test
  (testing "a caller-supplied max-tokens is not overridden by the default"
    (is (= 128
           (:max_tokens (ollama/ollama-request-body {:model      "good-model"
                                                     :input      [{:role :user :content "hi"}]
                                                     :max-tokens 128}))))))

(deftest ^:parallel request-body-raises-max-tokens-for-a-forced-tool-call-test
  (testing "a forced tool call gets the token floor even when the caller asked for less — below it a
           reasoning model spends the budget thinking and emits no call"
    (testing "schema"
      (is (= 2048
             (:max_tokens (ollama/ollama-request-body {:model      "good-model"
                                                       :input      [{:role :user :content "hi"}]
                                                       :schema     {:type "object"}
                                                       :max-tokens 128})))))
    (testing "tool_choice required, even with no tools to choose among"
      (is (= 2048
             (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                       :input       [{:role :user :content "hi"}]
                                                       :tool_choice "required"
                                                       :max-tokens  128})))))))

(deftest request-body-raises-max-tokens-for-a-reasoning-model-test
  (testing "a reasoning model gets the larger floor — thinking, answer and tool call are billed
           against one budget"
    (with-clean-capabilities!
      (fn []
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200
                                                          :body   {:capabilities ["completion" "tools" "thinking"]}})]
          (is (= 16384
                 (:max_tokens (ollama/ollama-request-body {:model       "thinking-model"
                                                           :input       [{:role :user :content "hi"}]
                                                           :credentials credentials
                                                           :max-tokens  128}))))))))
  (testing "and a model Ollama does not call a thinking one keeps the caller's value"
    (with-clean-capabilities!
      (fn []
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200
                                                          :body   {:capabilities ["completion" "tools"]}})]
          (is (= 128
                 (:max_tokens (ollama/ollama-request-body {:model       "chat-model"
                                                           :input       [{:role :user :content "hi"}]
                                                           :credentials credentials
                                                           :max-tokens  128})))))))))

(deftest ^:parallel request-body-constrains-the-decoder-on-a-self-hosted-schema-test
  (testing "Ollama discards `tool_choice`, so the shared builder's forced-tool framing is only a
           suggestion. Self-hosted has a real substitute: compile the schema into a decoding grammar."
    (let [body (ollama/ollama-request-body {:model       "good-model"
                                            :input       [{:role :user :content "hi"}]
                                            :schema      {:type "object"}
                                            :credentials credentials})]
      (is (= {:type        "json_schema"
              :json_schema {:name "structured_output" :schema {:type "object"}}}
             (:response_format body)))
      (testing "and nothing is left for the model to call — a tool here would be the suggestion again"
        (is (nil? (:tools body)))
        (is (nil? (:tool_choice body)))))))

(deftest ^:parallel request-body-forces-a-real-tool-call-with-a-union-grammar-test
  (testing "a `:required-tool-call?` profile needs a call among its own tools, which no single schema
           describes. The union Ollama's maintainers endorsed for this does: one arm per tool, each
           pinning `name` to that tool, so the only way to satisfy the grammar is to call one."
    (let [body   (ollama/ollama-request-body {:model       "good-model"
                                              :input       [{:role :user :content "hi"}]
                                              :tools       [fake-tool other-fake-tool]
                                              :tool_choice "required"
                                              :credentials credentials})
          arms   (get-in body [:response_format :json_schema :schema :anyOf])]
      (is (= [["fake_tool"] ["other_fake_tool"]]
             (mapv #(get-in % [:properties :name :enum]) arms)))
      (is (every? #(= ["name" "parameters"] (:required %)) arms))
      (testing "each arm carries that tool's own parameter schema, so arguments are constrained too"
        (is (= [:a :b] (mapv #(-> % :properties :parameters :properties keys first) arms))))
      (testing "the tools stay on the request — the template still has to render their definitions"
        (is (= ["fake_tool" "other_fake_tool"] (mapv #(get-in % [:function :name]) (:tools body)))))
      (testing "and the discarded `tool_choice` is dropped rather than sent as decoration"
        (is (nil? (:tool_choice body)))))))

(deftest ^:parallel request-body-leaves-an-auto-tool-call-unconstrained-test
  (testing "a grammar makes a tool call unavoidable, which is `required` and emphatically not `auto` —
           applying one to an ordinary turn would stop the model ever answering in text"
    (let [body (ollama/ollama-request-body {:model       "good-model"
                                            :input       [{:role :user :content "hi"}]
                                            :tools       [fake-tool]
                                            :credentials credentials})]
      (is (nil? (:response_format body)))
      (is (= "auto" (:tool_choice body))))))

(deftest ^:parallel request-body-asks-cloud-for-the-call-in-words-test
  (testing "Ollama Cloud serves no structured outputs and discards `format` as silently as
           `tool_choice`, so there is no grammar to reach for — the tool stays and the request says
           what it wants. Nothing here pretends that is a guarantee."
    (let [body (ollama/ollama-request-body {:model       "good-model"
                                            :input       [{:role :user :content "hi"}]
                                            :schema      {:type "object"}
                                            :credentials cloud-credentials})]
      (is (nil? (:response_format body)))
      (is (= ["structured_output"] (mapv #(get-in % [:function :name]) (:tools body))))
      (is (= "Answer by calling the `structured_output` tool. Do not reply in chat."
             (:content (last (:messages body))))
          "last, where an instruction carries furthest"))))

(deftest ^:parallel request-body-asks-a-cloud-model-on-a-self-hosted-server-in-words-test
  (testing (str "a self-hosted server forwards a Cloud-tagged model to ollama.com, body and all, so the grammar "
                "would be discarded there just the same — the model, not the connection, decides")
    (let [body (ollama/ollama-request-body {:model       "gpt-oss:120b-cloud"
                                            :input       [{:role :user :content "hi"}]
                                            :schema      {:type "object"}
                                            :credentials credentials})]
      (is (nil? (:response_format body)))
      (is (= "Answer by calling the `structured_output` tool. Do not reply in chat."
             (:content (last (:messages body)))))))
  (testing "while a model the same server runs itself still gets the grammar"
    (is (some? (:response_format (ollama/ollama-request-body {:model       "qwen3:8b"
                                                              :input       [{:role :user :content "hi"}]
                                                              :schema      {:type "object"}
                                                              :credentials credentials}))))))

(deftest ^:parallel served-by-cloud-test
  (testing "Ollama Cloud's own address serves every model under its plain name"
    (are [url] (true? (ollama.connection/served-by-cloud? {:base-url url} "gemma4:31b"))
      "https://ollama.com/v1"
      "https://OLLAMA.com/v1"
      "https://api.ollama.com/v1"))
  (testing "an address that merely contains the name is not it"
    (are [url] (false? (ollama.connection/served-by-cloud? {:base-url url} "gemma4:31b"))
      "https://ollama.com.example.org/v1"
      "https://notollama.com/v1"
      "http://ollama.internal:11434/v1"))
  (testing "on any other server, a Cloud model says so in its tag, by Ollama's own rule"
    (are [model expected] (= expected (ollama.connection/served-by-cloud? credentials model))
      "gpt-oss:120b-cloud"                  true
      "gemma4:cloud"                        true
      "GPT-OSS:120B-CLOUD"                  true
      "qwen3:8b"                            false
      ;; the rule reads the tag, and a name with no tag has none
      "my-model-cloud"                      false
      ;; a registry port is not a tag
      "registry.example.com:5000/foo-cloud" false
      nil                                   false)))

(deftest ^:parallel request-body-leaves-an-unstructured-request-alone-test
  (testing "the instruction is for structured requests only — appending it to ordinary chat would put
           a tool the model does not have in front of it"
    (let [body (ollama/ollama-request-body {:model       "good-model"
                                            :input       [{:role :user :content "hi"}]
                                            :credentials cloud-credentials})]
      (is (= ["hi"] (mapv :content (:messages body))))
      (is (nil? (:response_format body))))))

(deftest ^:parallel request-body-supplies-a-default-temperature-test
  (testing "a self-hosted server picks no sane default server-side, so the adapter supplies one"
    (is (= 0.3
           (:temperature (ollama/ollama-request-body {:model "good-model"
                                                      :input [{:role :user :content "hi"}]})))))
  (testing "and a caller-supplied temperature wins"
    (is (= 0
           (:temperature (ollama/ollama-request-body {:model       "good-model"
                                                      :input       [{:role :user :content "hi"}]
                                                      :temperature 0}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Reasoning replay
;;; ──────────────────────────────────────────────────────────────────

(def ^:private reasoning-turn
  "One agent-loop turn: reasoning, the tool call it led to, the result, the answer."
  [{:role :user :content "how many orders?"}
   {:type :reasoning :id "r1" :text "I should "}
   {:type :reasoning :id "r1" :text "count them"}
   {:type :tool-input :id "c1" :function "run_query" :arguments {:sql "select 1"}}
   {:type :tool-output :id "c1" :result {:output "42"}}
   {:type :text :text "42 orders."}])

(defn- replayed-assistant
  "The assistant message from a `reasoning-turn` request — the one thinking should land on."
  [opts]
  (second (:messages (ollama/ollama-request-body (merge {:model "good-model"
                                                         :input reasoning-turn}
                                                        opts)))))

(deftest ^:parallel request-body-replays-in-turn-reasoning-test
  (testing "reasoning lands on the assistant message carrying the tool call it led to"
    (is (= [{:role "user" :content "how many orders?"}
            {:role       "assistant"
             :content    ""
             :reasoning  "I should count them"
             :tool_calls [{:id       "c1"
                           :type     "function"
                           :function {:name "run_query" :arguments "{\"sql\":\"select 1\"}"}}]}
            {:role "tool" :tool_call_id "c1" :content "42"}
            {:role "assistant" :content "42 orders."}]
           (:messages (ollama/ollama-request-body {:model "good-model" :input reasoning-turn})))))
  (testing "renamed to `reasoning`, since Ollama ignores `reasoning_content` on the way in"
    (is (not (contains? (replayed-assistant nil) :reasoning_content)))))

(deftest ^:parallel request-body-replay-is-not-capability-gated-test
  (testing "replay does not wait on knowing whether the model reasons"
    (doseq [[label creds] {"a connection" credentials
                           "none at all"  nil}]
      (testing label
        (is (= "I should count them"
               (:reasoning (replayed-assistant {:credentials creds}))))))))

(deftest ^:parallel request-body-strips-reasoning-when-the-caller-wants-none-test
  (testing "when the caller wants no thinking, thinking already in the input is dropped too"
    (is (not (contains? (replayed-assistant {:reasoning? false}) :reasoning)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Credentials
;;; ──────────────────────────────────────────────────────────────────

(deftest a-connection-without-a-base-url-fails-rather-than-borrowing-the-setting-test
  (testing "the connection's credentials are the only source — a setting configuring another
           connection is not a fallback"
    (mt/with-temporary-setting-values [llm.settings/llm-ollama-api-base-url "http://saved:11434/v1"]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama base URL is set"
           (ollama/list-models {:credentials {}}))))))

(deftest ai-proxy-is-unsupported-test
  (testing "the managed proxy fronts hosted providers; a self-hosted server is reached directly"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"AI proxy is not supported for Ollama"
           (ollama/list-models {:credentials credentials :ai-proxy? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(deftest list-models-passes-the-catalog-through-test
  (testing "every pulled model is offered — there is no whitelist — in the order the server lists them"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data ollama-catalog}})]
      (is (= {:models [{:id "good-model"   :display_name "good-model"}
                       {:id "chatty-model" :display_name "chatty-model"}]}
             (ollama/list-models {:credentials credentials}))))))

(deftest list-models-keeps-a-tagged-model-id-intact-test
  (testing "Ollama names models `family:tag`, and `llm-metabot-provider` stores the result as
           `ollama/{id}` — the tag separator must survive the listing"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:data [{:id "qwen3:14b"}]}})]
      (is (= {:models [{:id "qwen3:14b" :display_name "qwen3:14b"}]}
             (ollama/list-models {:credentials credentials}))))))

(deftest list-models-fails-closed-on-a-body-that-is-not-a-catalog-test
  (testing "a 2xx whose body carries no model list throws, naming the base URL — the likeliest cause
           being a base URL that omits /v1"
    (doseq [body [{:status "ok"} {:object "list"} 404]]
      (testing (str "body " (pr-str body))
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body body})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Ollama returned an unexpected model list response.*http://ollama\.internal:11434/v1"
               (ollama/list-models {:credentials credentials}))))))))

(deftest list-models-fails-closed-on-a-2xx-that-is-not-json-test
  (testing "a 2xx whose body is not JSON — a proxy's HTML, or a base URL missing /v1 — is a server
           that answered, so it reads as a bad address rather than an unreachable one. The stub throws
           what `:as :json` throws: clj-http parses a 2xx whatever its content type."
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (json/decode "<html>404 Not Found</html>"))]
      (is (=? {:error-code  :malformed-model-catalog
               :status-code 400}
              (try
                (ollama/list-models {:credentials credentials})
                (catch clojure.lang.ExceptionInfo e (ex-data e)))))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Ollama returned an unexpected model list response.*http://ollama\.internal:11434/v1"
           (ollama/list-models {:credentials credentials}))))))

(deftest list-models-keeps-the-parse-error-as-the-cause-test
  (testing "the parse error travels as the cause, so a log shows whether the body was HTML, empty or cut off"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (json/decode "<html>404 Not Found</html>"))]
      (is (instance? com.fasterxml.jackson.core.JsonProcessingException
                     (try (ollama/list-models {:credentials credentials})
                          (catch clojure.lang.ExceptionInfo e (ex-cause e))))))))

(deftest unreachable-server-names-the-address-it-tried-test
  (testing "a transport failure names the address actually called, so a Cloud connection — which
           carries no base URL of its own — does not report a blank one"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] (throw (java.net.ConnectException. "refused")))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not reach Ollama at http://ollama\.internal:11434/v1"
           (ollama/list-models {:credentials credentials})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Could not reach Ollama at https://ollama\.com/v1"
           (ollama/list-models {:credentials cloud-credentials}))))))
;;; ──────────────────────────────────────────────────────────────────
;;; Preflight
;;; ──────────────────────────────────────────────────────────────────

(defn- probe-kind
  "Which probe a stubbed `POST /chat/completions` is serving, read off the body.

  Never off `tool_choice`: Ollama discards that field, so a stub that answered differently for it
  would let a check that proves nothing look like one that proves something."
  [req]
  (if (or (:response_format req)
          (some #(= "structured_output" (get-in % [:function :name])) (:tools req)))
    :structured
    :tools))

(defn- probing-server
  "Stub `http/request` for the preflight path: `GET /models` returns `models`, `POST /api/show` reports
  each model's `:capabilities` from the catalog entry (absent where the entry has none, as an Ollama
  too old to report them answers), `GET /api/ps` reports the window each model was loaded with from
  its `:context-length` (so a catalog entry without one is a server that will not say), and each
  `POST /chat/completions` returns whatever `choice-by-probe` holds for the probe it was sent, so the
  two probes can disagree — or, where that is a function, what it returns for the model probed."
  [models choice-by-probe]
  (fn [{:keys [url body]}]
    (cond
      (re-find #"/models$" (str url))
      {:status 200 :body {:data models}}

      (re-find #"/api/show$" (str url))
      (let [model (:model (json/decode+kw (str body)))
            entry (m/find-first #(= model (:id %)) models)]
        {:status 200 :body (cond-> {:model model}
                             (:capabilities entry) (assoc :capabilities (:capabilities entry)))})

      (re-find #"/api/version$" (str url))
      {:status 200 :body {:version "0.12.0"}}

      (re-find #"/api/ps$" (str url))
      {:status 200 :body {:models (for [{:keys [id context-length]} models
                                        :when context-length]
                                    {:model id :name id :context_length context-length})}}

      :else
      (let [decoded (json/decode+kw (str body))
            choice  (get choice-by-probe (probe-kind decoded))]
        {:status 200 :body {:choices [(if (fn? choice) (choice (:model decoded)) choice)]}}))))

(def ^:private tool-calling-message
  {:content    ""
   :tool_calls [{:id       "call-1"
                 :type     "function"
                 :function {:name "record_table_name" :arguments "{\"table_name\": \"orders\"}"}}]})

(def ^:private constrained-message
  "What a self-hosted server honoring `response_format` returns: the JSON as ordinary content, with no
  tool call anywhere in sight."
  {:content "{\"title\": \"Late orders\"}"})

(def ^:private structured-tool-message
  "What Cloud returns when the model takes the instruction it was given in place of a forced call."
  {:content    ""
   :tool_calls [{:id       "call-2"
                 :type     "function"
                 :function {:name "structured_output" :arguments "{\"title\": \"Late orders\"}"}}]})

(def ^:private structured-success
  {:message constrained-message :finish_reason "stop"})

(defn- probe-choice!
  "Drive a probing connect against stubbed probe answers. `creds` decides which structured-output probe
  preflight runs, so it decides which of the two answers is reached."
  ([models tool-calling-choice structured-choice]
   (probe-choice! models tool-calling-choice structured-choice credentials))
  ([models tool-calling-choice structured-choice creds]
   (mt/with-dynamic-fn-redefs [http/request (probing-server models {:tools      tool-calling-choice
                                                                    :structured structured-choice})]
     (ollama/list-models {:credentials creds :probe? true}))))

(defn- probe!
  [models chat-message]
  (probe-choice! models {:message chat-message :finish_reason "tool_calls"} structured-success))

(deftest preflight-passes-on-a-model-that-calls-tools-test
  (testing "a model that returns a well-formed tool call passes and is adopted as the one to run on"
    (is (= {:models          [{:id "good-model" :display_name "good-model"}]
            :connection-info {:probed-model "good-model"}}
           (probe! [{:id "good-model"}] tool-calling-message)))))

(deftest preflight-skips-models-that-cannot-chat-test
  (testing "Ollama lists models newest-first and its OpenAI-compatible listing does not filter out
           embedding models, so a newest pull that is one would fail the connect outright — with no
           way out, since the form hides the model picker for a type whose catalog is not fixed"
    (with-clean-capabilities!
      (fn []
        (is (= "thinking-model"
               (get-in (probe! [{:id "embedding-model" :capabilities ["embedding"]}
                                {:id "thinking-model"  :capabilities ["completion" "tools" "thinking"]}]
                               tool-calling-message)
                       [:connection-info :probed-model]))))))
  (testing "a server that reports no capabilities rules nothing out, and keeps taking the first entry"
    (with-clean-capabilities!
      (fn []
        (is (= "first-model"
               (get-in (probe! [{:id "first-model"} {:id "second-model"}] tool-calling-message)
                       [:connection-info :probed-model])))))))

(defn- probe-by-model!
  "Drive a probing connect where the tool-calling probe answers per model from `tool-message-by-model`."
  [models tool-message-by-model opts]
  (with-clean-capabilities!
    (fn []
      (mt/with-dynamic-fn-redefs [http/request (probing-server
                                                models
                                                {:tools      (fn [model]
                                                               {:message       (get tool-message-by-model model)
                                                                :finish_reason "tool_calls"})
                                                 :structured structured-success})]
        (ollama/list-models (merge {:credentials credentials :probe? true} opts))))))

(deftest preflight-moves-on-from-a-model-that-fails-the-probes-test
  (let [models   [{:id "qwen3:0.6b"} {:id "qwen3:14b"}]
        by-model {"qwen3:0.6b" {:content "Sure! The table is orders."}
                  "qwen3:14b"  tool-calling-message}]
    (testing "the connect path names no model and the form offers no picker, so a newest model that cannot
             drive Metabot hands over to the next chat model rather than leaving the admin stuck"
      (is (= "qwen3:14b"
             (get-in (probe-by-model! models by-model {}) [:connection-info :probed-model]))))
    (testing "a model asked for by name is the only one probed"
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"qwen3:0\.6b answered with text instead of calling a tool"
           (probe-by-model! models by-model {:model "qwen3:0.6b"}))))
    (testing "an edit's `:proposed-model` is a guess, not a request: a stored model that no longer passes
             hands over to the next chat model as on connect, since the form offers no picker"
      (is (= "qwen3:14b"
             (get-in (probe-by-model! models by-model {:proposed-model "qwen3:0.6b"})
                     [:connection-info :probed-model])))))
  (testing "when every model tried fails, the error names them and gives the newest one's reason"
    (let [ids (map #(str "m" %) (range 5))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"None of the models tried can drive Metabot \(m0, m1, m2\)\. m0 answered with text"
           (probe-by-model! (map #(hash-map :id %) ids) (zipmap ids (repeat {:content "Sure!"})) {})))))
  (testing "a timeout ends the search at the first model: the next one would load just as slowly"
    (let [probed (atom [])]
      (with-clean-capabilities!
        (fn []
          (mt/with-dynamic-fn-redefs [http/request (let [serve (probing-server [{:id "m0"} {:id "m1"}] {})]
                                                     (fn [{:keys [url body] :as req}]
                                                       (if (re-find #"/chat/completions$" (str url))
                                                         (do (swap! probed conj (:model (json/decode+kw (str body))))
                                                             (throw (SocketTimeoutException. "Read timed out")))
                                                         (serve req))))]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"^Ollama did not answer the connection test"
                 (ollama/list-models {:credentials credentials :probe? true})))
            (is (= ["m0"] @probed)))))))
  (let [connect (fn [failing-status]
                  (let [probed (atom [])
                        tools  (fn [model]
                                 (swap! probed conj model)
                                 (if (= "m0" model)
                                   (throw (ex-info "clj-http: status" {:status failing-status
                                                                       :body   "{\"error\":\"m0\"}"}))
                                   {:message tool-calling-message :finish_reason "tool_calls"}))]
                    (with-clean-capabilities!
                      (fn []
                        {:result (try (get-in (probe-choice! [{:id "m0"} {:id "m1"}] tools structured-success)
                                              [:connection-info :probed-model])
                                      (catch clojure.lang.ExceptionInfo e (ex-message e)))
                         :probed @probed}))))]
    (testing "a 500 is how Ollama answers for a model too large to load, so the search moves on"
      (is (= {:result "m1" :probed ["m0" "m1"]} (connect 500))))
    (testing "a 400 is how Ollama answers for a model with no tool support when capabilities are unknown"
      (is (= {:result "m1" :probed ["m0" "m1"]} (connect 400))))
    (testing "a rejected key would be rejected for every model, so it ends the search"
      (is (=? {:result #"^Ollama rejected the API key" :probed ["m0"]} (connect 401)))))
  (testing "a window too small is the model's own as often as the server's — a Modelfile can set one — so
           the search moves on"
    (is (= "m1"
           (get-in (probe! [{:id "m0" :context-length 4096} {:id "m1" :context-length 32768}]
                           tool-calling-message)
                   [:connection-info :probed-model])))))

(deftest connect-warns-when-ollamas-own-api-is-out-of-reach-test
  (let [serve   (probing-server [{:id "good-model"}]
                                {:tools      {:message tool-calling-message :finish_reason "tool_calls"}
                                 :structured structured-success})
        connect (fn [handler]
                  (with-clean-capabilities!
                    (fn []
                      (mt/with-dynamic-fn-redefs [http/request handler]
                        (log.capture/with-log-messages-for-level [messages [metabase.metabot.self.ollama :warn]]
                          (ollama/list-models {:credentials credentials :probe? true})
                          (messages))))))]
    (testing (str "a proxy that forwards only /v1 connects fine and degrades quietly, so connecting says so "
                  "where an operator will see it, without the response the error carries")
      (let [messages (connect (fn [{:keys [url] :as req}]
                                (if (re-find #"/api/" (str url))
                                  (throw (ex-info "404 Not Found" {:status 404 :body "secret response"}))
                                  (serve req))))]
        (is (=? [{:message #"Ollama at http://ollama\.internal:11434/v1 did not answer /api/version \(404 Not Found\)\..*"}]
                messages))
        (is (not-any? #(re-find #"secret response" (str (:message %) (:e %))) messages))))
    (testing "a server whose own API answers is not warned about"
      (is (empty? (connect serve))))))

(deftest preflight-says-so-when-no-model-can-chat-test
  (testing "a server that rules every model out is told so, rather than handed one to probe"
    (with-clean-capabilities!
      (fn []
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"None of the models on this server can chat and call tools"
             (probe! [{:id "embed-a" :capabilities ["embedding"]}
                      {:id "embed-b" :capabilities ["embedding"]}]
                     tool-calling-message)))))))

(deftest preflight-diagnoses-a-model-that-was-asked-for-by-name-test
  (testing "an API client can name a model the picker no longer offers. Saying why beats Ollama's own 400,
           and beats reporting a model the server plainly has as missing."
    (doseq [[label capabilities] {"an embedding model"                    ["embedding"]
                                  "a chat model that cannot call tools" ["completion"]}]
      (testing label
        (with-clean-capabilities!
          (fn []
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"named-model can't call tools, which Metabot needs"
                 (mt/with-dynamic-fn-redefs [http/request (probing-server
                                                           [{:id "named-model" :capabilities capabilities}]
                                                           {:tools      {:message tool-calling-message :finish_reason "tool_calls"}
                                                            :structured structured-success})]
                   (ollama/list-models {:credentials credentials :model "named-model" :probe? true}))))))))))

(deftest listing-offers-only-models-metabot-could-run-on-test
  (testing "the admin's picker is the catalog minus what Ollama says cannot chat"
    (with-clean-capabilities!
      (fn []
        (is (= [{:id "thinking-model" :display_name "thinking-model"}]
               (:models (mt/with-dynamic-fn-redefs
                          [http/request (probing-server [{:id "embedding-model" :capabilities ["embedding"]}
                                                         {:id "thinking-model"  :capabilities ["completion" "tools" "thinking"]}]
                                                        {})]
                          (ollama/list-models {:credentials credentials})))))))))

(deftest preflight-rejects-a-context-window-too-small-for-metabots-prompt-test
  (testing (str "Ollama defaults the window to 4096 below 23GiB of VRAM, and a request cannot widen it: "
                "the OpenAI-compatible surface has no `num_ctx`. Exceeding it is not an error either — "
                "context shift keeps the first few tokens and the tail and discards the middle, which "
                "is where the tools and the system prompt are, so Metabot would run with neither.")
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"4096 token context window, which is too small for Metabot\. Configure Ollama to load the model with a context window of at least 16384 tokens\.$"
         (probe! [{:id "good-model" :context-length 4096}] tool-calling-message))))
  (testing "a window that clears the floor passes"
    (is (= "good-model"
           (get-in (probe! [{:id "good-model" :context-length 16384}] tool-calling-message)
                   [:connection-info :probed-model])))
    (testing "and the rejected case above passes every probe, which is why the probes cannot stand in
             for this check: they are one-line prompts that fit in any window"
      (is (= "good-model"
             (get-in (probe! [{:id "good-model"}] tool-calling-message)
                     [:connection-info :probed-model]))))))

(deftest preflight-checks-the-window-before-spending-a-second-generation-test
  (testing "the window is a lookup once the tool probe has loaded the model, so a model whose window is
           too small is turned away before the structured-output probe runs"
    (let [probes (atom [])]
      (mt/with-dynamic-fn-redefs [http/request (let [serve (probing-server
                                                            [{:id "good-model" :context-length 4096}]
                                                            {:tools      {:message tool-calling-message :finish_reason "tool_calls"}
                                                             :structured structured-success})]
                                                 (fn [{:keys [url body] :as req}]
                                                   (when (re-find #"/chat/completions$" (str url))
                                                     (swap! probes conj (probe-kind (json/decode+kw (str body)))))
                                                   (serve req)))]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"4096 token context window"
             (ollama/list-models {:credentials credentials :probe? true})))
        (is (= [:tools] @probes))))))

(deftest preflight-does-not-read-the-window-off-the-catalog-test
  (testing (str "the window comes from `/api/ps`, not from the listing — Ollama's catalog carries no "
                "`max_model_len`, and a hand-written one must not be mistaken for the loaded window")
    (is (= "good-model"
           (get-in (probe! [{:id "good-model" :max_model_len 4096}] tool-calling-message)
                   [:connection-info :probed-model])))))

(deftest preflight-passes-when-the-server-will-not-say-what-window-it-loaded-test
  (testing (str "an Ollama that answers `/api/ps` without the model — already unloaded under "
                "`OLLAMA_KEEP_ALIVE=0` — or will not answer it at all is no grounds to fail a "
                "connection whose probes passed")
    (is (= "good-model"
           (get-in (probe! [{:id "good-model"}] tool-calling-message)
                   [:connection-info :probed-model])))
    (mt/with-dynamic-fn-redefs [http/request (let [server (probing-server [{:id "good-model"}]
                                                                          {:tools      {:message tool-calling-message
                                                                                        :finish_reason "tool_calls"}
                                                                           :structured structured-success})]
                                               (fn [{:keys [url] :as req}]
                                                 (if (re-find #"/api/ps$" (str url))
                                                   (throw (ex-info "ps is not there" {}))
                                                   (server req))))]
      (is (= "good-model"
             (get-in (ollama/list-models {:credentials credentials :probe? true})
                     [:connection-info :probed-model]))))))

(defn- cloud-probe!
  [models]
  (probe-choice! models
                 {:message tool-calling-message :finish_reason "tool_calls"}
                 {:message structured-tool-message :finish_reason "tool_calls"}
                 cloud-credentials))

(deftest preflight-gates-cloud-on-a-context-window-too-test
  (testing (str "Cloud already runs a model at its largest window, so a window below the floor is the "
                "model's own limit — which is a model Metabot cannot use, exactly as on a self-hosted "
                "server that was started with too small a window")
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"4096 token context window, which is too small for Metabot\. Pick a model with a context window of at least 16384 tokens\.$"
         (cloud-probe! [{:id "small-window-model" :context-length 4096}]))))
  (testing "a Cloud model whose window clears the floor passes"
    (is (= "big-window-model"
           (get-in (cloud-probe! [{:id "big-window-model" :context-length 131072}])
                   [:connection-info :probed-model])))))

(deftest preflight-rejects-a-model-that-cannot-call-tools-test
  (testing "the fix is always a different model — Ollama drives tool calling from the model's own
           template, so there is no server flag to point the admin at"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"answered with text instead of calling a tool.*supports tool calling"
         (probe! [{:id "chatty-model"}] {:content "Sure! The table is orders."})))))

(deftest preflight-rejects-a-model-that-calls-the-wrong-tool-test
  (testing "the agent loop runs only registered tool names and drops the rest without a word, so a
           model that invents one would leave Metabot doing nothing with nothing to show for it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"called 'write_query' instead of the one tool it was offered"
         (probe! [{:id "creative-model"}]
                 {:content    ""
                  :tool_calls [{:id       "call-1"
                                :type     "function"
                                :function {:name "write_query" :arguments "{\"table_name\": \"orders\"}"}}]})))))

(deftest preflight-rejects-a-model-that-omits-a-required-argument-test
  (testing "an empty argument map is well-formed JSON and useless: the agent loop validates each call
           against its tool's schema, so the connection would fail later rather than here"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"without its required table_name argument"
         (probe! [{:id "sloppy-model"}]
                 {:content    ""
                  :tool_calls [{:id       "call-1"
                                :type     "function"
                                :function {:name "record_table_name" :arguments "{}"}}]})))))

(deftest preflight-rejects-a-model-that-leaks-its-thinking-into-chat-test
  (testing "reasoning that arrives as chat text would appear inside Metabot's answers"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"streamed its reasoning as chat text"
         (probe! [{:id "good-model"}] {:content "<think>hmm</think> orders"})))))

(deftest preflight-probes-structured-output-the-way-the-runtime-asks-for-it-test
  (testing "`tool_choice` is discarded by Ollama, so a probe that only sets it re-runs the tool-calling
           check and can only pass. Each deployment is probed through the mechanism it will really use."
    (let [bodies (atom [])
          record (fn [models choice-by-probe]
                   (let [server (probing-server models choice-by-probe)]
                     (fn [{:keys [body] :as req}]
                       (when body (swap! bodies conj (json/decode+kw (str body))))
                       (server req))))]
      (testing "self-hosted constrains the decoder, and offers no tool to call"
        (reset! bodies [])
        (mt/with-dynamic-fn-redefs
          [http/request (record [{:id "good-model"}] {:tools      {:message tool-calling-message :finish_reason "tool_calls"}
                                                      :structured structured-success})]
          (ollama/list-models {:credentials credentials :probe? true}))
        (let [structured (m/find-first :response_format @bodies)]
          (is (some? structured)
              "the structured probe must send response_format")
          (is (= "json_schema" (get-in structured [:response_format :type])))
          (is (nil? (:tools structured))
              "nothing to call under a grammar — a tool here would probe the wrong path")))
      (testing "Cloud has no grammar to fall back on, so it probes the instruction-and-tool path"
        (reset! bodies [])
        (mt/with-dynamic-fn-redefs
          [http/request (record [{:id "good-model"}] {:tools      {:message tool-calling-message :finish_reason "tool_calls"}
                                                      :structured {:message structured-tool-message :finish_reason "tool_calls"}})]
          (ollama/list-models {:credentials cloud-credentials :probe? true}))
        (let [structured (m/find-first #(some (fn [t] (= "structured_output" (get-in t [:function :name])))
                                              (:tools %))
                                       @bodies)]
          (is (some? structured)
              "the structured probe must offer the schema tool under the name the agent loop reads")
          (is (nil? (:response_format structured))
              "Cloud serves no structured outputs — probing one would pass on a promise it cannot keep")
          (is (some #(re-find #"structured_output" (str (:content %))) (:messages structured))
              "and must carry the instruction that stands in for the discarded tool_choice"))))))

(deftest preflight-rejects-a-self-hosted-server-that-ignores-the-schema-test
  (testing "an Ollama too old to read `response_format` ignores it and the model answers in prose.
           That is a server problem, not a model one, so the message names both remedies."
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"did not answer with JSON matching the schema.*response_format"
         (probe-choice! [{:id "good-model"}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message {:content "Sure! How about \"Late orders\"?"} :finish_reason "stop"})))))

(deftest preflight-rejects-a-self-hosted-answer-that-is-json-but-not-the-schema-test
  (testing "JSON alone is not the contract — the caller reads named fields out of it"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"did not answer with JSON matching the schema"
         (probe-choice! [{:id "good-model"}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message {:content "{\"summary\": \"Late orders\"}"} :finish_reason "stop"})))))

(deftest preflight-rejects-a-cloud-model-that-will-not-call-the-tool-test
  (testing "Cloud cannot force the call, and the runtime re-ask cannot rescue a model that never makes
           it, so this has to fail at connect rather than on every title"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"would not answer Ollama Cloud's structured-output request with a tool call"
         (probe-choice! [{:id "good-model"}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message {:content "Late orders"} :finish_reason "stop"}
                        cloud-credentials)))))

(deftest preflight-truncated-structured-output-is-its-own-diagnosis-test
  (testing "a schema too large for the token budget looks nothing like a model that cannot follow one"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"ceiling before completing the structured answer"
         (probe-choice! [{:id "good-model"}]
                        {:message tool-calling-message :finish_reason "tool_calls"}
                        {:message {:content "{\"title\": \"Late or"} :finish_reason "length"})))))

(deftest preflight-rejects-a-model-the-server-has-not-pulled-test
  (testing "falling back to another pulled model would pass every check and then persist a provider
           string naming a model the server does not have"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"missing-model is not available.*Models on offer: good-model, chatty-model"
         (mt/with-dynamic-fn-redefs
           [http/request (probing-server ollama-catalog
                                         {"auto"     {:message tool-calling-message :finish_reason "tool_calls"}
                                          "required" {:message tool-calling-message :finish_reason "tool_calls"}})]
           (ollama/list-models {:credentials credentials :probe? true :model "missing-model"}))))))

(deftest preflight-on-an-empty-catalog-is-its-own-failure-test
  (testing "a reachable server offering nothing is a distinct failure from a model that misbehaves"
    (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body {:object "list" :data []}})]
      (is (= {:models []} (ollama/list-models {:credentials credentials})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"offering no models"
           (ollama/list-models {:credentials credentials :probe? true}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming requests
;;; ──────────────────────────────────────────────────────────────────

(defn- raw!
  "Run `ollama-raw` to completion against whatever the surrounding redefs stub out, returning the
  exception it threw."
  []
  (try (into [] (ollama/ollama-raw {:model       "good-model"
                                    :input       [{:role :user :content "hi"}]
                                    :credentials credentials}))
       (catch clojure.lang.ExceptionInfo e e)))

(defn- failing-stream
  "Stub the SSE stream so consuming it throws `e`, exercising `io-guarded` rather than the request."
  [e]
  (fn [_] (reify clojure.lang.IReduceInit
            (reduce [_ _rf _init] (throw e)))))

(deftest stream-socket-timeout-is-tagged-and-not-retryable-test
  (testing "a timeout mid-stream is tagged rather than raw, and must not be replayed — a retry
           costs a full cold prefill"
    (with-redefs [self.core/sse-reducible (failing-stream (SocketTimeoutException. "Read timed out"))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (raw!)]
        (is (= :ollama-timeout (:error-code (ex-data e))))
        (is (re-find #"stopped responding" (ex-message e)))
        (is (false? (#'self/retryable-error? e)))))))

(deftest stream-severed-mid-body-is-tagged-and-not-retryable-test
  (testing "a connection dropped mid-stream is a distinct diagnosis from a timeout, and equally
           must not be replayed"
    (with-redefs [self.core/sse-reducible (failing-stream (java.io.IOException. "Connection reset"))
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [_] {:body nil})]
      (let [e (raw!)]
        (is (= :ollama-stream-interrupted (:error-code (ex-data e))))
        (is (re-find #"interrupted before the response finished" (ex-message e)))
        (is (false? (#'self/retryable-error? e)))))))

(deftest http-errors-reach-the-status-specific-message-test
  (testing "the IOException catch runs first, so a non-2xx must still be translated by the
           status-specific table rather than surfacing as a bare clj-http error"
    (are [status pattern] (thrown-with-msg? clojure.lang.ExceptionInfo pattern
                                            ;; `rethrow-api-error!` only translates a response that
                                            ;; carries a body, which is what clj-http actually raises
                                            (with-redefs [http/request (fn [_] (throw (ex-info "clj-http"
                                                                                               {:status status
                                                                                                :body   "{}"})))]
                                              (ollama/ollama-raw {:model       "good-model"
                                                                  :input       [{:role :user :content "hi"}]
                                                                  :credentials credentials})))
      401 #"Ollama rejected the API key"
      404 #"base URL should end in /v1"
      429 #"Ollama is rate limiting this instance"
      500 #"internal server error")))

(defn- chunk-with
  "One Chat Completions chunk carrying `delta`, plus the top-level fields the shared translation reads
  to open the stream."
  ([delta] (chunk-with delta nil))
  ([delta finish-reason]
   {:id      "chatcmpl-1"
    :model   "good-model"
    :choices [(cond-> {:index 0 :delta delta}
                finish-reason (assoc :finish_reason finish-reason))]}))

(defn- streamed-parts!
  "Run `ollama` end to end over `responses` — one realized chunk sequence per HTTP request, in order —
  and return the AISDK parts a caller would read, along with how many requests it took."
  [responses opts]
  (let [remaining (atom (vec responses))
        calls     (atom 0)]
    (with-redefs [self.core/sse-reducible identity
                  debug/capture-stream    (fn [r _] r)
                  ;; `/api/show` is capability metadata, not a generation: answered without
                  ;; capabilities, and not counted, so `:calls` stays a count of real requests
                  http/request            (fn [{:keys [url]}]
                                            (if (re-find #"/api/show$" (str url))
                                              {:status 200 :body {}}
                                              (do
                                                (swap! calls inc)
                                                (let [[head & tail] @remaining]
                                                  (reset! remaining (vec tail))
                                                  {:body head}))))]
      {:parts (into [] (self.core/aisdk-xf) (ollama/ollama opts))
       :calls @calls})))

(defn- parts-of
  "The parts of one `:type` from a [[streamed-parts!]] result. Every streaming test asks this question,
  and inlining the filter made the assertions about the filter rather than about the answer."
  [result kind]
  (filterv #(= kind (:type %)) (:parts result)))

(defn- usage-part [result] (first (parts-of result :usage)))

(def ^:private usage-chunk
  "The separate final chunk carrying usage, which is where the finish reason is reported."
  {:id "chatcmpl-1" :model "good-model" :choices []
   :usage {:prompt_tokens 10 :completion_tokens 5}})

(defn- chat-opts
  "An ordinary chat request: no schema, no tools."
  []
  {:model       "good-model"
   :input       [{:role :user :content "hi"}]
   :credentials credentials})

(defn- structured-opts
  "A `:schema` request against `creds` — the shape `call-llm-structured` sends."
  ([] (structured-opts credentials))
  ([creds]
   {:model       "good-model"
    :input       [{:role :user :content "hi"}]
    :schema      {:type "object"}
    :credentials creds}))

(def ^:private constrained-stream
  "What a self-hosted server under a decoding grammar streams back: JSON in the content channel, split
  across deltas like any other text, and no tool call anywhere."
  [(chunk-with {:role "assistant" :content ""})
   (chunk-with {:content "{\"title\":"})
   (chunk-with {:content " \"Late orders\"}"})
   (chunk-with {} "stop")])

(deftest constrained-output-reaches-the-caller-as-a-tool-call-test
  (testing "`call-llm-structured` reads a tool call, but a constrained answer arrives as content. The
           adapter owns that difference: downstream must see what a forced-tool provider produces."
    (let [result (streamed-parts! [constrained-stream]
                                  (structured-opts))]
      (is (= [{:type      :tool-input
               :function  "structured_output"
               :arguments {:title "Late orders"}}]
             (mapv #(select-keys % [:type :function :arguments])
                   (parts-of result :tool-input))))
      (testing "and no text part — the raw JSON must not also surface as an answer"
        (is (empty? (parts-of result :text)))))))

(deftest constrained-output-reports-the-finish-reason-of-a-tool-call-test
  (testing "a constrained answer finishes with `stop`; the stream should say what it really produced"
    (let [result (streamed-parts! [(conj (vec (butlast constrained-stream))
                                         (chunk-with {} "stop")
                                         usage-chunk)]
                                  (structured-opts))]
      (is (= "tool-calls" (:finish-reason (usage-part result)))))))

(deftest constrained-output-keeps-truncation-visible-test
  (testing "`length` must survive the rewrite — a schema too large for the budget is a real failure,
           and dressing it up as a completed tool call would hide it behind a JSON parse error"
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:content "{\"title\": \"Late or"})
                                    (chunk-with {} "length")
                                    usage-chunk]]
                                  (structured-opts))]
      (is (= "length" (:finish-reason (usage-part result)))))))

(deftest constrained-output-forwards-reasoning-alongside-the-json-test
  (testing "the grammar binds the answer channel only, so a thinking model still streams its thinking"
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:reasoning "which orders..."})
                                    (chunk-with {:content "{\"title\": \"Late orders\"}"})
                                    (chunk-with {} "stop")]]
                                  (structured-opts))]
      (is (= ["which orders..."] (mapv :text (parts-of result :reasoning))))
      (is (= [{:title "Late orders"}]
             (mapv :arguments (parts-of result :tool-input)))))))

(def ^:private tool-union-stream
  "What a self-hosted server under the union grammar streams back: a tool call named and argued in the
  content channel, with `tool_calls` empty."
  [(chunk-with {:role "assistant" :content ""})
   (chunk-with {:content "{\"name\": \"fake_tool\","})
   (chunk-with {:content " \"parameters\": {\"a\": \"x\"}}"})
   (chunk-with {} "stop")])

(defn- forced-tool-opts []
  {:model       "good-model"
   :input       [{:role :user :content "hi"}]
   :tools       [fake-tool other-fake-tool]
   :tool_choice "required"
   :credentials credentials})

(deftest union-grammar-answer-reaches-the-agent-loop-as-the-tool-it-named-test
  (testing "the grammar guarantees a call, but puts it in the content channel. The agent loop reads
           tool calls, so the adapter has to name the tool the answer chose — not a fixed one"
    (let [result (streamed-parts! [tool-union-stream] (forced-tool-opts))]
      (is (= [{:type      :tool-input
               :function  "fake_tool"
               :arguments {:a "x"}}]
             (mapv #(select-keys % [:type :function :arguments])
                   (parts-of result :tool-input))))
      (testing "and the JSON must not also surface as an answer the user would see"
        (is (empty? (parts-of result :text)))))))

(deftest union-grammar-truncation-is-not-dressed-up-as-a-call-test
  (testing "a half-written union answer has no readable tool name. Emitting a call anyway would turn a
           truncation into a confusing parse error; `length` is the true diagnosis and must survive"
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:content "{\"name\": \"fake_to"})
                                    (chunk-with {} "length")
                                    usage-chunk]]
                                  (forced-tool-opts))]
      (is (empty? (parts-of result :tool-input)))
      (is (= "length" (:finish-reason (usage-part result)))))))

(deftest an-auto-tool-turn-is-left-unconstrained-test
  (testing "no grammar on an `auto` turn, so nothing rewrites the model's text into a tool call it
           never made — forcing every turn would stop these profiles ever answering"
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:content "no tool needed"})
                                    (chunk-with {} "stop")]]
                                  (dissoc (forced-tool-opts) :tool_choice))]
      (is (= ["no tool needed"] (mapv :text (parts-of result :text))))
      (is (empty? (parts-of result :tool-input))))))

(deftest cloud-forced-calls-are-asked-for-not-rewritten-test
  (testing "Cloud has neither lever, so its tool call arrives the ordinary way and must pass through
           untouched — and a model that answers in chat produces the caller's ordinary failure rather
           than anything this adapter invents"
    (let [taken (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                   (chunk-with {:tool_calls [{:id       "call-9"
                                                              :type     "function"
                                                              :function {:name      "structured_output"
                                                                         :arguments "{\"title\": \"Late orders\"}"}}]})
                                   (chunk-with {} "tool_calls")]]
                                 (structured-opts cloud-credentials))
          ignored (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                     (chunk-with {:content "How about \"Late orders\"?"})
                                     (chunk-with {} "stop")]]
                                   (structured-opts cloud-credentials))]
      (is (= [{:title "Late orders"}]
             (mapv :arguments (parts-of taken :tool-input))))
      (testing "no re-ask: one request, and the missing call stays missing for the caller to report"
        (is (= 1 (:calls ignored)))
        (is (empty? (parts-of ignored :tool-input)))
        (is (= ["How about \"Late orders\"?"]
               (mapv :text (parts-of ignored :text))))))))

(deftest an-unstructured-request-is-streamed-straight-through-test
  (testing "none of the structured machinery may touch ordinary chat — no buffering, no rewriting"
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:content "hello"})
                                    (chunk-with {} "stop")]]
                                  (chat-opts))]
      (is (= 1 (:calls result)))
      (is (= ["hello"] (mapv :text (parts-of result :text))))
      (is (empty? (parts-of result :error))
          "a stream that says why it ended is complete"))))

(deftest a-stream-that-ends-without-a-finish-reason-fails-the-turn-test
  (testing (str "Ollama reports a generation that failed after the first token as an empty chunk and closes "
                "the stream with no finish reason, so the half answer must not pass as a complete one")
    (let [result (streamed-parts! [[(chunk-with {:role "assistant" :content ""})
                                    (chunk-with {:content "The answer is"})
                                    {:id "chatcmpl-1" :model "good-model" :choices []}]]
                                  (chat-opts))]
      (is (= ["The answer is"] (mapv :text (parts-of result :text))))
      (is (=? [{:error {:message "The Ollama server ended the response before finishing it."}}]
              (parts-of result :error))))))

(deftest a-request-without-a-model-fails-before-any-io-test
  (testing "a blank model is a configuration problem, not something to discover from the server"
    (with-redefs [http/request (fn [_] (throw (ex-info "should never be called" {})))]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama model is set"
           (ollama/ollama-raw {:model "" :input [] :credentials credentials}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Registration
;;; ──────────────────────────────────────────────────────────────────

(deftest ollama-is-a-registered-provider-type-test
  (testing "registered, so it reaches the admin dropdown and the generated docs page"
    (is (some? (llm.provider/provider-type "ollama")))
    (testing "with no default model — the operator serves whatever they pulled"
      (is (nil? (llm.provider/default-model "ollama"))))))

(deftest ollama-form-asks-for-an-address-and-a-key-test
  (let [by-key   (u/index-by :key (:fields (llm.provider/provider-type "ollama")))
        base-url (:base-url by-key)]
    (testing "two fields, and nothing that says which kind of server is behind them: the address does"
      (is (= #{:base-url :api-key} (set (keys by-key)))))
    (testing (str "the address is required and has no default: a self-hosted Ollama is wherever the operator put "
                  "it, and on a real install localhost is the Metabase container rather than that host")
      (is (true? (:required? base-url)))
      (is (nil? (:default base-url))))
    (testing "the key is optional, since a self-hosted server takes none"
      (is (not (:required? (:api-key by-key)))))))

(deftest ollama-requires-an-address-test
  (testing "an address is a complete connection, whether it is a server of the operator's or Ollama Cloud's"
    (is (true? (llm.provider/credentials-complete? "ollama" {:base-url base-url})))
    (is (true? (llm.provider/credentials-complete? "ollama" cloud-credentials))))
  (testing "a key with nowhere to send it is not"
    (is (false? (llm.provider/credentials-complete? "ollama" {:api-key "sk-x"})))
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"API base URL is required for ollama"
         (llm.provider/validate-config! "ollama" {:api-key "sk-x"}))))
  (testing "an address is judged by the network policy"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"not allowed to connect to"
         (llm.provider/validate-config! "ollama" {:base-url "http://192.168.1.20:11434/v1"}))))
  (testing "a trailing slash still cannot double up when a path is joined onto it"
    (is (= "http://host:11434/v1"
           (:base-url (llm.provider/with-field-defaults "ollama" {:base-url "http://host:11434/v1///"}))))))

(deftest ollama-calls-the-address-it-was-given-test
  ;; Credentials go through `with-field-defaults` on every real path — `resolve-model-ref` for
  ;; requests, the provider API for connect — so these run through it too.
  (letfn [(url-of [raw-config] (:url (captured-request raw-config)))]
    (testing "Ollama Cloud is reached at its own address, like any other server"
      (is (= "https://ollama.com/v1/models" (url-of cloud-credentials))))
    (testing "a self-hosted connection goes exactly where it was told"
      (is (= (str base-url "/models") (url-of credentials))))
    (testing "a connection with no address throws rather than guessing at one"
      (let [e (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Ollama base URL is set"
                   (url-of {:api-key "proxy-key"})))]
        (testing "tagged so the admin API renders it under the field rather than as a 500"
          (is (= {:status-code 400 :field :base-url} (select-keys (ex-data e) [:status-code :field]))))))))

(deftest ollama-is-configurable-from-the-environment-test
  (is (= {:base-url "MB_LLM_OLLAMA_API_BASE_URL"
          :api-key  "MB_LLM_OLLAMA_API_KEY"}
         (llm.provider/connection-env-vars "ollama")))
  (letfn [(connection-config []
            (:config (first (llm.provider/connections))))
          (url-for [config]
            (let [called (atom nil)]
              (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                                         (reset! called (:url req))
                                                         {:status 200 :body {:data []}})]
                (ollama/list-models
                 {:credentials (llm.provider/with-field-defaults "ollama" config)}))
              @called))]
    (mt/with-temporary-setting-values [llm-providers []]
      (testing "a base URL alone synthesizes a connection and reaches that server"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-base-url base-url]
          (is (= {:base-url base-url} (connection-config)))
          (is (= (str base-url "/models") (url-for (connection-config))))))
      (testing "Cloud's address plus a key synthesizes a Cloud connection and reaches Cloud"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-base-url "https://ollama.com/v1"
                                      mb-llm-ollama-api-key      "sk-env"]
          (is (= {:base-url "https://ollama.com/v1" :api-key "sk-env"} (connection-config)))
          (is (= "https://ollama.com/v1/models" (url-for (connection-config))))))
      (testing "a key on its own brings no connection into existence: it has nowhere to be sent"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-key "sk-env"]
          (is (empty? (llm.provider/connections))))))))

(deftest ollama-takes-one-key-for-either-deployment-test
  (testing "it is the only secret the type stores"
    (is (= #{:api-key} (llm.provider/secret-field-keys "ollama"))))
  (testing "and it authenticates against Cloud and a self-hosted server alike, since both take the same Bearer header"
    (letfn [(bearer [creds] (get-in (captured-request creds) [:headers "Authorization"]))]
      (is (= "Bearer sk-cloud-key" (bearer cloud-credentials)))
      (is (= "Bearer proxy-key" (bearer keyed-credentials)))
      (testing "a plain self-hosted server takes no key, and must not get an empty header"
        (is (nil? (bearer credentials)))))))

(deftest ollama-has-no-model-allow-list-test
  (testing "`known-models` returns nil rather than throwing — the catalog is whatever is pulled"
    (is (nil? (self/known-models "ollama")))))
