(ns metabase-enterprise.tenants.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.appdb.core :as search.engines.appdb]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(comment
  ;; We need this to ensure the engine hierarchy is registered
  search.engines.appdb/keep-me)

(use-fixtures :once (fixtures/initialize :db))
(use-fixtures :each (fn [thunk] (binding [search.ingestion/*force-sync* true]
                                  (search.tu/with-new-search-if-available-otherwise-legacy (thunk)))))

(deftest dedicated-tenant-collection-dataset-search-test
  (testing "Search returns datasets (models) from dedicated tenant collections"
    (mt/with-premium-features #{:tenants}
      (mt/with-temporary-setting-values [use-tenants true]
        (mt/with-temp [:model/Tenant {tenant-collection-id :tenant_collection_id} {:name "Test Tenant" :slug "test-tenant"}
                       :model/Card {model-name :name} {:name "Dedicated Tenant Model"
                                                       :type :model
                                                       :collection_id tenant-collection-id}]
          (t2/select-one :model/Collection tenant-collection-id)
          (let [results (->> (mt/user-http-request :crowberto :get 200 "search" :q "Dedicated Tenant Model")
                             :data
                             (filter #(= (:model %) "dataset"))
                             first)]
            (testing "datasets in dedicated tenant collections are returned"
              (is (=? {:name model-name} results)))))))))
