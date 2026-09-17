(ns metabase-enterprise.semantic-search.llm-connection-test
  (:require
   [clojure.test :refer :all]
   [metabase.llm.provider :as llm.provider]
   [metabase.llm.test-util :as llm.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def ^:private in-use-message
  #"Semantic search sends its embedding requests through this connection\. .*")

(defn- in-use-messages []
  (into {}
        (map (juxt :key :in_use_message))
        (mt/user-http-request :crowberto :get 200 "llm/providers")))

(deftest providers-report-the-connection-semantic-search-uses-test
  (mt/with-premium-features #{:semantic-search}
    (llm.tu/with-connections [(llm.tu/connection "openai") (llm.tu/connection "anthropic")]
      (testing "the connection the openai embedding provider sends its requests through says so"
        (mt/with-temporary-setting-values [ee-embedding-provider "openai"]
          (is (=? {"openai" in-use-message "anthropic" nil} (in-use-messages)))))
      (testing "the connection the setting names is the one in use, not whichever is keyed openai"
        (mt/with-temporary-setting-values [ee-embedding-provider           "openai"
                                           ee-embedding-openai-connection "anthropic"]
          (is (=? {"openai" nil "anthropic" in-use-message} (in-use-messages)))))
      (testing "no connection is in use while semantic search embeds through another provider"
        (mt/with-temporary-setting-values [ee-embedding-provider "ai-service"]
          (is (= {"openai" nil "anthropic" nil} (in-use-messages))))))))

(deftest delete-refuses-the-connection-semantic-search-uses-test
  (llm.tu/with-connections [(llm.tu/connection "openai")]
    (mt/with-temporary-setting-values [ee-embedding-provider "openai"]
      (mt/with-premium-features #{:semantic-search}
        (testing "the connection semantic search sends its requests through can't be removed"
          (is (=? in-use-message (mt/user-http-request :crowberto :delete 400 "llm/providers/openai")))
          (is (some? (llm.provider/connection "openai"))))
        (testing "until semantic search names another connection"
          (mt/with-temporary-setting-values [ee-embedding-openai-connection "embeddings"]
            (is (nil? (mt/user-http-request :crowberto :delete 204 "llm/providers/openai")))
            (is (nil? (llm.provider/connection "openai")))))))))

(deftest delete-ignores-semantic-search-without-the-feature-test
  (llm.tu/with-connections [(llm.tu/connection "openai")]
    (mt/with-temporary-setting-values [ee-embedding-provider "openai"]
      (mt/with-premium-features #{}
        (is (nil? (mt/user-http-request :crowberto :delete 204 "llm/providers/openai")))
        (is (nil? (llm.provider/connection "openai")))))))
