(ns metabase-enterprise.transforms.api.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.ingestion :as search.ingestion]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

(use-fixtures :each (fn [thunk]
                      (binding [search.ingestion/*force-sync* true]
                        (search.tu/with-new-search-if-available-otherwise-legacy (thunk)))))

(deftest basic-search-test
  (testing "Transform can be found with search"
    (mt/with-premium-features #{:transforms}
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Transform {transform1-id  :id} {:name "transform1"}
                       :model/Transform {_transform2-id :id} {:name "tr2"}]
          (testing "Admin user can see transforms"
            (let [results (mt/user-http-request :crowberto :get 200 "search" :q "trans" :models "transform")]
              (is (= #{transform1-id}
                     (set (map :id (:data results)))))))

          (testing "Regular user can see no transforms"
            (let [results (mt/user-http-request :rasta :get 200 "search" :q "trans" :models "transform")]
              (is (empty? (:data results))))))))))

(deftest available-models-visibility-test
  (testing "Transform model visibility in available_models respects superuser restriction"
    (mt/with-premium-features #{:transforms}
      (search.tu/with-temp-index-table
        (mt/with-temp [:model/Transform {_transform-id :id} {:name "test transform"}]
          (testing "Superuser sees 'transform' in available_models"
            (let [response (mt/user-http-request :crowberto :get 200 "search"
                                                 :q "test"
                                                 :calculate_available_models true)]
              (is (contains? (set (:available_models response)) "transform"))))

          (testing "Regular user does not see 'transform' in available_models"
            (let [response (mt/user-http-request :rasta :get 200 "search"
                                                 :q "test"
                                                 :calculate_available_models true)]
              (is (not (contains? (set (:available_models response)) "transform"))))))))))
