(ns metabase.metabot.self.ollama-test
  "Deliberately narrower than [[metabase.metabot.self.vllm-test]] — the two adapters share a
  transport, so what is covered here is what differs: the two deployments, the catalog shape Ollama
  returns, the absence of a context-window gate, and the diagnoses."
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
   [metabase.test :as mt]
   [metabase.util.json :as json])
  (:import
   (java.net SocketTimeoutException)))

(set! *warn-on-reflection* true)

;; not localhost: Metabase is a server, so a realistic self-hosted address is another host
(def ^:private base-url "http://ollama.internal:11434/v1")

(def ^:private credentials
  "A self-hosted connection. No API key: a self-hosted Ollama is unauthenticated, so this is the
  ordinary case rather than a degenerate one."
  {:hosting "self-hosted" :base-url base-url})

(def ^:private cloud-credentials
  "An Ollama Cloud connection: a key and no address, because Cloud's address is not configurable."
  {:hosting "cloud" :api-key "sk-cloud-key"})

(def ^:private keyed-credentials
  "A self-hosted Ollama behind a proxy that requires a key."
  (assoc credentials :api-key "proxy-key"))

(def ^:private reasoning-credentials
  "A connection whose connect-time probe found the pulled model streaming its reasoning."
  (assoc credentials ollama/reasoning-config-key "true"))

(defn- captured-request
  "Drive `list-models` against a stub and return the request it issued. Credentials go through
  `with-field-defaults` first, as every real caller does — a hand-built map could carry a `:hosting`
  value no caller can produce."
  [raw-config]
  (let [seen (atom nil)]
    (mt/with-dynamic-fn-redefs [http/request (fn [req]
                                               (reset! seen req)
                                               {:status 200 :body {:data []}})]
      (ollama/list-models {:credentials (llm.provider/with-field-defaults "ollama" raw-config)}))
    @seen))

;;; The shape Ollama's OpenAI-compatible `/v1/models` actually returns: no `max_model_len`, no
;;; `parent`, no `name`. Every field vLLM's adapter reads beyond `id` is absent here, which is why
;;; the context-window check has nothing to stand on.
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
    (is (= (llm.settings/llm-max-tokens)
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

(deftest ^:parallel request-body-raises-max-tokens-for-a-reasoning-connection-test
  (testing "a connection the probe found reasoning gets the larger floor — thinking, answer and tool
           call are billed against one budget"
    (is (= 16384
           (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                     :input       [{:role :user :content "hi"}]
                                                     :credentials reasoning-credentials
                                                     :max-tokens  128})))))
  (testing "and a model the probe found does not reason keeps the caller's value"
    (is (= 128
           (:max_tokens (ollama/ollama-request-body {:model       "good-model"
                                                     :input       [{:role :user :content "hi"}]
                                                     :credentials credentials
                                                     :max-tokens  128}))))))

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

(deftest ^:parallel request-body-replay-is-not-probe-gated-test
  (testing "replay does not wait on the probe"
    (doseq [[label creds] {"probed reasoning"     reasoning-credentials
                           "probed non-reasoning" credentials
                           "never probed"         nil}]
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
    (doseq [body [{:status "ok"} {:object "list"} "<html>404</html>"]]
      (testing (str "body " (pr-str body))
        (mt/with-dynamic-fn-redefs [http/request (fn [_] {:status 200 :body body})]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Ollama returned an unexpected model list response.*http://ollama\.internal:11434/v1"
               (ollama/list-models {:credentials credentials}))))))))

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
  "Stub `http/request` for the preflight path: `GET /models` returns `models`, and each
  `POST /chat/completions` returns whatever `choice-by-probe` holds for the probe it was sent, so the
  two probes can disagree."
  [models choice-by-probe]
  (fn [{:keys [url body]}]
    (if (re-find #"/models$" (str url))
      {:status 200 :body {:data models}}
      {:status 200 :body {:choices [(get choice-by-probe (probe-kind (json/decode+kw (str body))))]}})))

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
    (is (= {:models         [{:id "good-model" :display_name "good-model"}]
            :learned-config {ollama/reasoning-config-key "false"
                             :probed-model               "good-model"}}
           (probe! [{:id "good-model"}] tool-calling-message)))))

(deftest preflight-does-not-gate-on-a-context-window-test
  (testing "Ollama's catalog carries no `max_model_len`, so unlike vLLM nothing gates on the window
           at connect time — too small a window surfaces later as truncation"
    (is (= "good-model"
           (get-in (probe! [{:id "good-model" :max_model_len 4096}] tool-calling-message)
                   [:learned-config :probed-model])))))

(deftest preflight-records-a-reasoning-model-test
  (testing "reasoning is observable only from the probe, and drives which renderer the frontend picks"
    (is (= "true"
           (get-in (probe! [{:id "good-model"}] (assoc tool-calling-message :reasoning "thinking..."))
                   [:learned-config ollama/reasoning-config-key])))
    (testing "the deprecated spelling some builds still emit counts too"
      (is (= "true"
             (get-in (probe! [{:id "good-model"}]
                             (assoc tool-calling-message :reasoning_content "thinking..."))
                     [:learned-config ollama/reasoning-config-key]))))))

(deftest preflight-rejects-a-model-that-cannot-call-tools-test
  (testing "the fix is always a different model — Ollama drives tool calling from the model's own
           template, so there is no server flag to point the admin at"
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"answered with text instead of calling a tool.*supports tool calling"
         (probe! [{:id "chatty-model"}] {:content "Sure! The table is orders."})))))

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
                  http/request            (fn [_]
                                            (swap! calls inc)
                                            (let [[head & tail] @remaining]
                                              (reset! remaining (vec tail))
                                              {:body head}))]
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
                                  {:model       "good-model"
                                   :input       [{:role :user :content "hi"}]
                                   :credentials credentials})]
      (is (= 1 (:calls result)))
      (is (= ["hello"] (mapv :text (parts-of result :text)))))))

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

(deftest ollama-form-asks-which-deployment-test
  (testing "the two deployments need opposite things, so the admin says which they have rather than
           the form guessing"
    (let [fields   (:fields (llm.provider/provider-type "ollama"))
          by-key   (into {} (map (juxt :key identity)) fields)
          hosting  (:hosting by-key)
          base-url (:base-url by-key)]
      (testing "self-hosted is the default — this type exists because operators asked to run their own
               models, so defaulting to a paid service would invert the request"
        (is (= "self-hosted" (:default hosting)))
        (is (= ["self-hosted" "cloud"] (mapv :value (:options hosting)))))
      (testing "the address is asked for only when it is knowable — Cloud's is not configurable"
        (is (= {:field :hosting :value "self-hosted"} (:show-when base-url))))
      (testing "no default address: a self-hosted Ollama is wherever the operator put it, and on a
               real install localhost is the Metabase container rather than that host. The
               placeholder shows the shape without asserting an address."
        (is (nil? (:default base-url)))))))

(deftest ollama-requires-an-address-or-a-key-test
  (testing "`:required?` cannot say 'required in one mode' — validate-field! ignores :show-when — so
           the real rule lives in :required-any, as it does for Google's two auth methods"
    (testing "either deployment configured on its own is complete"
      (is (true? (llm.provider/credentials-complete? "ollama" {:hosting "cloud" :api-key "sk-x"})))
      (is (true? (llm.provider/credentials-complete? "ollama" {:hosting  "self-hosted"
                                                               :base-url base-url}))))
    (testing "and neither is not"
      (is (false? (llm.provider/credentials-complete? "ollama" {})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"ollama needs one of: API base URL or API key"
           (llm.provider/validate-config! "ollama" {:hosting "self-hosted"})))))
  (testing "a trailing slash still cannot double up when a path is joined onto it"
    (is (= "http://host:11434/v1"
           (:base-url (llm.provider/with-field-defaults "ollama" {:base-url "http://host:11434/v1///"}))))))

(deftest ollama-resolves-the-address-from-the-deployment-test
  ;; Credentials go through `with-field-defaults` on every real path — `resolve-model-ref` for
  ;; requests, the provider API for connect — so these run through it too. Testing the adapter with a
  ;; hand-built map would pass for a `:hosting` value no caller can actually produce.
  (letfn [(url-of [raw-config] (:url (captured-request raw-config)))]
    (testing "Cloud has one address, so it is not configurable and a stray stored base URL cannot
             override the deployment the admin chose"
      (is (= "https://ollama.com/v1/models" (url-of {:hosting "cloud" :api-key "sk-cloud-key"})))
      (is (= "https://ollama.com/v1/models"
             (url-of {:hosting "cloud" :base-url "http://leftover:11434/v1"}))))
    (testing "a self-hosted connection goes exactly where it was told"
      (is (= (str base-url "/models") (url-of {:hosting "self-hosted" :base-url base-url}))))
    (testing "a self-hosted connection with no address throws rather than falling through to Cloud,
             which would send an operator's data somewhere they did not choose"
      (let [e (is (thrown-with-msg?
                   clojure.lang.ExceptionInfo
                   #"No Ollama base URL is set"
                   (url-of {:hosting "self-hosted" :api-key "proxy-key"})))]
        (testing "tagged so the admin API renders it under the field rather than as a 500"
          (is (= {:status-code 400 :field :base-url} (select-keys (ex-data e) [:status-code :field]))))))
    (testing "an environment-configured connection names its deployment with MB_LLM_OLLAMA_HOSTING.
             Without it `:hosting` defaults to self-hosted, so a key on its own is an incomplete
             self-hosted connection rather than a silent Cloud one."
      (is (= "http://env:11434/v1/models" (url-of {:base-url "http://env:11434/v1"})))
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"No Ollama base URL is set"
           (url-of {:api-key "sk-x"}))))))

(deftest ollama-is-configurable-from-the-environment-test
  (testing "`:hosting` is not a credential, but it has to be settable or an env-configured Cloud
           connection could not say that is what it is"
    (is (= {:hosting  "MB_LLM_OLLAMA_HOSTING"
            :base-url "MB_LLM_OLLAMA_API_BASE_URL"
            :api-key  "MB_LLM_OLLAMA_API_KEY"}
           (llm.provider/connection-env-vars "ollama"))))
  ;; End to end through the real machinery — env var, setting, connection synthesis, field defaults,
  ;; adapter — because the seam being protected here spans all of it: an earlier cut of this provider
  ;; inferred the deployment from which fields were set, which `with-field-defaults` made unreachable,
  ;; and a unit test on the adapter alone did not notice.
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
      (testing "a base URL alone synthesizes a self-hosted connection and reaches that server"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-base-url base-url]
          (is (= {:base-url base-url} (connection-config)))
          (is (= (str base-url "/models") (url-for (connection-config))))))
      (testing "a key plus MB_LLM_OLLAMA_HOSTING=cloud synthesizes a Cloud connection and reaches Cloud"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-key "sk-env"
                                      mb-llm-ollama-hosting "cloud"]
          (is (= {:api-key "sk-env" :hosting "cloud"} (connection-config)))
          (is (= "https://ollama.com/v1/models" (url-for (connection-config))))))
      (testing "a key on its own is an incomplete self-hosted connection rather than a silent Cloud
               one — `:hosting` defaults to self-hosted, so the address has to be said out loud"
        (mt/with-temp-env-var-value! [mb-llm-ollama-api-key "sk-env"]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"No Ollama base URL is set"
               (url-for (connection-config)))))))))

(deftest ollama-takes-one-key-for-either-deployment-test
  (testing "one field shown in both modes: Cloud always needs a key and a self-hosted server needs
           one only behind a proxy, but the admin has already said which they have, so copy spelling
           out both cases would always be half noise"
    (let [api-key (->> (:fields (llm.provider/provider-type "ollama"))
                       (m/find-first (comp #{:api-key} :key)))]
      (is (nil? (:show-when api-key)))))
  (testing "it is the only secret the type stores"
    (is (= #{:api-key} (llm.provider/secret-field-keys "ollama"))))
  (testing "and it authenticates either deployment, since both take the same Bearer header"
    (letfn [(bearer [creds] (get-in (captured-request creds) [:headers "Authorization"]))]
      (is (= "Bearer sk-cloud-key" (bearer cloud-credentials)))
      (is (= "Bearer proxy-key" (bearer keyed-credentials)))
      (testing "a plain self-hosted server takes no key, and must not get an empty header"
        (is (nil? (bearer credentials)))))))
(deftest ollama-has-no-model-allow-list-test
  (testing "`known-models` returns nil rather than throwing — the catalog is whatever is pulled"
    (is (nil? (self/known-models "ollama")))))
