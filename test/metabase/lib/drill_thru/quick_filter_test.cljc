(ns metabase.lib.drill-thru.quick-filter-test
  "See also [[metabase.query-processor-test.drill-thru-e2e-test/quick-filter-on-bucketed-date-test]]"
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel returns-quick-filter-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "SUBTOTAL"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "SUBTOTAL"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "DISCOUNT"
    :expected    {:type      :drill-thru/quick-filter
                  :value     :null
                  :operators [{:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "CREATED_AT"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "CREATED_AT"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-4
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "QUANTITY"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "QUANTITY"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-5
  (lib.drill-thru.tu/test-returns-drill
    {:drill-type  :drill-thru/quick-filter
     :click-type  :cell
     :query-type  :aggregated
     :column-name "CREATED_AT"
     :expected    {:type      :drill-thru/quick-filter
                   :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])
                   :operators [{:name "<"}
                               {:name ">"}
                               {:name "="}
                               {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-6
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "count"])
                  :operators [{:name "<"}
                              {:name ">"}
                              {:name "="}
                              {:name "≠"}]}}))

(deftest ^:parallel returns-quick-filter-test-7
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/quick-filter
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type      :drill-thru/quick-filter
                  :value     (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "sum"])
                  :operators [{:name "<"}
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
      :expected    {:type      :drill-thru/quick-filter
                    :value     :null
                    :operators [{:name "="}
                                {:name "≠"}]}})))

(deftest ^:parallel apply-quick-filter-on-correct-level-test
  (testing "quick-filter on an aggregation should introduce an new stage (#34346)"
    (lib.drill-thru.tu/test-drill-application
     {:click-type     :cell
      :query-type     :aggregated
      :column-name    "sum"
      :drill-type     :drill-thru/quick-filter
      :expected       {:type         :drill-thru/quick-filter
                       :operators    [{:name "<"}
                                      {:name ">"}
                                      {:name "="}
                                      {:name "≠"}]
                       :query        {:stages [{} {}]}
                       :stage-number -1
                       :value        1}
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
      :expected       {:type         :drill-thru/quick-filter
                       :operators    [{:name "<"}
                                      {:name ">"}
                                      {:name "="}
                                      {:name "≠"}]
                       :query        {:stages [{}]}
                       :stage-number -1
                       :value        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :aggregated :row "CREATED_AT"])}
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
      :expected       {:type         :drill-thru/quick-filter
                       :operators    [{:name "=", :filter [:is-null {} [:field {} "max"]]}
                                      {:name "≠", :filter [:not-null {} [:field {} "max"]]}]
                       :query        {:stages [{} {}]}
                       :stage-number -1
                       :value        :null}
      :drill-args     ["≠"]
      :expected-query {:stages [{}
                                {:filters [[:not-null {} [:field {} "max"]]]}]}})))

(deftest ^:parallel contains-does-not-contain-test
  (testing "Should return :contains/:does-not-contain for text columns (#33560)"
    (let [query   (lib/query meta/metadata-provider (meta/table-metadata :reviews))
          context {:column     (meta/field-metadata :reviews :body)
                   :column-ref (lib/ref (meta/field-metadata :reviews :body))
                   :value      "text"
                   :row        [{:column     (meta/field-metadata :reviews :body),
                                 :column-ref (lib/ref (meta/field-metadata :reviews :body))
                                 :value      "text"}]}
          drill   (m/find-first #(= (:type %) :drill-thru/quick-filter)
                                (lib/available-drill-thrus query -1 context))]
      (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru
               :type      :drill-thru/quick-filter
               :operators [{:name "="}
                           {:name "≠"}
                           {:name "contains"}
                           {:name "does-not-contain"}]
               :value     "text"
               :column    {:name "BODY"}}
              drill))
      (testing "Should include :value in the display info (#33560)"
        (is (=? {:type      :drill-thru/quick-filter
                 :operators ["=" "≠" "contains" "does-not-contain"]
                 :value     "text"}
                (lib/display-info query drill))))
      (testing "apply drills"
        (testing :contains
          (is (=? {:stages [{:filters [[:contains {} [:field {} (meta/id :reviews :body)] "text"]]}]}
                  (lib/drill-thru query -1 drill "contains"))))
        (testing :does-not-contain
          (is (=? {:stages [{:filters [[:does-not-contain {} [:field {} (meta/id :reviews :body)] "text"]]}]}
                  (lib/drill-thru query -1 drill "does-not-contain"))))))))
