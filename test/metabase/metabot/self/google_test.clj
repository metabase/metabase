(ns metabase.metabot.self.google-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.core :as self.core]
   [metabase.metabot.self.debug :as debug]
   [metabase.metabot.self.google :as google]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; parts->gemini-contents tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel parts->gemini-contents-plain-text-test
  (testing "plain user and model text"
    (is (=? [{:role "user"  :parts [{:text "Hello"}]}
             {:role "model" :parts [{:text "Hi there!"}]}]
            (google/parts->gemini-contents
             [{:role :user :content "Hello"}
              {:type :text :text "Hi there!"}])))))

(deftest ^:parallel parts->gemini-contents-tool-call-test
  (testing "text + tool call become a single model message; tool call carries a thoughtSignature"
    (is (=? [{:role "model"
              :parts [{:text "Let me check..."}
                      {:functionCall    {:name "search"
                                         :args {:query "revenue"}
                                         :id   "call-1"}
                       :thoughtSignature string?}]}]
            (google/parts->gemini-contents
             [{:type :text :text "Let me check..."}
              {:type :tool-input :id "call-1" :function "search" :arguments {:query "revenue"}}])))))

(deftest ^:parallel parts->gemini-contents-tool-result-test
  (testing "tool output becomes a user role message with a functionResponse part"
    (is (=? [{:role  "user"
              :parts [{:functionResponse {:name     "search"
                                          :response {:content "Found 42 results"}
                                          :id       "call-1"}}]}]
            (google/parts->gemini-contents
             [{:type :tool-output :id "call-1" :function "search" :result {:output "Found 42 results"}}])))))

(deftest ^:parallel parts->gemini-contents-multiple-tool-results-test
  (testing "consecutive tool outputs merge into one user message with multiple parts"
    (is (=? [{:role  "user"
              :parts [{:functionResponse {:name "search" :response {:content "Result 1"}}}
                      {:functionResponse {:name "lookup" :response {:content "Result 2"}}}]}]
            (google/parts->gemini-contents
             [{:type :tool-output :id "call-1" :function "search" :result {:output "Result 1"}}
              {:type :tool-output :id "call-2" :function "lookup" :result {:output "Result 2"}}])))))

(deftest ^:parallel parts->gemini-contents-nil-arguments-test
  (testing "tool call with nil arguments uses {} (not nil)"
    (is (=? [{:role  "model"
              :parts [{:functionCall {:name "todo_read" :args {}}}]}]
            (google/parts->gemini-contents
             [{:type :tool-input :id "call-1" :function "todo_read" :arguments nil}])))))

(deftest ^:parallel parts->gemini-contents-full-conversation-test
  (testing "full round-trip with tool call and response"
    (is (=? [{:role "user"  :parts [{:text "What time is it in Kyiv?"}]}
             {:role "model" :parts [{:functionCall {:name "get-time"}}]}
             {:role "user"  :parts [{:functionResponse {:name "get-time"}}]}
             {:role "model" :parts [{:text "It's 2:00 PM in Kyiv."}]}]
            (google/parts->gemini-contents
             [{:role :user :content "What time is it in Kyiv?"}
              {:type :tool-input :id "call-1" :function "get-time" :arguments {:tz "Europe/Kyiv"}}
              {:type :tool-output :id "call-1" :function "get-time" :result {:output "2:00 PM"}}
              {:type :text :text "It's 2:00 PM in Kyiv."}])))))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool schema conversion
;;; ──────────────────────────────────────────────────────────────────

(deftest google-tool-schema-strips-additional-properties-test
  (testing "Gemini's OpenAPI subset rejects additionalProperties, so we strip it"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key "AIzaXXX"]
      (with-redefs [self.core/sse-reducible identity
                    debug/capture-stream    (fn [r _] r)
                    http/request            (fn [req] {:body req})]
        (let [{:keys [body]} (google/google-raw
                              {:input [{:role :user :content "hi"}]
                               :tools [{:tool-name "search"
                                        :doc       "Search for something."
                                        :schema    [:=> [:cat [:map {:closed true}
                                                               [:query :string]]] :any]
                                        :fn        (fn [_] nil)}]})
              parsed (json/decode+kw body)
              tool   (-> parsed :tools first :function_declarations first)]
          (is (= "search" (:name tool)))
          (is (not (contains? (:parameters tool) :additionalProperties))
              "Top-level parameters object must not include additionalProperties")
          (is (not (contains? (-> tool :parameters :properties :query)
                              :additionalProperties))
              "Nested property schemas must not include additionalProperties"))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Streaming chunk conversion tests
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel google-text-conv-test
  (testing "plain text chunks emit start/text/usage"
    (let [chunks [{:candidates [{:content {:parts [{:text "Hello "}]}}] :modelVersion "gemini-3.5-flash"}
                  {:candidates [{:content {:parts [{:text "world"}]} :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 5 :candidatesTokenCount 3}}]
          parts  (into [] (comp (google/google->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks)]
      (is (=? [{:type :start}
               {:type :text :text "Hello world"}
               {:type  :usage
                :usage {:promptTokens 5 :completionTokens 3}}]
              parts)))))

(deftest ^:parallel google-tool-call-conv-test
  (testing "functionCall part emits a tool-input"
    (let [chunks [{:candidates [{:content {:parts [{:functionCall {:name "get-time"
                                                                   :args {:tz "Europe/Kyiv"}}}]}
                                 :finishReason "STOP"}]
                   :usageMetadata {:promptTokenCount 10 :candidatesTokenCount 4}}]
          parts  (into [] (comp (google/google->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks)]
      (is (=? [{:type :start}
               {:type      :tool-input
                :function  "get-time"
                :arguments {:tz "Europe/Kyiv"}}
               {:type :usage}]
              parts)))))

(deftest ^:parallel google-safety-block-conv-test
  (testing "finishReason=SAFETY emits an error chunk after closing any open block"
    (let [chunks [{:candidates [{:content {:parts [{:text "Sure, "}]}}]}
                  {:candidates [{:content {:parts []} :finishReason "SAFETY"}]
                   :usageMetadata {:promptTokenCount 8 :candidatesTokenCount 1}}]
          parts  (into [] (comp (google/google->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks)]
      (is (=? [{:type :start}
               {:type :text :text "Sure, "}
               {:type :error :error {:message string? :error-code "google_safety_block"}}
               {:type :usage}]
              parts)))))

(deftest ^:parallel google-prompt-feedback-block-conv-test
  (testing "promptFeedback.blockReason also triggers an error chunk"
    (let [chunks [{:promptFeedback {:blockReason "SAFETY"}
                   :candidates     [{:content {:parts []} :finishReason "STOP"}]}]
          parts  (into [] (comp (google/google->aisdk-chunks-xf) (self.core/aisdk-xf)) chunks)]
      (is (some #(= (:type %) :error) parts)))))

;;; ──────────────────────────────────────────────────────────────────
;;; HTTP request shape
;;; ──────────────────────────────────────────────────────────────────

(deftest google-raw-request-shape-test
  (mt/with-temporary-setting-values [llm.settings/llm-google-api-key "AIzaXXX"]
    (with-redefs [self.core/sse-reducible identity
                  debug/capture-stream    (fn [r _] r)
                  http/request            (fn [req] {:body req})]
      (testing "URL uses streamGenerateContent with alt=sse"
        (is (=? {:method  :post
                 :url     "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent?alt=sse"
                 :headers {"x-goog-api-key" "AIzaXXX"
                           "Content-Type"   "application/json"}}
                (google/google-raw {:input [{:role :user :content "hi"}]}))))
      (testing "system is lifted to top-level systemInstruction"
        (let [{:keys [body]} (google/google-raw {:input [{:role :user :content "hi"}]
                                                 :system "You are helpful."})
              parsed (json/decode+kw body)]
          (is (= "You are helpful." (-> parsed :systemInstruction :parts first :text)))
          (is (= "hi" (-> parsed :contents first :parts first :text))))))))

(deftest google-raw-missing-key-test
  (mt/with-temporary-setting-values [llm.settings/llm-google-api-key nil
                                     llm.settings/llm-proxy-base-url nil]
    (is (thrown-with-msg?
         clojure.lang.ExceptionInfo
         #"No Google API key is set"
         (google/google-raw {:input [{:role :user :content "hi"}]})))))

(deftest google-raw-error-with-stream-body-test
  (testing "error responses whose :body is an InputStream are read exactly once"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key "AIzaXXX"]
      (let [body-json "{\"error\":{\"code\":400,\"message\":\"bad\",\"details\":[{\"reason\":\"API_KEY_INVALID\"}]}}"
            stream   (java.io.ByteArrayInputStream. (.getBytes ^String body-json "UTF-8"))]
        (with-redefs [self.core/sse-reducible identity
                      debug/capture-stream    (fn [r _] r)
                      http/request            (fn [_]
                                                (throw (ex-info "HTTP 400"
                                                                {:status 400 :body stream})))]
          (testing "400 + API_KEY_INVALID is promoted to a key error (status 401)"
            (is (thrown-with-msg?
                 clojure.lang.ExceptionInfo
                 #"Google API key is invalid"
                 (google/google-raw {:input [{:role :user :content "hi"}]})))))))))

(deftest google-raw-generic-error-test
  (testing "non-key 400 errors surface as a generic request error without re-reading the stream"
    (mt/with-temporary-setting-values [llm.settings/llm-google-api-key "AIzaXXX"]
      (let [body-json "{\"error\":{\"code\":400,\"message\":\"bad request\"}}"
            stream   (java.io.ByteArrayInputStream. (.getBytes ^String body-json "UTF-8"))]
        (with-redefs [self.core/sse-reducible identity
                      debug/capture-stream    (fn [r _] r)
                      http/request            (fn [_]
                                                (throw (ex-info "HTTP 400"
                                                                {:status 400 :body stream})))]
          (is (thrown-with-msg?
               clojure.lang.ExceptionInfo
               #"Google API rejected our request"
               (google/google-raw {:input [{:role :user :content "hi"}]}))))))))

(deftest google-raw-uses-ai-proxy-test
  (mt/with-premium-features #{:metabase-ai-managed}
    (mt/with-dynamic-fn-redefs [premium-features/premium-embedding-token (constantly "proxy-token")]
      (mt/with-temporary-setting-values [llm.settings/llm-google-api-key nil
                                         llm.settings/llm-proxy-base-url "https://proxy.example"]
        (with-redefs [self.core/sse-reducible identity
                      debug/capture-stream    (fn [r _] r)
                      http/request            (fn [req] {:body req})]
          (is (=? {:method  :post
                   :url     #"^https://proxy\.example/google/v1beta/models/.*"
                   :headers {"x-metabase-instance-token" "proxy-token"}}
                  (google/google-raw {:input     [{:role :user :content "hi"}]
                                      :ai-proxy? true}))))))))
