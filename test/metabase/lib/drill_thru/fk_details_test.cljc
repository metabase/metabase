(ns metabase.lib.drill-thru.fk-details-test
  (:require
   [clojure.test :refer [deftest]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]))

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
