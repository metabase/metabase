(ns metabase-enterprise.transforms.api.search-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.test-util :as search.tu]
   [metabase.test :as mt]))

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
