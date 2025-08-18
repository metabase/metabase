(ns metabase-enterprise.semantic-search.api-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.api :as semantic.api]
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (compose-fixtures
                     (fixtures/initialize :db)
                     #'semantic.tu/once-fixture))

(defmacro with-mock-index-metadata!
  [& body]
  `(with-redefs [semantic.env/get-pgvector-datasource! (constantly semantic.tu/db)
                 semantic.embedding/get-configured-model (constantly semantic.tu/mock-embedding-model)
                 semantic.env/get-index-metadata (constantly semantic.tu/mock-index-metadata)]
     ~@body))

(deftest status-endpoint-test
  (testing "GET /api/ee/semantic-search/status"
    (mt/with-premium-features #{:semantic-search}
      (with-mock-index-metadata!
        (with-open [index-ref (semantic.tu/open-temp-index!)]
          (with-redefs [semantic.index-metadata/get-active-index-state (fn [_ _]
                                                                         {:index @index-ref
                                                                          :status :active})]
            (let [expected-search-items-count (search.ingestion/search-items-count)]
              (memoize/memo-clear! @#'semantic.api/indexible-items-count)
              (testing "Correctly reports empty index status"
                (let [{:keys [indexed_count total_est]} (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status")]
                  (is (= 0 indexed_count))
                  (is (= expected-search-items-count total_est))))

              (testing "Correctly reports size of index after inserting documents"
                (semantic.tu/upsert-index! (semantic.tu/mock-documents))
                (let [{:keys [indexed_count total_est]} (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status")]
                  (is (= 2 indexed_count))
                  (is (= expected-search-items-count total_est)))))))))

    (testing "with semantic search disabled"
      (mt/with-premium-features #{}
        (let [response (mt/user-http-request :crowberto :get 402 "ee/semantic-search/status")]
          (testing "returns 402 when semantic search feature is not available"
            (is (= 402 (get-in response [:data :status-code])))))))

    (testing "with no active index"
      (mt/with-premium-features #{:semantic-search}
        (with-redefs [semantic.env/get-pgvector-datasource! (constantly nil)
                      semantic.env/get-index-metadata (constantly nil)]
          (let [response (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status")]
            (testing "returns empty map when no index is active"
              (is (= {} response)))))))))

(deftest status-endpoint-permissions-test
  (testing "GET /api/ee/semantic-search/status permissions"
    (mt/with-premium-features #{:semantic-search}
      (testing "admin users can access status endpoint"
        (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status"))

      (testing "regular users cannot access status endpoint"
        (mt/user-http-request :rasta :get 403 "ee/semantic-search/status")))))
