(ns metabase.lib.drill-thru.foreign-key-test
  (:require
   [clojure.test :refer [deftest]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]))

(deftest ^:parallel returns-fk-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type :drill-thru/fk-filter}}))

(deftest ^:parallel returns-fk-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "PRODUCT_ID"
    :expected    {:type :drill-thru/fk-filter}}))

;;; FIXME `fk-filter` doesn't get returned for fk column that was used as breakout (#34440)
(deftest ^:parallel returns-fk-filter-test-3
  #_(lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/fk-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "PRODUCT_ID"
      :expected    {:type :drill-thru/fk-filter}}))
