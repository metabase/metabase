(ns metabase.metabot.self.adapter-test
  (:require
   [clj-http.client :as http]
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
   [metabase.util.log.capture :as log.capture]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Request counts
;;; ──────────────────────────────────────────────────────────────────

;;; ──────────────────────────────────────────────────────────────────
;;; Descriptor
;;; ──────────────────────────────────────────────────────────────────

(def ^:private expected-spans
  "The request span each adapter's descriptor should carry, spelled out rather than recomputed from
  `:slug`, so that renaming a slug shows up here as a failing test rather than as silently renamed
  telemetry."
  {#'azure/provider      :metabot.azure/request
   #'bedrock/provider    :metabot.bedrock/request
   ;; Anthropic's span follows its slug, not the `claude` namespace the adapter lives in. It read
   ;; `:metabot.claude/request` until the `:span` override was dropped, while the debug capture and the
   ;; error translation had always tagged the same requests `anthropic`.
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

(defn- captured-counts!
  "Run a Claude request with HTTP and streaming stubbed out, and return the `:msg-count` / `:tool-count`
  [[adapter/stream!]] reported for it.

  Read back off the debug log rather than the span: `metabase.util.o11y/with-span` passes its map straight
  to clj-otel, which reads only `:name`/`:attributes`/`:parent`/… and silently drops everything else, so
  these counts never reach a span. That is true on master too and is not this namespace's to fix."
  [opts]
  (let [msgs (log.capture/with-log-messages-for-level [msgs [metabase.metabot.self.adapter :debug]]
               (streamed-request!
                #(claude/claude-raw (merge {:model       "claude-haiku-4-5"
                                            :credentials {:api-key  "sk-ant-test"
                                                          :base-url "https://api.anthropic.com"}}
                                           opts)))
               (msgs))]
    (some-> (m/find-first #(str/includes? (:message %) "Anthropic request") msgs)
            :message
            (->> (re-find #"\{:model .*?:msg-count (\d+), :tools (\d+)\}"))
            (->> (drop 1) (mapv parse-long))
            (->> (zipmap [:msg-count :tool-count])))))

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
    ;; Anthropic sends `display_name`; OpenRouter and Z.AI send `name`. The shared listing used to try
    ;; `:name` then `:display_name` for all three, which would have flipped Anthropic's preference the
    ;; day its catalog grew a `name` field.
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
