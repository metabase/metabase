(ns metabase.lib.drill-thru.zoom-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]))

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

(deftest ^:parallel do-not-return-zoom-for-nil-test
  (testing "do not return zoom drills for nil cell values (#36130)"
    (let [query   (lib/query meta/metadata-provider (meta/table-metadata :orders))
          context {:column     (meta/field-metadata :orders :id)
                   :column-ref (lib/ref (meta/field-metadata :orders :id))
                   :value      :null
                   :row        [{:column     (meta/field-metadata :orders :id)
                                 :column-ref (lib/ref (meta/field-metadata :orders :id))
                                 :value      nil}]}]
      (is (not (m/find-first #(= (:type %) :drill-thru/zoom)
                             (lib/available-drill-thrus query -1 context)))))))
