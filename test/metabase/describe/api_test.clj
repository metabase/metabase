(ns metabase.describe.api-test
  "Tests for /api/describe endpoints."
  {:clj-kondo/config '{:linters {:deprecated-var {:exclude {metabase.test.data/mbql-query {:namespaces [metabase.describe.api-test]}}}}}}
  (:require
   [clojure.test :refer :all]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(defn- describe [user model id]
  (mt/user-http-request user :get 200 (format "describe/%s/%d" (name model) id)))

(defn- sum-measure-definition
  "An MBQL5 measure definition: Sum of `field-id` over `table-id`."
  [table-id field-id]
  (let [mp    (lib-be/application-database-metadata-provider (mt/id))
        query (lib/query mp (lib.metadata/table mp table-id))]
    (lib/aggregate query (lib/sum (lib.metadata/field mp field-id)))))

(deftest describe-card-test
  (testing "GET /api/describe/card/:id"
    (testing "an MBQL question returns a suggested name and a per-section breakdown"
      (mt/with-temp [:model/Card {id :id} {:name          "Some name"
                                           :dataset_query (mt/mbql-query orders
                                                            {:aggregation [[:sum $total]]
                                                             :breakout    [$product_id->products.category]
                                                             :order-by    [[:asc [:aggregation 0]]]})}]
        (is (=? {:model          "card"
                 :id             id
                 :name           "Some name"
                 :native         false
                 :suggested_name string?
                 :sections       {:aggregation "Sum of Total"
                                  :breakout    "Grouped by Product → Category"
                                  :filters     nil
                                  :order_by    string?
                                  :limit       nil
                                  ;; the breakout joins Products implicitly, so there is no explicit :joins clause
                                  :joins       nil}}
                (describe :crowberto :card id)))))
    (testing "a native question reports :native true with a nil suggested name"
      (mt/with-temp [:model/Card {id :id} {:dataset_query (mt/native-query {:query "SELECT 1 AS one"})}]
        (is (=? {:model          "card"
                 :native         true
                 :suggested_name nil
                 :sections       {:aggregation nil
                                  :breakout    nil
                                  :filters     nil
                                  :order_by    nil
                                  :limit       nil
                                  :joins       nil}}
                (describe :crowberto :card id)))))))

(deftest describe-segment-test
  (testing "GET /api/describe/segment/:id returns a filter description"
    (mt/with-temp [:model/Segment {id :id} {:table_id   (mt/id :venues)
                                            :definition (:query (mt/mbql-query venues
                                                                  {:filter [:= $price 4]}))}]
      (is (=? {:model    "segment"
               :id       id
               :native   false
               :sections {:filters     "Filtered by Price is equal to 4"
                          :aggregation nil}}
              (describe :crowberto :segment id))))))

(deftest describe-measure-test
  (testing "GET /api/describe/measure/:id returns an aggregation description"
    (mt/with-temp [:model/Measure {id :id} {:table_id   (mt/id :venues)
                                            :definition (sum-measure-definition (mt/id :venues) (mt/id :venues :price))}]
      (is (=? {:model    "measure"
               :id       id
               :native   false
               :sections {:aggregation "Sum of Price"
                          :filters     nil}}
              (describe :crowberto :measure id))))))

(deftest describe-validation-test
  (testing "an unsupported entity type does not route (the :model enum becomes a path regex)"
    (mt/user-http-request :crowberto :get 404 "describe/dashboard/1"))
  (testing "a missing entity returns 404"
    (mt/user-http-request :crowberto :get 404 "describe/card/999999999")))

(deftest describe-permissions-test
  (testing "describing a card the caller cannot read returns an error, not the description"
    (mt/with-temp [:model/Collection {coll-id :id} {}
                   :model/Card       {id :id}      {:collection_id coll-id
                                                    :dataset_query (mt/mbql-query orders)}]
      ;; rasta has no permission on this fresh collection
      (mt/with-non-admin-groups-no-collection-perms coll-id
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 (format "describe/card/%d" id))))))))
