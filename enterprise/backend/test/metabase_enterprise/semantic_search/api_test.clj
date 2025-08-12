(ns metabase-enterprise.semantic-search.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.env :as semantic.env]
   [metabase-enterprise.semantic-search.index-metadata :as semantic.index-metadata]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (compose-fixtures
                     (fixtures/initialize :db)
                     #'semantic.tu/once-fixture))

(deftest status-endpoint-test
  (testing "GET /api/ee/semantic-search/status"
    (mt/with-premium-features #{:semantic-search}
      (testing "correctly returns 0 indexed documents for a fresh index"
        (with-redefs [semantic.index-metadata/default-index-metadata semantic.tu/mock-index-metadata]
          (with-open [_ (semantic.tu/open-temp-index!)]
            (let [{:keys [indexed_count total_est]} (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status")]
              (is (= 0 indexed_count))
              (is (< 0 total_est)))))

        (testing "indexed count matches total count once indexing is complete"
          (binding [search.ingestion/*force-sync* true]
            (search.core/reindex! :search.engine/semantic {:force-reset true})
            (let [{:keys [indexed_count total_est]} (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status")]
              (is (< 0 indexed_count))
              (is (< 0 total_est))
              (is (= indexed_count total_est)))))))

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
      (with-open [_ (semantic.tu/open-temp-index!)]
        (semantic.tu/cleanup-index-metadata! semantic.tu/db semantic.tu/mock-index-metadata)
        (semantic.tu/with-index!
          (testing "admin users can access status endpoint"
            (mt/user-http-request :crowberto :get 200 "ee/semantic-search/status"))

          (testing "regular users cannot access status endpoint"
            (mt/user-http-request :rasta :get 403 "ee/semantic-search/status")))))))
