(ns metabase.lib.drill-thru.zoom-test
  (:require
   [clojure.test :refer [deftest]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]))

(deftest ^:parallel returns-zoom-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/zoom
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "ID"
    :expected    {:type      :drill-thru/zoom
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-zoom-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/zoom
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "TAX"
    :expected    {:type      :drill-thru/zoom
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-zoom-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/zoom
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type      :drill-thru/zoom
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-zoom-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/zoom
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type      :drill-thru/zoom
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-zoom-test-5
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/zoom
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type      :drill-thru/zoom
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "ID"])
                  :many-pks? false}}))
