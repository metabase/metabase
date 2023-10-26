(ns metabase.lib.drill-thru.fk-details-test
  (:require
   [clojure.test :refer [deftest testing]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel returns-fk-details-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-details
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "PRODUCT_ID"
    :expected    {:type      :drill-thru/fk-details
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "PRODUCT_ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-fk-details-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-details
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type      :drill-thru/fk-details
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])
                  :many-pks? false}}))

(deftest ^:parallel do-not-return-fk-details-for-non-fk-column-test
  (testing "fk-details should not get returned for non-fk column (#34441)"
    (lib.drill-thru.tu/test-drill-not-returned
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :drill-type  :drill-thru/fk-details})))

(deftest ^:parallel apply-fk-details-test
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [column-value (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "PRODUCT_ID"])]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "PRODUCT_ID"
        :drill-type     :drill-thru/fk-details
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-details
                         :column    {:name "PRODUCT_ID"}
                         :object-id column-value
                         :many-pks? false}
        :expected-query {:stages [{:source-table (meta/id :products)
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :products :id)]
                                                   column-value]]}]}}))))

(deftest ^:parallel apply-fk-details-test-2
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [column-value (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "USER_ID"
        :drill-type     :drill-thru/fk-details
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-details
                         :column    {:name "USER_ID"}
                         :object-id column-value
                         :many-pks? false}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :people :id)]
                                                   column-value]]}]}}))))
