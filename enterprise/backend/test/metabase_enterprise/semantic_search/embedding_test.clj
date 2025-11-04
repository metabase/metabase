(ns metabase-enterprise.semantic-search.embedding-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [environ.core :as env]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.gate :as semantic.gate]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.indexer :as semantic.indexer]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.settings :as semantic.settings]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.analytics.core :as analytics]
   [metabase.test :as mt]
   [metabase.util.json :as json]
   [toucan2.core :as t2])
  (:import
   [java.nio ByteBuffer ByteOrder]
   [java.util Base64]))

(set! *warn-on-reflection* true)

(deftest test-get-provider
  (testing "get-active-model returns based on setting"
    (mt/with-temporary-setting-values [ee-embedding-provider "ai-service"
                                       ee-embedding-model "mxbai-embed-large"
                                       ee-embedding-model-dimensions 1024]
      (is (= {:provider "ai-service"
              :model-name "mxbai-embed-large"
              :vector-dimensions 1024}
             (embedding/get-configured-model))))

    (mt/with-temporary-setting-values [ee-embedding-provider "ollama"
                                       ee-embedding-model "mxbai-embed-large"
                                       ee-embedding-model-dimensions 1024]
      (is (= {:provider "ollama"
              :model-name "mxbai-embed-large"
              :vector-dimensions 1024}
             (embedding/get-configured-model))))

    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model "text-embedding-3-small"
                                       ee-embedding-model-dimensions 1536]
      (is (= {:provider "openai"
              :model-name "text-embedding-3-small"
              :vector-dimensions 1536}
             (embedding/get-configured-model))))))

(deftest test-model-dimensions-with-settings
  (testing "model-dimensions uses setting defaults when override is nil"
    (mt/with-temporary-setting-values [ee-embedding-model-dimensions nil]
      (is (= 1024 (:vector-dimensions (embedding/get-configured-model))))))

  (testing "model-dimensions uses override when specified"
    (mt/with-temporary-setting-values [ee-embedding-model-dimensions 768]
      (is (= 768 (:vector-dimensions (embedding/get-configured-model)))))))

(deftest test-openai-provider-validation
  (testing "OpenAIProvider throws when API key not configured"
    (let [embedding-model {:provider "openai"
                           :model-name "text-embedding-3-small"
                           :vector-dimensions 1536}]
      (mt/with-temporary-setting-values [ee-openai-api-key nil]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"OpenAI API key not configured"
             (embedding/get-embedding embedding-model "test text")))
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"OpenAI API key not configured"
             (embedding/get-embeddings-batch embedding-model ["test text"])))))))

(deftest test-token-counting
  (testing "count-tokens returns reasonable counts for text"
    (is (= 2 (#'embedding/count-tokens "Hello world")))
    (is (= 9 (#'embedding/count-tokens "This is a longer sentence with more tokens.")))
    (is (zero? (#'embedding/count-tokens "")))
    (is (nil? (#'embedding/count-tokens nil)))))

(deftest test-batching-logic
  (testing "create-batches handles empty input"
    (is (empty? (#'embedding/create-batches 10 count [])))
    (is (empty? (#'embedding/create-batches 10 count nil))))

  (testing "create-batches with single short text"
    (let [texts ["Short text"]
          batches (#'embedding/create-batches 10 count texts)]
      (is (= 1 (count batches)))
      (is (= texts (first batches)))))

  (testing "create-batches splits texts appropriately with smaller token limit"
    ;; Use a smaller token limit to make testing more predictable
    (let [texts ["This is document 1" "This is document 2" "This is document 3"]
          batches (#'embedding/create-batches 10 #'embedding/count-tokens texts)]
      (is (= [["This is document 1" "This is document 2"] ["This is document 3"]]
             batches))))

  (testing "create-batches skips texts that exceed token limit"
    (let [texts ["Short" "This is a much longer text that exceeds the limit" "Also short"]
          batches (#'embedding/create-batches 5 #'embedding/count-tokens texts)]
      ;; Should skip the long text and batch the short ones
      (is (= [["Short" "Also short"]] batches)))))

(defn- float-vectors-approx=
  "Compare two vectors of floats for approximate equality within a given tolerance."
  ([v1 v2]
   (float-vectors-approx= v1 v2 0.0001))
  ([v1 v2 tolerance]
   (and (= (count v1) (count v2))
        (every? #(< (Math/abs ^double %) tolerance)
                (map - v1 v2)))))

(defn- encode-floats-to-base64
  "Helper function to base64 encode a vector of floats using little-endian byte order.
   Inverse of [[metabase-enterprise.semantic-search.embedding/extract-base64-response-embeddings]] "
  [float-vector]
  (let [byte-count (* (count float-vector) 4)
        buffer (doto (ByteBuffer/allocate byte-count)
                 (.order ByteOrder/LITTLE_ENDIAN))]
    (doseq [f float-vector]
      (.putFloat buffer (float f)))
    (.encodeToString (Base64/getEncoder) (.array buffer))))

(deftest test-extract-base64-response-embeddings
  (testing "extracts single embedding correctly"
    (let [test-embedding [1.0 2.5 -0.5 3.14159]
          base64-str (encode-floats-to-base64 test-embedding)
          response {:data [{:embedding base64-str}]}
          result (#'embedding/extract-base64-response-embeddings response)]
      (is (= 1 (count result)))
      (is (= (count test-embedding) (count (first result))))
      (is (float-vectors-approx= test-embedding (first result)))))

  (testing "extracts multiple embeddings correctly"
    (let [embedding1 [1.0 2.0 3.0]
          embedding2 [-1.0 -2.0 -3.0]
          embedding3 [0.0 0.5 -0.5]
          base64-str1 (encode-floats-to-base64 embedding1)
          base64-str2 (encode-floats-to-base64 embedding2)
          base64-str3 (encode-floats-to-base64 embedding3)
          response {:data [{:embedding base64-str1}
                           {:embedding base64-str2}
                           {:embedding base64-str3}]}
          result (#'embedding/extract-base64-response-embeddings response)]
      (is (= 3 (count result)))
      (is (float-vectors-approx= embedding1 (nth result 0)))
      (is (float-vectors-approx= embedding2 (nth result 1)))
      (is (float-vectors-approx= embedding3 (nth result 2)))))

  (testing "edge cases that return empty results"
    (testing "handles empty data array"
      (let [response {:data []}
            result (#'embedding/extract-base64-response-embeddings response)]
        (is (= [] result))))

    (testing "handles missing :data key"
      (let [response {}
            result (#'embedding/extract-base64-response-embeddings response)]
        (is (= [] result))))

    (testing "handles zero-length embedding"
      (let [base64-str (encode-floats-to-base64 [])
            response {:data [{:embedding base64-str}]}
            result (#'embedding/extract-base64-response-embeddings response)]
        (is (= 1 (count result)))
        (is (= [] (first result))))))

  (testing "handles large embedding vectors"
    (let [large-embedding (vec (map float (range 1536)))
          base64-str (encode-floats-to-base64 large-embedding)
          response {:data [{:embedding base64-str}]}
          result (#'embedding/extract-base64-response-embeddings response)]
      (is (= 1 (count result)))
      (is (= 1536 (count (first result))))
      (is (float-vectors-approx= (take 5 large-embedding) (take 5 (first result))))
      (is (float-vectors-approx= (take-last 5 large-embedding) (take-last 5 (first result))))))

  (testing "error cases"
    (testing "invalid base64 string throws exception"
      (is (thrown? Exception
                   (#'embedding/extract-base64-response-embeddings
                    {:data [{:embedding "not-valid-base64!@#$"}]}))))

    (testing "non-string embedding value throws exception"
      (is (thrown? Exception
                   (#'embedding/extract-base64-response-embeddings
                    {:data [{:embedding 123}]}))))

    (testing "base64 string with invalid byte count (not multiple of 4) throws exception"
      ;; Create a base64 string that decodes to 3 bytes
      (let [encoder (Base64/getEncoder)
            invalid-base64 (.encodeToString encoder (byte-array [1 2 3]))]
        (is (thrown? Exception
                     (#'embedding/extract-base64-response-embeddings
                      {:data [{:embedding invalid-base64}]})))))))

(deftest test-get-embedding
  (mt/with-temporary-setting-values [ee-openai-api-key "mock-openai-api-key"]
    (let [mock-embedding [1.0 2.0 3.0 4.0]
          openai-response {:data [{:object "embedding"
                                   :embedding (encode-floats-to-base64 mock-embedding)
                                   :index 0}]
                           :model "some-model"
                           :usage {:prompt_tokens 1
                                   :total_tokens 1}}
          analytics-calls (atom [])]
      (doseq [{:keys [provider mock-response counts-tokens?]}
              [{:provider "openai"
                :mock-response openai-response
                :counts-tokens? true}
               {:provider "ai-service"
                :mock-response openai-response
                :counts-tokens? true}
               {:provider "ollama"
                :mock-response {:embedding mock-embedding}
                :counts-tokens? false}]]

        (t2/delete! :model/SemanticSearchTokenTracking)

        (mt/with-dynamic-fn-redefs [analytics/inc! (fn [metric & args]
                                                     (swap! analytics-calls conj [metric args]))
                                    http/post (fn post-mock [_url & _options]
                                                {:status 200
                                                 :headers {"Content-Type" "application/json"}
                                                 :body (json/encode mock-response)})]
          (testing provider
            (reset! analytics-calls [])
            (is (= mock-embedding (#'embedding/get-embedding {:provider provider
                                                              :model-name "some-model"
                                                              :vector-dimensions 4}
                                                             "hello")))
            (is (= [mock-embedding] (#'embedding/get-embeddings-batch {:provider provider
                                                                       :model-name "some-model"
                                                                       :vector-dimensions 4}
                                                                      ["hello"])))
            (when counts-tokens?
              (let [tokens-calls (filter #(= :metabase-search/semantic-embedding-tokens (first %)) @analytics-calls)]
                (is (= 2 (count tokens-calls)))
                (is (= {:provider provider
                        :model "some-model"}
                       (-> tokens-calls first second first)))
                (is (= (get-in mock-response [:usage :total_tokens])
                       (-> tokens-calls first second second)))
                (is (= 2 (t2/count :model/SemanticSearchTokenTracking)))))))))))

(deftest token-tracking-write-test
  (mt/with-premium-features #{:semantic-search}
    (when (string? (not-empty (:mb-pgvector-db-url env/env)))
      (doseq [provider ["openai" "ai-service"]]
        (semantic.tu/with-test-db! {:mode :blank}
          (let [mock-embedding (repeat 1024 1.0)
                mock-response {:data [{:object "embedding"
                                       :embedding (encode-floats-to-base64 mock-embedding)
                                       :index 0}]
                               :model "some-model"
                               :usage {:prompt_tokens 1
                                       :total_tokens 13}}]
            (with-redefs [semantic.settings/ee-embedding-provider (constantly provider)
                          semantic.settings/ee-embedding-model (constantly "mock-model")
                          semantic.settings/openai-api-key (constantly "xyz")
                          semantic.settings/openai-api-base-url (constantly "xyz")
                          http/post (fn post-mock [_url & _options]
                                      {:status 200
                                       :headers {"Content-Type" "application/json"}
                                       :body (json/encode mock-response)})]
              (let [pgvector (semantic.env/get-pgvector-datasource!)
                    index-metadata (semantic.env/get-index-metadata)
                    embedding-model (semantic.env/get-configured-embedding-model)
                    _ (semantic.pgvector-api/init-semantic-search! pgvector index-metadata embedding-model)
                    {:keys [index metadata-row]} (semantic.index-metadata/get-active-index-state pgvector index-metadata)
                    indexing-state (semantic.indexer/init-indexing-state metadata-row)
                    gate-docs (mapv #(semantic.gate/search-doc->gate-doc % (java.sql.Timestamp. 1000))
                                    (semantic.tu/mock-documents))]

                (semantic.gate/gate-documents! pgvector index-metadata gate-docs)
                (t2/delete! :model/SemanticSearchTokenTracking)

                (testing "Indexing tokens are tracked"
                  (semantic.indexer/indexing-step pgvector index-metadata index indexing-state)
                  (is (= 1 (t2/count :model/SemanticSearchTokenTracking)))
                  (let [{:keys [request_type total_tokens]}
                        (t2/select-one :model/SemanticSearchTokenTracking)]
                    (is (= :index request_type))
                    (is (= 13 total_tokens))))

                (testing "Querying tokens are tracked"
                  (t2/delete! :model/SemanticSearchTokenTracking)
                  (semantic.index/query-index pgvector index {:search-string "elephant"})
                  (is (= 1 (t2/count :model/SemanticSearchTokenTracking)))
                  (let [{:keys [request_type total_tokens]}
                        (t2/select-one :model/SemanticSearchTokenTracking)]
                    (is (= :query request_type))
                    (is (= 13 total_tokens))))))))))))
