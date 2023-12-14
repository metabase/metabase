(ns metabase.query-processor.query-to-expected-cols-test
  "Tests for `metabase.query-processor/query->expected-cols`."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]
   [toucan2.tools.with-temp :as t2.with-temp]))

(deftest ^:parallel deduplicate-column-names-test
  (testing "`qp/query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins
                          [{:fields       :all
                            :alias        "u"
                            :source-table $$users
                            :condition    [:= $user_id &u.users.id]}]})))))))

(deftest remapped-fks-test
  (testing "Sanity check: query->expected-cols should not include MLv2 dimension remapping keys"
    (mt/dataset test-data
      ;; Add column remapping from Orders Product ID -> Products.Title
      (t2.with-temp/with-temp [:model/Dimension _ (mt/$ids orders
                                                    {:field_id                %product_id
                                                     :name                    "Product ID"
                                                     :type                    :external
                                                     :human_readable_field_id %products.title})]
        (let [expected-cols (qp/query->expected-cols (mt/mbql-query orders))]
          (is (not (some (some-fn :lib/external_remap :lib/internal_remap)
                         expected-cols))))))))
