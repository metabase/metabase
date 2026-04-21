(ns metabase-enterprise.semantic-search.api-test
  (:require
   [clojure.core.memoize :as memoize]
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.api :as semantic.api]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index :as semantic.index]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]))

(use-fixtures :once #'semantic.tu/once-fixture)

(deftest status-endpoint-test
  (testing "GET /api/ee/semantic-search/status"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :mock-initialized}
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

(deftest re-init-endpoint-test
  (testing "POST /api/search/re-init with semantic search support"
    (mt/with-premium-features #{:semantic-search}
      (semantic.tu/with-test-db! {:mode :mock-indexed}
        (let [original-index      semantic.tu/mock-index
              original-table-name (:table-name original-index)
              new-index           (with-redefs [semantic.index/model-table-suffix (constantly 345)]
                                    (#'semantic.pgvector-api/fresh-index semantic.tu/mock-index-metadata semantic.tu/mock-embedding-model :force-reset? true))
              new-table-name      (:table-name new-index)
              pgvector (semantic.env/get-pgvector-datasource!)]

          (is (semantic.tu/table-exists-in-db? original-table-name))
          (is (not (semantic.tu/table-exists-in-db? new-table-name)))

          (let [best-index (semantic.index-metadata/find-compatible-index! pgvector semantic.tu/mock-index-metadata semantic.tu/mock-embedding-model)]
            (is (=? original-index (:index best-index)))
            (is (:active best-index)))

          (testing "re-init creates the new index"
            (with-redefs [semantic.index/model-table-suffix (constantly 345)]
              (let [response (mt/user-http-request :crowberto :post 200 "search/re-init")]
                (is (contains? response :message))))

            (is (not= original-table-name new-table-name))
            (is (semantic.tu/table-exists-in-db? original-table-name))
            (is (semantic.tu/table-exists-in-db? new-table-name))

            (is (zero? (semantic.tu/index-count new-index))))

          (let [best-index (semantic.index-metadata/find-compatible-index! pgvector semantic.tu/mock-index-metadata semantic.tu/mock-embedding-model)]
            (is (=? new-index (:index best-index)))
            (is (:active best-index)))

          (testing "Index can be populated after re-init"
            (semantic.tu/upsert-index! (semantic.tu/mock-documents) :index new-index)

            (is (pos? (semantic.tu/index-count new-index)))))))))
