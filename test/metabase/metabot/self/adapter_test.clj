(ns metabase.metabot.self.adapter-test
  (:require
   [clj-http.client :as http]
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
   [metabase.metabot.self.openai :as openai]
   [metabase.metabot.self.openrouter :as openrouter]
   [metabase.metabot.self.registry :as registry]
   [metabase.metabot.self.vllm :as vllm]
   [metabase.metabot.self.zai :as zai]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.malli.registry :as mr]))

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
   #'openai/provider     :metabot.openai/request
   #'openrouter/provider :metabot.openrouter/request
   #'vllm/provider       :metabot.vllm/request
   #'zai/provider        :metabot.zai/request})

(deftest ^:parallel span-name-test
  (testing "every adapter names its request span for its provider slug, with no per-adapter override"
    (doseq [[provider-var expected] expected-spans]
      (is (= expected (:span @provider-var))
          (str provider-var)))))

(def ^:private expected-fallback-messages
  "What each adapter renders for an HTTP status it has no specific message for.

  English only, and deliberately so: the fallback is one shared msgid with the provider name as a format
  argument, so a change to how the provider is named shows up here, but a change to the msgid itself does
  not — English output is identical either way. The msgid is guarded by review and by the extractor
  (`clojure -X:build i18n.enumerate/enumerate`), not by this test."
  {#'azure/provider      "Azure API error (HTTP 418)"
   #'bedrock/provider    "AWS Bedrock API error (HTTP 418)"
   #'claude/provider     "Anthropic API error (HTTP 418)"
   #'deepseek/provider   "DeepSeek API error (HTTP 418)"
   #'google/provider     "Google API error (HTTP 418)"
   #'mistral/provider    "Mistral API error (HTTP 418)"
   #'moonshot/provider   "Moonshot API error (HTTP 418)"
   #'openai/provider     "OpenAI API error (HTTP 418)"
   #'openrouter/provider "OpenRouter API error (HTTP 418)"
   #'vllm/provider       "vLLM API error (HTTP 418)"
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
