(ns metabase-enterprise.semantic-search.core-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.pgvector-api :as semantic.pgvector-api]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.search.appdb.core :as appdb]
   [metabase.search.core :as search] [metabase.search.engine :as search.engine]
   [metabase.search.settings :as search.settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (compose-fixtures
                     (fixtures/initialize :db)
                     #'semantic.tu/once-fixture))

(deftest appdb-available-with-semantic
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        (semantic.tu/cleanup-index-metadata! semantic.tu/db semantic.tu/mock-index-metadata)
        (search/init-index! {:force-reset? false, :re-populate? false})
        (is (search.engine/supported-engine? :search.engine/appdb))))))

(deftest api-engine-switching-test
  (mt/with-premium-features #{:semantic-search}
    (mt/with-temporary-setting-values [search.settings/search-engine "semantic"]
      (with-open [_ (semantic.tu/open-temp-index!)]
        (testing "API defaults to semantic engine when configured"
          (let [semantic-called? (atom false)
                appdb-called? (atom false)]
            (with-redefs [semantic.pgvector-api/query
                          (fn [& _]
                            (reset! semantic-called? true)
                            [{:id 1 :name "semantic-result" :model "card" :collection_id 1  :score 0}])
                          appdb/results
                          (fn [_]
                            (reset! appdb-called? true)
                            [{:id 2 :name "appdb-result" :model "card" :collection_id 1 :score 0.9}])]

              (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test")]
                (is @semantic-called? "Semantic search should be called by default")
                (is (not @appdb-called?) "AppDB search should not be called by default")
                (is (= "search.engine/semantic" (:engine response)))))))

        (testing "API can override engine with search_engine=appdb parameter"
          (let [semantic-called? (atom false)
                appdb-called? (atom false)]
            (with-redefs [semantic.pgvector-api/query
                          (fn [& _]
                            (reset! semantic-called? true)
                            [{:id 1 :name "semantic-result" :model "card" :collection_id 1  :score 0.8}])
                          appdb/results
                          (fn [_]
                            (reset! appdb-called? true)
                            [{:id 2 :name "appdb-result" :model "card" :collection_id 1 :score 0.9}])]

              (let [response (mt/user-http-request :crowberto :get 200 "search" :q "test" :search_engine "appdb")]
                (is (not @semantic-called?) "Semantic search should not be called when overridden")
                (is @appdb-called? "AppDB search should be called when specified")
                (is (= "search.engine/appdb" (:engine response)))))))))))
