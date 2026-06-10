(ns metabase.metabot.self.bedrock-test
  "Unit tests for the bedrock-mantle adapter. Network is stubbed at the
  `clj-http.client/request` layer; live end-to-end coverage lives in
  `local/src/bedrock_e2e.clj`."
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.metabot.self.bedrock :as bedrock]
   [metabase.metabot.self.core :as self.core]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; SigV4 signing
;;; ──────────────────────────────────────────────────────────────────

(deftest ^:parallel sigv4-headers-golden-test
  (testing "the SigV4 signature is deterministic for fixed inputs"
    (let [hdrs (bedrock/sigv4-headers
                {:access-key-id     "AKIDEXAMPLE"
                 :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                 :region            "us-east-1"
                 :service           "bedrock"
                 :method            "GET"
                 :host              "bedrock-mantle.us-east-1.api.aws"
                 :path              "/v1/models"
                 :body-bytes        nil
                 :datetime          "20260101T000000Z"})]
      (is (= "20260101T000000Z" (get hdrs "x-amz-date")))
      (is (= (str "AWS4-HMAC-SHA256 "
                  "Credential=AKIDEXAMPLE/20260101/us-east-1/bedrock/aws4_request, "
                  "SignedHeaders=content-type;host;x-amz-date, "
                  "Signature=0dd2307d57f5983be1e09edbf1560e523425407f7a5195d2ff0546a8a1e920be")
             (get hdrs "authorization")))
      (is (not (contains? hdrs "x-amz-security-token"))))))

(deftest ^:parallel sigv4-headers-body-affects-signature-test
  (testing "the request body is part of the signed payload"
    (let [base {:access-key-id     "AKIDEXAMPLE"
                :secret-access-key "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY"
                :region            "us-east-1"
                :service           "bedrock"
                :method            "POST"
                :host              "bedrock-mantle.us-east-1.api.aws"
                :path              "/anthropic/v1/messages"
                :datetime          "20260101T000000Z"}
          sig  (fn [body] (get (bedrock/sigv4-headers (assoc base :body-bytes body)) "authorization"))]
      (is (not= (sig (.getBytes "{\"a\":1}" "UTF-8"))
                (sig (.getBytes "{\"a\":2}" "UTF-8")))))))

(deftest ^:parallel sigv4-headers-session-token-test
  (testing "a session token is surfaced as a signed x-amz-security-token header"
    (let [hdrs (bedrock/sigv4-headers
                {:access-key-id     "AKID"
                 :secret-access-key "secret"
                 :region            "us-east-2"
                 :session-token     "tok-123"
                 :service           "bedrock"
                 :method            "POST"
                 :host              "bedrock-mantle.us-east-2.api.aws"
                 :path              "/openai/v1/responses"
                 :body-bytes        (.getBytes "{}" "UTF-8")
                 :datetime          "20260101T000000Z"})]
      (is (= "tok-123" (get hdrs "x-amz-security-token")))
      (is (re-find #"SignedHeaders=content-type;host;x-amz-date;x-amz-security-token"
                   (get hdrs "authorization"))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Model listing
;;; ──────────────────────────────────────────────────────────────────

(def ^:private fake-catalog
  {:body {:data [{:id "anthropic.claude-haiku-4-5"}
                 {:id "anthropic.claude-opus-4-8"}
                 {:id "openai.gpt-5.5"}
                 {:id "openai.gpt-oss-120b"}
                 {:id "deepseek.v3.1"}
                 {:id "mistral.mistral-large-3"}]}})

(def ^:private creds-opts
  {:access-key-id "AKID" :secret-access-key "secret" :region "us-east-1"})

(deftest list-all-models-test
  (testing "list-all-models returns the full bedrock-mantle catalog"
    (with-redefs [http/request (constantly fake-catalog)]
      (is (= #{"anthropic.claude-haiku-4-5" "anthropic.claude-opus-4-8"
               "openai.gpt-5.5" "openai.gpt-oss-120b"
               "deepseek.v3.1" "mistral.mistral-large-3"}
             (set (map :id (:models (bedrock/list-all-models creds-opts)))))))))

(deftest list-models-filters-to-supported-families-test
  (testing "list-models keeps only the anthropic.* and openai.* families, in catalog order"
    (with-redefs [http/request (constantly fake-catalog)]
      (is (= ["anthropic.claude-haiku-4-5" "anthropic.claude-opus-4-8"
              "openai.gpt-5.5" "openai.gpt-oss-120b"]
             (map :id (:models (bedrock/list-models creds-opts))))))))

(deftest list-models-display-name-mirrors-id-test
  (testing "display_name mirrors the model id"
    (with-redefs [http/request (constantly fake-catalog)]
      (is (every? #(= (:id %) (:display_name %))
                  (:models (bedrock/list-models creds-opts)))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Request dispatch + wire-format normalization
;;; ──────────────────────────────────────────────────────────────────

(defn- capture-bedrock-request!
  "Invoke `bedrock-raw` with stubbed HTTP, returning the captured clj-http request
  map with its byte `:body` decoded back into a Clojure map."
  [opts]
  (let [captured (atom nil)]
    (with-redefs [self.core/sse-reducible identity
                  http/request           (fn [req]
                                           (reset! captured
                                                   (cond-> req
                                                     (:body req)
                                                     (assoc :body (json/decode+kw
                                                                   (String. ^bytes (:body req) "UTF-8")))))
                                           {:body req})]
      (bedrock/bedrock-raw (merge creds-opts opts)))
    @captured))

(deftest bedrock-anthropic-dispatch-test
  (let [req (capture-bedrock-request! {:model      "anthropic.claude-haiku-4-5"
                                       :region     "us-east-1"
                                       :input      [{:role :user :content "hi"}]
                                       :max-tokens 64})]
    (testing "anthropic.* routes to the Anthropic Messages API"
      (is (= :post (:method req)))
      (is (= "https://bedrock-mantle.us-east-1.api.aws/anthropic/v1/messages" (:url req)))
      (is (= "2023-06-01" (get-in req [:headers "anthropic-version"]))))
    (testing "the body is the Messages wire format carrying the full model id"
      (is (= "anthropic.claude-haiku-4-5" (-> req :body :model)))
      (is (contains? (:body req) :messages)))
    (testing "the non-standard top-level cache_control is stripped for the mantle surface"
      (is (not (contains? (:body req) :cache_control))))))

(deftest bedrock-openai-dispatch-test
  (let [req (capture-bedrock-request! {:model      "openai.gpt-5.5"
                                       :region     "us-east-2"
                                       :input      [{:role :user :content "hi"}]
                                       :max-tokens 4000})]
    (testing "openai.* routes to the OpenAI Responses API"
      (is (= :post (:method req)))
      (is (= "https://bedrock-mantle.us-east-2.api.aws/openai/v1/responses" (:url req)))
      (is (nil? (get-in req [:headers "anthropic-version"]))))
    (testing "the body is the Responses wire format carrying the full model id"
      (is (= "openai.gpt-5.5" (-> req :body :model)))
      (is (contains? (:body req) :input)))))

(deftest bedrock-openai-max-output-tokens-test
  (testing "max-tokens is mapped to the Responses :max_output_tokens parameter"
    (let [req (capture-bedrock-request! {:model      "openai.gpt-5.5"
                                         :region     "us-east-2"
                                         :input      [{:role :user :content "hi"}]
                                         :max-tokens 4000})]
      (is (= 4000 (-> req :body :max_output_tokens)))
      (is (not (contains? (:body req) :max_tokens))))))

(deftest bedrock-openai-system-instructions-test
  (testing "the system prompt is carried as the Responses :instructions parameter"
    (let [req (capture-bedrock-request! {:model  "openai.gpt-5.5" :region "us-east-2"
                                         :system "be terse"
                                         :input  [{:role :user :content "hi"}]})]
      (is (= "be terse" (-> req :body :instructions))))))

(deftest bedrock-openai-reasoning-model-omits-temperature-test
  (testing "temperature is dropped for a gpt-5 reasoning model despite the openai.* prefix"
    (let [req (capture-bedrock-request! {:model       "openai.gpt-5.5"
                                         :region      "us-east-2"
                                         :temperature 0.0
                                         :input       [{:role :user :content "hi"}]})]
      (is (not (contains? (:body req) :temperature))))))

(deftest bedrock-unsupported-model-test
  (testing "a model outside the anthropic.*/openai.* families is rejected"
    (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Unsupported Bedrock model: deepseek\.v3\.1"
                          (capture-bedrock-request! {:model "deepseek.v3.1"
                                                     :input [{:role :user :content "hi"}]})))))

;;; ──────────────────────────────────────────────────────────────────
;;; Error translation
;;; ──────────────────────────────────────────────────────────────────

(deftest bedrock-error-translation-test
  (testing "upstream HTTP errors are translated into user-facing messages"
    (doseq [[status expected] {403 #"access denied"
                               404 #"model not found"
                               429 #"rate limited"}]
      (with-redefs [http/request (fn [_] (throw (ex-info "boom" {:status status :body {:message "x"}})))]
        (is (thrown-with-msg? clojure.lang.ExceptionInfo expected
                              (bedrock/list-all-models creds-opts))
            (str "HTTP " status " should translate"))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Credential resolution
;;; ──────────────────────────────────────────────────────────────────

(deftest bedrock-missing-access-key-test
  (testing "a missing access key id raises a missing-API-key error"
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     nil
                                       llm.settings/llm-bedrock-secret-access-key nil]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"No AWS Bedrock API key is set"
                            (bedrock/list-models))))))

(deftest bedrock-missing-secret-test
  (testing "a present access key id but missing secret raises a configuration error"
    (mt/with-temporary-setting-values [llm.settings/llm-bedrock-access-key-id     "AKID"
                                       llm.settings/llm-bedrock-secret-access-key nil]
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"Secret Access Key is not configured"
                            (bedrock/list-models))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Stream-translator selection
;;; ──────────────────────────────────────────────────────────────────

(deftest bedrock-selects-claude-translator-test
  (testing "an anthropic.* model decodes the stream with the Claude translator"
    (mt/with-dynamic-fn-redefs [bedrock/bedrock-raw
                                (fn [_] [{:type "content_block_start" :index 0 :content_block {:type "text"}}
                                         {:type "content_block_delta" :delta {:type "text_delta" :text "hi"}}])]
      (is (=? [{:type :text-start} {:type :text-delta :delta "hi"} {:type :text-end}]
              (into [] (bedrock/bedrock {:model "anthropic.claude-haiku-4-5"})))))))

(deftest bedrock-selects-openai-translator-test
  (testing "an openai.* model decodes the stream with the OpenAI Responses translator"
    (mt/with-dynamic-fn-redefs [bedrock/bedrock-raw
                                (fn [_] [{:type "response.output_item.added" :item {:id "m1" :type "message"}}
                                         {:type "response.output_text.delta" :delta "hi"}])]
      (is (=? [{:type :text-start} {:type :text-delta :delta "hi"} {:type :text-end}]
              (into [] (bedrock/bedrock {:model "openai.gpt-5.5"})))))))
