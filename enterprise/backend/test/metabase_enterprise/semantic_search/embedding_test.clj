(ns metabase-enterprise.semantic-search.embedding-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.embedding :as embedding]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest test-get-provider
  (binding [embedding/*active-model* nil]
    (testing "get-active-model returns based on setting"
      (mt/with-temporary-setting-values [ee-embedding-provider "ollama"]
        (is (= {:provider "ollama"
                :model-name "mxbai-embed-large"
                :vector-dimensions 1024}
               (embedding/get-active-model))))

      (mt/with-temporary-setting-values [ee-embedding-provider "openai"]
        (is (= {:provider "openai"
                :model-name "text-embedding-3-small"
                :vector-dimensions 1536}
               (embedding/get-active-model)))))

    (testing "get-provider throws on unknown provider"
      (mt/with-temporary-setting-values [ee-embedding-provider "unknown"]
        (is (thrown-with-msg?
             clojure.lang.ExceptionInfo
             #"Unknown embedding provider: unknown"
             (embedding/get-active-model)))))))

(deftest test-model-dimensions-with-settings
  (testing "model-dimensions uses provider defaults when override is nil"
    (mt/with-temporary-setting-values [ee-embedding-provider "ollama"
                                       ee-embedding-model nil]
      (is (= 1024 (:vector-dimensions (embedding/get-active-model)))))

    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model nil]
      (is (= 1536 (:vector-dimensions (embedding/get-active-model))))))

  (testing "model-dimensions uses override when specified"
    (mt/with-temporary-setting-values [ee-embedding-provider "ollama"
                                       ee-embedding-model "nomic-embed-text"]
      (is (= 768 (:vector-dimensions (embedding/get-active-model)))))

    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model "text-embedding-3-large"]
      (is (= 3072 (:vector-dimensions (embedding/get-active-model)))))))

(deftest test-default-models
  (testing "Provider defaults are used when no override is set"
    (is (= "text-embedding-3-small" (#'embedding/default-model-for-provider "openai")))
    (is (= "mxbai-embed-large" (#'embedding/default-model-for-provider "ollama")))
    (is (nil? (#'embedding/default-model-for-provider "unknown"))))

  (testing "get-model uses defaults when override is nil or empty"
    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model nil]
      (is (= "text-embedding-3-small" (:model-name (embedding/get-active-model)))))

    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model ""]
      (is (= "text-embedding-3-small" (:model-name (embedding/get-active-model)))))

    (mt/with-temporary-setting-values [ee-embedding-provider "ollama"
                                       ee-embedding-model nil]
      (is (= "mxbai-embed-large" (:model-name (embedding/get-active-model))))))

  (testing "get-model uses override when specified"
    (mt/with-temporary-setting-values [ee-embedding-provider "openai"
                                       ee-embedding-model "text-embedding-3-large"]
      (is (= "text-embedding-3-large" (:model-name (embedding/get-active-model)))))))

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
