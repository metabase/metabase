(ns metabase-enterprise.library-branching.api-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.library-branching.scope :as scope]
   [metabase.collections.test-utils :as collections.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest count-test
  (mt/with-premium-features #{:remote-sync}
    (collections.tu/with-library [{:keys [metrics]}]
      (mt/with-temp [:model/Card _ {:name          "Total revenue"
                                    :type          :metric
                                    :collection_id (:id metrics)
                                    :dataset_query (mt/mbql-query venues {:aggregation [[:count]]})}]
        (testing "a superuser gets the number of in-scope items of each kind"
          (let [response (mt/user-http-request :crowberto :get 200 "ee/library-branching/count")]
            (is (= (scope/scope-count) response))
            (is (<= 1 (:metric response)))))
        (testing "a user who is not a superuser gets no count"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/library-branching/count"))))))))

(deftest count-needs-the-feature-test
  (testing "without the remote sync feature, the count is not available"
    (mt/with-premium-features #{}
      (mt/user-http-request :crowberto :get 402 "ee/library-branching/count"))))
