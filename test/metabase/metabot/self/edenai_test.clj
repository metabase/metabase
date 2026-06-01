(ns metabase.metabot.self.edenai-test
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.edenai :as edenai]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Error-message mapping
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel edenai-error-msg-test
  (let [error-msg @#'edenai/edenai-error-msg]
    (testing "maps known HTTP statuses to canonical Eden AI messages"
      (is (re-find #"(?i)eden ai api key.*invalid" (str (error-msg {:status 401}))))
      (is (re-find #"(?i)insufficient credits"     (str (error-msg {:status 402}))))
      (is (re-find #"(?i)insufficient permissions" (str (error-msg {:status 403}))))
      (is (re-find #"(?i)endpoint or model"        (str (error-msg {:status 404}))))
      (is (re-find #"(?i)rate limited"             (str (error-msg {:status 429}))))
      (is (re-find #"(?i)internal server error"    (str (error-msg {:status 500}))))
      (is (re-find #"(?i)upstream provider"        (str (error-msg {:status 502}))))
      (is (re-find #"(?i)service is unavailable"   (str (error-msg {:status 503})))))
    (testing "unknown status falls back to generic message containing the code"
      (is (re-find #"418" (str (error-msg {:status 418})))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Default settings
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel default-base-url-test
  (testing "Eden AI base URL defaults to the V3 OpenAI-compatible endpoint"
    (is (= "https://api.edenai.run/v3" (llm.settings/llm-edenai-api-base-url)))))

;;; ──────────────────────────────────────────────────────────────────
;;; Request construction
;;; ──────────────────────────────────────────────────────────────────

(deftest edenai-raw-request-shape-test
  (testing "edenai-raw issues a streaming POST to /chat/completions with bearer auth"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [http/request (fn [opts]
                                                 (reset! captured opts)
                                                 (throw (ex-info "stop" {::skip true :api-error true})))]
        (mt/with-temporary-setting-values [llm-edenai-api-key "edn-test-key-123"]
          (try
            (edenai/edenai-raw {:input  [{:role :user :content "hi"}]
                                :system "You are helpful."})
            (catch Exception e
              (when-not (::skip (ex-data e))
                (throw e))))))
      (let [opts @captured]
        (is (some? opts) "http/request should have been called")
        (is (= :post (:method opts)))
        (is (str/ends-with? (:url opts) "/chat/completions"))
        (is (= "Bearer edn-test-key-123"
               (get-in opts [:headers "Authorization"])))
        (let [body (json/decode+kw (:body opts))]
          (is (= "openai/gpt-4o-mini" (:model body))
              "default model should be set when not provided")
          (is (true? (:stream body)))
          (is (= [{:role "system"    :content "You are helpful."}
                  {:role "user"      :content "hi"}]
                 (:messages body))))))))

(deftest edenai-raw-honors-model-override-test
  (testing "explicit :model overrides the default"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [http/request (fn [opts]
                                                 (reset! captured opts)
                                                 (throw (ex-info "stop" {::skip true :api-error true})))]
        (mt/with-temporary-setting-values [llm-edenai-api-key "edn-test-key-123"]
          (try
            (edenai/edenai-raw {:model "anthropic/claude-3-5-sonnet-latest"
                                :input [{:role :user :content "hi"}]})
            (catch Exception e
              (when-not (::skip (ex-data e))
                (throw e))))))
      (is (= "anthropic/claude-3-5-sonnet-latest"
             (:model (json/decode+kw (:body @captured))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(deftest edenai-list-models-test
  (testing "list-models GETs /models with bearer auth and normalizes the payload"
    (let [captured (atom nil)]
      (with-redefs [http/request (fn [opts]
                                   (reset! captured opts)
                                   {:body {:data [{:id "openai/gpt-4o-mini" :name "GPT-4o mini"}
                                                  {:id "anthropic/claude-3-5-sonnet-latest"}
                                                  {:id "google/gemini-2.5-flash" :name "Gemini 2.5 Flash"}]}})]
        (mt/with-temporary-setting-values [llm-edenai-api-key "edn-test-key-123"]
          (let [result (edenai/list-models)
                opts   @captured]
            (testing "request shape"
              (is (= :get (:method opts)))
              (is (str/ends-with? (:url opts) "/models"))
              (is (= "Bearer edn-test-key-123" (get-in opts [:headers "Authorization"]))))
            (testing "models are sorted by id and display_name falls back to id"
              (is (= [{:id "anthropic/claude-3-5-sonnet-latest"
                       :display_name "anthropic/claude-3-5-sonnet-latest"}
                      {:id "google/gemini-2.5-flash" :display_name "Gemini 2.5 Flash"}
                      {:id "openai/gpt-4o-mini" :display_name "GPT-4o mini"}]
                     (:models result))))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Auth resolution (BYOK vs AI proxy)
;;; ──────────────────────────────────────────────────────────────────

(deftest edenai-auth-preferences-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-edenai-api-key "edn-byok-key"
                                         llm.settings/llm-proxy-base-url  "https://proxy.example"]
        (testing "Prefers BYOK over the AI proxy"
          (with-redefs [self.core/sse-reducible identity
                        debug/capture-stream    (fn [r _] r)
                        http/request            (fn [req] {:body req})]
            (is (=? {:method  :post
                     :url     "https://api.edenai.run/v3/chat/completions"
                     :headers {"Authorization" "Bearer edn-byok-key"}
                     :body    string?}
                    (edenai/edenai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Uses the AI proxy when explicitly requested"
          (mt/with-temporary-setting-values [llm.settings/llm-edenai-api-key nil]
            (with-redefs [self.core/sse-reducible identity
                          debug/capture-stream    (fn [r _] r)
                          http/request            (fn [req] {:body req})]
              (is (=? {:method  :post
                       :url     "https://proxy.example/edenai/chat/completions"
                       :headers {"x-metabase-instance-token" "proxy-token"}
                       :body    string?}
                      (edenai/edenai-raw {:input    [{:role :user :content "hi"}]
                                          :ai-proxy? true}))))))
        (testing "Does not fall back to the AI proxy when BYOK is missing"
          (mt/with-temporary-setting-values [llm.settings/llm-edenai-api-key nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Eden AI API key is set"
                 (edenai/edenai-raw {:input [{:role :user :content "hi"}]})))))
        (testing "Throws when neither BYOK nor proxy is configured"
          (mt/with-temporary-setting-values [llm.settings/llm-edenai-api-key nil
                                             llm.settings/llm-proxy-base-url  nil]
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"No Eden AI API key is set"
                 (edenai/edenai-raw {:input [{:role :user :content "hi"}]})))))))))
