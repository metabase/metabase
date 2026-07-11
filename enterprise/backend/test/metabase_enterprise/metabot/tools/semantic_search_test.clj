(ns metabase-enterprise.metabot.tools.semantic-search-test
  "Semantic search tests specific to the Metabot search tool integration."
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.semantic-search.test-util :as semantic.tu]
   [metabase.api.common :as api]
   [metabase.metabot.tools.search :as search]
   [metabase.permissions.core :as perms]
   [metabase.search.core :as search-core]
   [metabase.search.engine :as search.engine]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(use-fixtures :once #'semantic.tu/once-fixture)

(defmacro with-semantic-search-if-available! [mock-embeddings & body]
  `(mt/with-additional-premium-features #{:semantic-search}
     (when (search.engine/supported-engine? :search.engine/semantic)
       (semantic.tu/with-mock-embeddings ~mock-embeddings
         (binding [search.ingestion/*disable-updates* false
                   search.ingestion/*force-sync* true]
           ~@body)))))

(deftest search-test
  (mt/with-additional-premium-features #{:content-verification}
    (with-semantic-search-if-available!
      (mt/with-test-user :rasta
        (let [order-table {:id 1
                           :model "table"
                           :table_name "orders"
                           :name "Orders"
                           :description "Order table"
                           :database_id 42
                           :table_schema "public"}
              dashboard {:id 2
                         :model "dashboard"
                         :name "Sales Dashboard"
                         :description "Dashboard for sales"
                         :verified true}]
          (with-redefs [perms/impersonated-user? (fn [] false)
                        perms/sandboxed-user? (fn [] false)
                        api/*current-user-id* 1]
            (testing "search returns postprocessed results"
              (with-redefs [search-core/search (fn [_] {:data [order-table]})]
                (let [args {:query "orders"
                            :entity-types ["table"]}
                      results (search/search args)
                      expected [(#'search/postprocess-search-result order-table)]]
                  (is (= expected results)))))
            (testing "search returns postprocessed results for a natural-language query"
              (with-redefs [search-core/search (fn [_] {:data [dashboard]})]
                (let [args {:query "sales metrics"
                            :entity-types ["dashboard"]}
                      results (search/search args)
                      expected [(#'search/postprocess-search-result dashboard)]]
                  (is (= expected results)))))
            (testing "search handles empty results"
              (with-redefs [search-core/search (fn [_] {:data []})]
                (let [args {:query "nonexistent"
                            :entity-types ["table"]}
                      results (search/search args)]
                  (is (empty? results)))))
            (testing "search with metabot verified-or-curated content flag"
              (let [metabot {:entity_id "test-bot"
                             :use_verified_content true}]
                (with-redefs [t2/select-one (fn [model & _]
                                              (is (= :model/Metabot model) "Should query for Metabot model")
                                              metabot)
                              search-core/search (fn [context]
                                                   ;; use_verified_content now drives the curated filter, not :verified
                                                   (is (true? (:curated? context)))
                                                   {:data [dashboard]})]
                  (let [results (search/search {:query "test"
                                                :metabot-id "test-bot"
                                                :entity-types ["dashboard"]})]
                    (is (= 1 (count results)))
                    (is (= 2 (:id (first results))))))))))))))
