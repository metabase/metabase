(ns metabase.lib.drill-thru.pivot-test
  (:require
   [clojure.test :refer [deftest]]))

;;; FIXME pivot is not implemented yet (#33559)
(deftest ^:parallel returns-drill-thru-test-61
  #_(lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/pivot
      :click-type  :cell
      :query-type  :aggregated
      :query-table "PRODUCTS"
      :column-name "count"
      :expected    {:type :drill-thru/pivot}}))
