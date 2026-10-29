(ns metabase.metabot.self.adapter-test
  (:require
   [clj-http.client :as http]
   [clj-http.conn-mgr :as conn]
   [clojure.edn :as edn]
   [clojure.string :as str]
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.metabot.self.adapter :as adapter]
   [metabase.metabot.self.azure :as azure]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.claude :as claude]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.deepseek :as deepseek]
   [metabase.metabot.self.google :as google]
   [metabase.metabot.self.mistral :as mistral]
   [metabase.metabot.self.moonshot :as moonshot]
   [metabase.metabot.self.ollama :as ollama]
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openai-compatible :as openai-compatible]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.registry :as registry]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.xai :as xai]
   [metabase.metabot.self.zai :as zai]
   [metabase.metabot.test-util :as mut]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.io ByteArrayInputStream Closeable InputStream IOException)))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Descriptor
;;; ──────────────────────────────────────────────────────────────────

(def ^:private expected-spans
  "The request span each adapter's descriptor should carry, spelled out rather than recomputed from
  `:slug`, so that renaming a slug shows up here as a failing test rather than as silently renamed
  telemetry."
  {#'azure/provider      :metabot.azure/request
   #'bedrock/provider    :metabot.bedrock/request
   ;; Anthropic's span follows its slug, not the `claude` namespace the adapter lives in — the same
   ;; `anthropic` the debug capture and the error translation tag these requests with.
   #'claude/provider     :metabot.anthropic/request
   #'deepseek/provider   :metabot.deepseek/request
   #'google/provider     :metabot.google/request
   #'mistral/provider    :metabot.mistral/request
   #'moonshot/provider   :metabot.moonshot/request
   #'ollama/provider     :metabot.ollama/request
   #'openai/provider     :metabot.openai/request
   #'openai-compatible/provider :metabot.openai-compatible/request
   #'openrouter/provider :metabot.openrouter/request
   #'vllm/provider       :metabot.vllm/request
   #'xai/provider        :metabot.xai/request
   #'zai/provider        :metabot.zai/request})

(deftest ^:parallel span-name-test
  (testing "every adapter names its request span for its provider slug, with no per-adapter override"
    (doseq [[provider-var expected] expected-spans]
      (is (= expected (:span @provider-var))
          (str provider-var)))))

(def ^:private expected-fallback-messages
  "What each adapter renders for an HTTP status it has no specific message for.

  English only. The pre-split adapters declare their own `:error-fallback` rather than sharing one parameterised
  msgid, so these strings keep the translations already shipped for them in `locales/*.po`; the msgids
  themselves are guarded by review and by the extractor (`clojure -X:build i18n.enumerate/enumerate`),
  not by this test, which only pins the rendered English."
  {#'azure/provider      "Azure API error (HTTP 418)"
   #'bedrock/provider    "AWS Bedrock API error (HTTP 418)"
   #'claude/provider     "Anthropic API error (HTTP 418)"
   #'deepseek/provider   "DeepSeek API error (HTTP 418)"
   #'google/provider     "Google API error (HTTP 418)"
   #'mistral/provider    "Mistral API error (HTTP 418)"
   #'moonshot/provider   "Moonshot API error (HTTP 418)"
   ;; the one adapter with no `:error-fallback` of its own: no shipped translation to keep, so it takes
   ;; the shared msgid, which renders identically
   #'ollama/provider     "Ollama API error (HTTP 418)"
   #'openai/provider     "OpenAI API error (HTTP 418)"
   #'openai-compatible/provider "OpenAI-compatible API error (HTTP 418)"
   #'openrouter/provider "OpenRouter API error (HTTP 418)"
   #'vllm/provider       "vLLM API error (HTTP 418)"
   #'xai/provider        "xAI API error (HTTP 418)"
   #'zai/provider        "Z.AI API error (HTTP 418)"})

(deftest ^:parallel error-message-test
  (testing "a status with no specific message falls back to naming the provider and the status"
    (doseq [[provider-var expected] expected-fallback-messages
            :let [render (:error-msg @provider-var)]]
      (is (= expected (render {:status 418}))
          (str provider-var))))
  (testing "a status the provider does have a message for gets that one instead"
    (is (= "Anthropic API key expired or invalid"
           ((:error-msg @#'claude/provider) {:status 401}))))
  (testing "a response with no status at all still renders"
    (is (= "Anthropic API error (HTTP 0)"
           ((:error-msg @#'claude/provider) {})))))

(def ^:private legacy-error-fallbacks
  "The adapters that declare their own `... API error (HTTP {0})` msgid as an `:error-fallback`. Most have
  translations of it in `locales/*.po` and keep it until the shared parameterised template is translated too —
  see [[metabase.metabot.self.adapter/provider]], which says the key exists for exactly that. xAI's has none
  yet; it is here because it already declares one.

  Enumerated rather than derived as \"everything except the new ones\": this set may only shrink, and an
  adapter added from here on uses the shared template, so it must not be enrolled by default."
  #{#'azure/provider #'bedrock/provider #'claude/provider #'deepseek/provider #'google/provider
    #'mistral/provider #'moonshot/provider #'openai/provider #'openrouter/provider #'vllm/provider
    #'xai/provider #'zai/provider})

(deftest every-descriptor-brings-its-own-translated-messages-test
  (testing "exactly the adapters in `legacy-error-fallbacks` declare their own msgid. The
            rendered English is identical either way, so `error-message-test` cannot tell the two apart —
            this can, in both directions: a legacy adapter may not silently lose its msgid, and a new one
            may not add another for translators"
    (is (= legacy-error-fallbacks
           (set (filter #(fn? (:error-fallback @%)) (keys expected-spans))))))
  (testing "the proxy refusal deliberately does not get the same treatment: it stays one shared msgid,
            because `:ai-proxy?` is only ever set for the managed connection, whose catalog names only
            Anthropic models — the one provider the proxy can serve — so the refusal is unreachable"
    (is (= "AI proxy is not supported for Z.AI"
           (try (adapter/reject-ai-proxy! @#'zai/provider true)
                (catch clojure.lang.ExceptionInfo e (ex-message e)))))))

(defn- pinned-slugs
  "The provider slugs a spelled-out table above covers."
  [table]
  (set (map (comp :slug deref) (keys table))))

(defn- adapter-slugs
  "Every provider the registry serves with an adapter of its own. The managed connection is served by the
  wire family its model names, so it has no descriptor to pin."
  []
  (disj (set (keys @#'registry/adapters)) "metabase"))

(deftest ^:parallel descriptor-tables-cover-every-adapter-test
  (testing "a new adapter cannot skip the span guard by being left out of the table"
    (is (= (adapter-slugs) (pinned-slugs expected-spans))))
  (testing "a new adapter cannot skip the error-message guard either"
    (is (= (adapter-slugs) (pinned-slugs expected-fallback-messages)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Request counts
;;; ──────────────────────────────────────────────────────────────────

(defn- tool [n]
  {:tool-name (str "tool-" n)
   :doc       "A tool."
   :schema    [:=> [:cat [:map {:closed true} [:x :string]]] :any]
   :fn        (fn [_] "ok")})

(defn- streamed-request!
  "Run `thunk` with streaming stubbed to the identity chain, so the adapter's `stream!` hands back the
  clj-http request map it would have sent."
  [thunk]
  (with-redefs [self.core/sse-reducible             identity
                self.core/reducible-with-api-errors (fn [r _ _] r)
                debug/capture-stream                (fn [r _] r)
                http/request                        (fn [req] {:body req})]
    (thunk)))

(defn- logged-span-data!
  "Run `thunk` with HTTP and streaming stubbed out, and return the data [[adapter/stream!]]'s `with-span`
  line logged for it, as a map.

  The log rather than the span: `u.o11y/with-span` renders its whole map into the line but hands only
  `:attributes` to clj-otel, so these keys reach the log and nothing else (BOT-2168). The line is
  `\"<span-name> (<ms>ms) <map>\"`, so the map is everything from the first brace on."
  [thunk]
  (let [messages (mt/with-log-messages-for-level [messages [metabase.metabot.self.adapter :info]]
                   (streamed-request! thunk)
                   (mapv :message (messages)))
        line     (m/find-first #(re-find #"^:metabot\.[a-z]+/request " %) messages)]
    (some-> line (subs (str/index-of line "{")) edn/read-string)))

(defn- request-log-data!
  "[[logged-span-data!]] for a Claude request."
  [opts]
  (logged-span-data!
   #(claude/claude-raw (merge {:model       "claude-haiku-4-5"
                               :credentials {:api-key  "sk-ant-test"
                                             :base-url "https://api.anthropic.com"}}
                              opts))))

(defn- captured-counts!
  "The `:msg-count` / `:tool-count` [[adapter/stream!]] reported for `opts`."
  [opts]
  (select-keys (request-log-data! opts) [:msg-count :tool-count]))

(deftest request-shape-reaches-the-log-test
  (testing "the model and the counts stay flat keys, which is what `with-span` renders into its line;
            nesting them under `:attributes` would reach the trace but bury them in the log"
    (is (= {:model "claude-haiku-4-5" :msg-count 1 :tool-count 0}
           (-> (request-log-data! {:input [{:role :user :content "hi"}]})
               (select-keys [:model :msg-count :tool-count]))))))

(deftest span-attrs-values-are-strings-test
  (testing "`:family` is stringified at the call site, like every other keyword-valued attribute in the
            codebase (`(name driver)`, `(name context)`, ...). A bare keyword renders `:anthropic` in the
            log, and once BOT-2168 hands this map to clj-otel it would export as \":anthropic\" — clj-otel
            `str`s attribute values, so the colon would survive into the trace"
    (doseq [[model expected] [["anthropic/my-deployment" "anthropic"]
                              ["openai/my-deployment"    "openai"]]]
      (testing model
        (is (= expected
               (:family (logged-span-data!
                         #(azure/azure-raw {:model       model
                                            :input       [{:role :user :content "hi"}]
                                            :credentials {:api-key  "az-test"
                                                          :base-url "https://r.services.ai.azure.com"}})))))))))

(deftest counts-describe-the-callers-request-test
  (testing "tool-count is the tools the caller offered, not the tools that reach the wire"
    ;; a structured-output request replaces the whole tool array with one synthetic `structured_output`
    ;; tool, so counting the composed body reported 1 however many tools the caller passed
    (is (= {:msg-count 1 :tool-count 15}
           (captured-counts! {:input  [{:role :user :content "hi"}]
                              :tools  (mapv tool (range 15))
                              :schema {:type "object" :properties {}}}))))
  (testing "msg-count is the caller's AISDK parts, not the messages the dialect merged them into"
    ;; `parts->claude-messages` collapses consecutive assistant parts into one wire message
    (is (= {:msg-count 3 :tool-count 0}
           (captured-counts! {:input [{:role :user :content "hi"}
                                      {:type :text :text "one"}
                                      {:type :text :text "two"}]})))))

(deftest bearer-auth-under-the-proxy-conforms-to-the-auth-schema-test
  (testing "`bearer-auth` carries a `:- Auth` return schema, and `resolve-auth` adds `:network-policy-floor`
            when the proxy URL comes from the environment. `Auth` is closed, so an undeclared floor would
            fail output validation the first time a `bearer-auth` provider supported the proxy — which no
            provider does today, so nothing else exercises this"
    (mt/with-premium-features #{:metabot-v3}
      (mt/with-temp-env-var-value! [mb-llm-proxy-base-url "http://proxy.internal/"]
        (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
          (let [proxyable (adapter/provider {:slug "deepseek" :display-name "DeepSeek" :supports-ai-proxy? true})
                auth      (adapter/bearer-auth proxyable {:method :get :path "/models" :ai-proxy? true})]
            (is (= :allow-private (:network-policy-floor auth)))
            (is (nil? (mr/explain adapter/Auth auth)))))))))

(deftest ^:parallel credentials-accept-mini-model-metadata-test
  (doseq [credentials [{:api-key "test-key" :base-url "https://api.anthropic.com"}
                       {:api-key "test-key" :model-family "openai" :deployment-name "parakeet"}
                       {:region "us-east-1" :model-id "anthropic.claude-sonnet-4-6"}
                       {:project-id "parakeet-project" :location "us-central1"}]]
    (testing (str "Credential fields: " (keys credentials))
      (is (nil? (mr/explain self.core/LLMCredentials credentials)))
      (doseq [mini-model [nil "parakeet-mini"]]
        (is (nil? (mr/explain self.core/LLMCredentials (assoc credentials :mini-model mini-model)))))
      (is (some? (mr/explain self.core/LLMCredentials (assoc credentials :mini-model 42))))
      (is (some? (mr/explain self.core/LLMCredentials
                             (assoc credentials :mini-model "parakeet-mini" :unexpected-field "value")))))))

(deftest ^:parallel reasoning-capability-accepts-mini-model-metadata-test
  (is (true? (claude/streams-reasoning? {:connection-key "anthropic"
                                         :type           "anthropic"
                                         :model          "claude-sonnet-4-6"
                                         :credentials    {:api-key    "test-key"
                                                          :base-url   "https://api.anthropic.com"
                                                          :mini-model "claude-haiku-4-5-20251001"}
                                         :ai-proxy?      false}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Descriptor headers
;;; ──────────────────────────────────────────────────────────────────

(deftest descriptor-headers-reach-the-stream-test
  (testing "a provider's `:headers` are on its streaming request — the only thing that puts them there"
    (testing "Anthropic's API version"
      (is (=? {:method  :post
               :url     "https://api.anthropic.com/v1/messages"
               :headers {"anthropic-version" "2023-06-01"
                         "Content-Type"      "application/json"}}
              (streamed-request!
               #(claude/claude-raw {:model       "claude-haiku-4-5"
                                    :input       [{:role :user :content "hi"}]
                                    :credentials {:api-key  "sk-ant-test"
                                                  :base-url "https://api.anthropic.com"}})))))
    (testing "OpenRouter's attribution headers, which its account activity page reads"
      (is (=? {:method  :post
               :url     "https://openrouter.ai/api/v1/chat/completions"
               :headers {"HTTP-Referer" "https://metabase.com"
                         "X-Title"      "Metabase"
                         "Content-Type" "application/json"}}
              (streamed-request!
               #(openrouter/openrouter-raw {:model       "anthropic/claude-haiku-4.5"
                                            :input       [{:role :user :content "hi"}]
                                            :credentials {:api-key  "sk-or-test"
                                                          :base-url "https://openrouter.ai/api"}})))))))

(deftest descriptor-headers-merge-with-per-request-headers-test
  (testing "a per-request header joins the descriptor's rather than replacing them"
    ;; Claude's fast mode adds `anthropic-beta`; dropping `anthropic-version` alongside it would 400
    (is (=? {:headers {"anthropic-version" "2023-06-01"
                       "anthropic-beta"    string?}}
            (streamed-request!
             #(claude/claude-raw {:model       "claude-opus-4-8"
                                  :input       [{:role :user :content "hi"}]
                                  :fast?       true
                                  :credentials {:api-key  "sk-ant-test"
                                                :base-url "https://api.anthropic.com"}}))))))

(deftest request-defaults-to-json-for-a-body-test
  (let [seen (atom nil)
        p    (adapter/provider {:slug "deepseek" :display-name "DeepSeek"})
        call (fn [req]
               (with-redefs [http/request (fn [r] (reset! seen r) {:status 200 :body {}})]
                 (adapter/request! p (merge {:credentials {:api-key  "sk-test"
                                                           :base-url "https://api.deepseek.test"}}
                                            req))))]
    (testing "a request with a body is JSON, so no call site has to say so — every body any adapter
              sends is JSON, and Bedrock's signing assumes it"
      (call {:method :post :path "/v1/messages" :body "{}"})
      (is (= "application/json" (get (:headers @seen) "Content-Type"))))
    (testing "a bodyless GET sends none: a provider's model listing has nothing to describe"
      (call {:method :get :path "/models"})
      (is (not (contains? (:headers @seen) "Content-Type"))))
    (testing "and a call site can still override it"
      (call {:method :post :path "/v1/messages" :body "{}"
             :headers {"Content-Type" "application/x-ndjson"}})
      (is (= "application/x-ndjson" (get (:headers @seen) "Content-Type"))))))

(deftest descriptor-headers-reach-the-catalog-test
  (testing "a provider's `:headers` are on its catalog request too, not just its stream"
    (let [seen (atom nil)]
      (with-redefs [http/request (fn [req]
                                   (reset! seen req)
                                   {:status 200 :body {:data []}})]
        (claude/list-models {:credentials {:api-key "sk-ant-test" :base-url "https://api.anthropic.com"}}))
      (is (=? {:method  :get
               :url     "https://api.anthropic.com/v1/models"
               :headers {"anthropic-version" "2023-06-01"}}
              @seen)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Listing
;;; ──────────────────────────────────────────────────────────────────

(def ^:private allow-list
  {"b-model" {:display-name "Allow-list B"}
   "a-model" {:display-name "Allow-list A"}})

(deftest listing-test
  (let [entries [{:id "b-model" :name "Catalog B name" :display_name "Catalog B display_name"}
                 {:id "a-model" :name "Catalog A name" :display_name "Catalog A display_name"}
                 {:id "unlisted" :name "Catalog U"}]]
    (testing "keeps only allow-listed ids, sorted by id"
      (is (= ["a-model" "b-model"]
             (mapv :id (:models (adapter/model-listing allow-list entries))))))
    (testing "with no catalog-name-key the allow-list names win, so a catalog that starts carrying names cannot rename a model"
      (is (= ["Allow-list A" "Allow-list B"]
             (mapv :display_name (:models (adapter/model-listing allow-list entries))))))
    (testing "a provider reads exactly the field it names, and is unaffected by the other being present"
      (is (= ["Catalog A name" "Catalog B name"]
             (mapv :display_name (:models (adapter/model-listing allow-list entries :name)))))
      (is (= ["Catalog A display_name" "Catalog B display_name"]
             (mapv :display_name (:models (adapter/model-listing allow-list entries :display_name))))))
    (testing "an entry missing that field falls back to the allow-list rather than the other field"
      (is (= ["Allow-list A"]
             (mapv :display_name
                   (:models (adapter/model-listing allow-list
                                                   [{:id "a-model" :display_name "Catalog A display_name"}]
                                                   :name))))))))

(deftest catalog-name-key-matches-each-providers-catalog-test
  (testing "each provider reads the field its own catalog documents"
    ;; Anthropic sends `display_name`; OpenRouter and Z.AI send `name`. Guessing between them rather
    ;; than letting each provider name its own field would flip Anthropic's preference the day its
    ;; catalog grows a `name` field.
    (let [names (fn [list-models-fn body]
                  (with-redefs [http/request (fn [_] {:status 200 :body body})]
                    (mapv :display_name (:models (list-models-fn {:credentials {:api-key "k" :base-url "https://x"}})))))]
      (is (= ["From display_name"]
             (names claude/list-models
                    {:data [{:id "claude-sonnet-5" :name "From name" :display_name "From display_name"}]})))
      (is (= ["From name"]
             (names openrouter/list-models
                    {:data [{:id "anthropic/claude-sonnet-4.5" :name "From name" :display_name "From display_name"}]})))
      (is (= ["From name"]
             (names zai/list-models
                    {:data [{:id "glm-5.2" :name "From name" :display_name "From display_name"}]}))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Upstream connection on close
;;;
;;; A close of a clj-http `:as :stream` body reads the rest of a chunked body before it returns, so the
;;; provider continues to generate: https://github.com/dakrone/clj-http/issues/627. These tests check that a
;;; stream from [[adapter/stream!]] drops the connection when its body closes.
;;; ──────────────────────────────────────────────────────────────────

(defn- timed-reduce
  "Call `thunk`. Return its `:result`, the exception it threw as `:thrown`, and the `:elapsed-ms`."
  [thunk]
  (let [start           (System/nanoTime)
        [result thrown] (try
                          [(thunk) nil]
                          (catch Throwable e
                            [nil e]))]
    {:result     result
     :thrown     thrown
     :elapsed-ms (quot (- (System/nanoTime) start) 1000000)}))

(defn- with-chunked-server!
  "Call `(f srv)` with a fresh [[mut/start-chunked-sse-server!]] made from `opts`, with localhost allowed. Stop the
  server after."
  [opts f]
  (let [srv (mut/start-chunked-sse-server! opts)]
    (try
      (mt/with-temp-env-var-value! [mb-llm-allowed-networks "allow-all"]
        (f srv))
      (finally
        ((:stop! srv))))))

(defn- server-request-opts
  [srv]
  {:model       "fake-model"
   :input       [{:role :user :content "hi"}]
   :credentials {:api-key "sk-or-test" :base-url (:url srv)}})

(defn- openrouter-stream
  [srv]
  (openrouter/openrouter-raw (server-request-opts srv)))

(defn- take-events
  "A reducing fn that collects events, and stops after `n`."
  [n]
  (fn [acc event]
    (let [acc (conj acc event)]
      (if (= n (count acc))
        (reduced acc)
        acc))))

(defn- disconnected-count
  "The events the server sent before it saw the disconnect, or nil if it saw none within 2 s."
  [srv]
  (deref (:disconnected srv) 2000 nil))

(defn- dropped-early?
  "True when the server saw the disconnect after fewer than `n` events."
  [srv n]
  (< (or (disconnected-count srv) ##Inf) n))

(defn- cause-chain
  [e]
  (take-while some? (iterate ex-cause e)))

(deftest stream-close-drops-upstream-connection-test
  (testing "a reduction that stops early drops the upstream connection, and does not read the rest of the body"
    (with-chunked-server! {:total 2000 :interval-ms 10}
      (fn [srv]
        (let [{:keys [result thrown elapsed-ms]} (timed-reduce #(reduce (take-events 3) [] (openrouter-stream srv)))]
          (is (nil? thrown))
          (is (= 3 (count result)))
          (is (< elapsed-ms 2000))
          (is (dropped-early? srv 100)))))))

(deftest stream-done-before-eof-drops-upstream-connection-test
  (testing "a stream that ends at `[DONE]` drops the connection, also when the server sends more bytes after it"
    (with-chunked-server! {:total 3 :after :keep-alive}
      (fn [srv]
        (let [{:keys [result thrown elapsed-ms]} (timed-reduce #(reduce conj [] (openrouter-stream srv)))]
          (is (nil? thrown))
          (is (= 3 (count result)))
          (is (< elapsed-ms 2000))
          (is (some? (disconnected-count srv))))))))

(deftest stream-gzip-close-drops-upstream-connection-test
  (testing "a gzip body, which clj-http decompresses, also drops the connection when it closes"
    (with-chunked-server! {:total 2000 :interval-ms 10 :gzip? true}
      (fn [srv]
        (let [{:keys [result thrown elapsed-ms]} (timed-reduce #(reduce (take-events 3) [] (openrouter-stream srv)))]
          (is (nil? thrown))
          (is (= 3 (count result)))
          (is (< elapsed-ms 2000))
          (is (dropped-early? srv 100)))))))

(defn- read-one-buffer
  "A `:read-stream` like Bedrock's `runtime-events`: its reduction opens `body` with `with-open`, reads one buffer
  and returns `init`."
  [^InputStream body]
  (reify clojure.lang.IReduceInit
    (reduce [_ _rf init]
      (with-open [in body]
        (.read in (byte-array 8192))
        init))))

(deftest stream-custom-read-stream-drops-upstream-connection-test
  (testing "a `:read-stream` that is not SSE, and closes the body itself, also drops the connection"
    (with-chunked-server! {:total 2000 :interval-ms 10}
      (fn [srv]
        (let [{:keys [thrown elapsed-ms]} (timed-reduce
                                           #(reduce conj []
                                                    (adapter/stream! @#'openrouter/provider
                                                                     (server-request-opts srv)
                                                                     {:path        "/v1/chat/completions"
                                                                      :body        {}
                                                                      :read-stream read-one-buffer})))]
          (is (nil? thrown))
          (is (< elapsed-ms 2000))
          (is (dropped-early? srv 100)))))))

(defn- recording-body
  "An `InputStream` over `text` that adds `:body` to `log` when it closes, and then throws `close-ex` if given."
  ^InputStream [log ^String text close-ex]
  (proxy [ByteArrayInputStream] [(.getBytes text "UTF-8")]
    (close []
      (swap! log conj :body)
      (when close-ex
        (throw close-ex)))))

(defn- recording-client
  "A `Closeable` that adds `:client` to `log` when it closes."
  [log]
  (reify Closeable
    (close [_]
      (swap! log conj :client))))

(def ^:private stub-sse
  "data: {\"n\":1}\n\ndata: {\"n\":2}\n\ndata: [DONE]\n\n")

(def ^:private stub-request-opts
  {:model       "fake-model"
   :input       [{:role :user :content "hi"}]
   :credentials {:api-key "sk-or-test" :base-url "https://openrouter.ai/api"}})

(defn- stub-stream!
  "Reduce [[adapter/stream!]] to the end, with `http/request` stubbed to return `response`. `stream-opts` merge
  into the minimal stream opts."
  [response stream-opts]
  (with-redefs [http/request (fn [_] (assoc response :status 200))]
    (timed-reduce #(reduce conj []
                           (adapter/stream! @#'openrouter/provider
                                            stub-request-opts
                                            (merge {:path "/v1/chat/completions" :body {}} stream-opts))))))

(defn- recorded-close-stream!
  "[[stub-stream!]] over a recording body that throws `close-ex` on close, with a recording client. Adds the
  close log to the result as `:closed`."
  [close-ex stream-opts]
  (let [log (atom [])]
    (assoc (stub-stream! {:body        (recording-body log stub-sse close-ex)
                          :http-client (recording-client log)}
                         stream-opts)
           :closed @log)))

(deftest stream-close-order-test
  (testing "the client closes before the body, so the body close does not read the rest of the stream"
    (let [{:keys [result thrown closed]} (recorded-close-stream! nil nil)]
      (is (nil? thrown))
      (is (= [{:n 1} {:n 2}] result))
      (is (= [:client :body] closed)))))

(deftest stream-close-ignores-released-connection-error-test
  (testing "the error that the body close throws after the client closes is ignored"
    (testing "IllegalStateException"
      (let [{:keys [result thrown]} (recorded-close-stream!
                                     (IllegalStateException. "Connection not obtained from this manager")
                                     nil)]
        (is (nil? thrown))
        (is (= [{:n 1} {:n 2}] result))))
    (testing "IOException"
      (let [{:keys [result thrown]} (recorded-close-stream! (IOException. "Socket closed") nil)]
        (is (nil? thrown))
        (is (= [{:n 1} {:n 2}] result))))))

(deftest stream-close-keeps-other-close-errors-test
  (testing "any other error from the body close reaches the caller as a provider error"
    (let [boom             (RuntimeException. "boom")
          {:keys [thrown]} (recorded-close-stream! boom nil)]
      (is (= :provider-request-failed (:error-code (ex-data thrown))))
      (is (identical? boom (ex-cause thrown))))))

(deftest stream-rf-exception-survives-close-test
  (testing "an exception from `rf` reaches the caller; the close error does not replace it"
    (with-chunked-server! {:total 300 :interval-ms 10}
      (fn [srv]
        (let [rf                          (fn [acc event]
                                            (when (= 1 (count acc))
                                              (throw (ex-info "boom" {::boom true})))
                                            (conj acc event))
              {:keys [thrown elapsed-ms]} (timed-reduce #(reduce rf [] (openrouter-stream srv)))
              chain                       (cause-chain thrown)]
          (is (some (comp ::boom ex-data) chain))
          (is (not-any? #(instance? IllegalStateException %) chain))
          (is (< elapsed-ms 2000))
          (is (dropped-early? srv 100)))))))

(deftest stream-normal-finish-raises-no-error-test
  (testing "a stream that reads to its end gives every event, no exception and no warning"
    (doseq [after [:done :eof]]
      (testing after
        (with-chunked-server! {:total 5 :after after}
          (fn [srv]
            (mt/with-log-messages-for-level [messages [metabase.metabot.self :warn]]
              (let [{:keys [result thrown]} (timed-reduce #(reduce conj [] (openrouter-stream srv)))]
                (is (nil? thrown))
                (is (= 5 (count result)))
                (is (empty? (messages)))))))))))

(deftest stream-close-error-logged-at-debug-test
  (testing "a stream that ends at `[DONE]` logs the ignored body-close error at debug level"
    (with-chunked-server! {:total 5 :after :done}
      (fn [srv]
        (mt/with-log-messages-for-level [messages [metabase.metabot.self.core :debug]]
          (let [{:keys [thrown]} (timed-reduce #(reduce conj [] (openrouter-stream srv)))]
            (is (nil? thrown))
            (is (=? [{:level   :debug
                      :message "Ignored the error from the body close after the client close"}]
                    (messages)))))))))

(deftest stream-keeps-shared-client-test
  (testing "a client that can serve other requests stays open; only the body closes"
    (let [cm (conn/make-reusable-conn-manager {})]
      (try
        (testing "a bound connection manager"
          (binding [conn/*connection-manager* cm]
            (is (= [:body] (:closed (recorded-close-stream! nil nil))))))
        (testing "a connection manager in the request options"
          (is (= [:body] (:closed (recorded-close-stream! nil {:request-options {:connection-manager cm}})))))
        (testing "an http client in the request options"
          (is (= [:body] (:closed (recorded-close-stream! nil {:request-options {:http-client (recording-client (atom []))}})))))
        (finally
          (conn/shutdown-manager cm))))))

(deftest stream-passes-through-stub-bodies-test
  (testing "a response the helper cannot abort reaches `read-stream` as the identical body"
    (doseq [[label response] [["a map body"                    {:body {:a 1}}]
                              ["a stream with no client"       {:body (ByteArrayInputStream. (byte-array 0))}]
                              ["a client that is not Closeable" {:body        (ByteArrayInputStream. (byte-array 0))
                                                                 :http-client (Object.)}]]]
      (testing label
        (let [seen (atom nil)]
          (stub-stream! response {:read-stream (fn [body] (reset! seen body) [])})
          (is (identical? (:body response) @seen)))))))
