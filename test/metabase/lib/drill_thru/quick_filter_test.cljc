(ns metabase.lib.drill-thru.quick-filter-test
  (:require
   [clojure.test :refer [deftest testing]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel returns-quick-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                              {:name ">"}
                                                              {:name "="}
                                                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "="}
                                                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                              {:name ">"}
                                                              {:name "="}
                                                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                              {:name ">"}
                                                              {:name "="}
                                                              {:name "≠"}]}}))

;;; FIXME quick-filter doesn't get returned for CREATED_AT column in aggregated query (#34443)
(deftest ^:parallel returns-quick-filter-test-5
  #_(lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/quick-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "CREATED_AT"
      :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                                {:name ">"}
                                                                {:name "="}
                                                                {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                              {:name ">"}
                                                              {:name "="}
                                                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type :drill-thru/quick-filter, :operators [{:name "<"}
                                                              {:name ">"}
                                                              {:name "="}
                                                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-8
  (testing "quick-filter should not return < or > for cell with no value (#34445)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/quick-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :expected    {:type :drill-thru/quick-filter, :operators [{:name "="}
                                                                {:name "≠"}]}})))

(deftest ^:parallel apply-quick-filter-on-correct-level-test
  (testing "quick-filter on an aggregation should introduce an new stage (#34346)"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :cell
      :query-type     :aggregated
      :column-name    "sum"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type       :drill-thru/quick-filter
                       :operators  [{:name "<"}
                                    {:name ">"}
                                    {:name "="}
                                    {:name "≠"}]
                       :new-stage? true}
      :drill-args     ["="]
      :expected-query {:stages [{}
                                {:filters [[:= {}
                                            [:field {} "sum"]
                                            (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "sum"])]]}]}})))

(deftest ^:parallel apply-quick-filter-on-correct-level-test-2
  (testing "quick-filter not on an aggregation should NOT introduce an new stage"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :cell
      :query-type     :aggregated
      :column-name    "CREATED_AT"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type       :drill-thru/quick-filter
                       :operators  [{:name "<"}
                                    {:name ">"}
                                    {:name "="}
                                    {:name "≠"}]
                       :new-stage? false}
      :drill-args     ["<"]
      :expected-query {:stages [{:filters [[:< {}
                                            [:field {:temporal-unit :month} (meta/id :orders :created-at)]
                                            (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])]]}]}})))

(deftest ^:parallel apply-quick-filter-on-correct-level-test-3
  (testing "quick-filter on an aggregation should introduce an new stage (#34346)"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :cell
      :query-type     :aggregated
      :column-name    "max"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type      :drill-thru/quick-filter
                       :operators [{:name "=", :filter [:is-null {} [:field {} "max"]]}
                                   {:name "≠", :filter [:not-null {} [:field {} "max"]]}]
                       :new-stage? true}
      :drill-args     ["≠"]
      :expected-query {:stages [{}
                                {:filters [[:not-null {} [:field {} "max"]]]}]}})))
