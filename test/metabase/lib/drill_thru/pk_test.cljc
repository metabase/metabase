(ns metabase.lib.drill-thru.pk-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel do-not-return-pk-for-nil-test
  (testing "do not return pk drills for nil cell values (#36126)"
    ;; simulate a table with multiple PK columns: mark orders.product-id as a PK column
    (let [metadata-provider (lib.tu/merged-mock-metadata-provider
                             meta/metadata-provider
                             {:fields [{:id            (meta/id :orders :product-id)
                                        :semantic-type :type/PK}]})
          query             (lib/query metadata-provider (meta/table-metadata :orders))
          context           {:column     (meta/field-metadata :orders :id)
                             :column-ref (lib/ref (meta/field-metadata :orders :id))
                             :value      :null
                             :row        [{:column     (meta/field-metadata :orders :id)
                                           :column-ref (lib/ref (meta/field-metadata :orders :id))
                                           :value      nil}]}]
      (is (not (m/find-first #(= (:type %) :drill-thru/pk)
                             (lib/available-drill-thrus query -1 context)))))))

(deftest ^:parallel return-pk-drill-for-query-with-multiple-pks-on-non-pk-columns-click-test
  (testing "should drill thru a non-PK and non-FK cell when there are multiple PK columns (#35618)"
    ;; simulate a table with multiple PK columns: mark orders.product-id as a PK column
    (let [metadata-provider   (lib.tu/merged-mock-metadata-provider
                               meta/metadata-provider
                               {:fields [{:id            (meta/id :orders :product-id)
                                          :semantic-type :type/PK}]})
          query               (lib/query metadata-provider (meta/table-metadata :orders))
          context-with-values (fn [column-value pk-1-value pk-2-value]
                                {:column     (meta/field-metadata :orders :total)
                                 :value      column-value
                                 :column-ref (lib/ref (meta/field-metadata :orders :total))
                                 :row        [{:column     (meta/field-metadata :orders :id)
                                               :column-ref (lib/ref (meta/field-metadata :orders :id))
                                               :value      pk-1-value}
                                              {:column     (meta/field-metadata :orders :product-id)
                                               :column-ref (lib/ref (meta/field-metadata :orders :product-id))
                                               :value      pk-2-value}
                                              {:column     (meta/field-metadata :orders :total)
                                               :column-ref (lib/ref (meta/field-metadata :orders :total))
                                               :value      (when-not (= column-value :null)
                                                             column-value)}]})
          find-drill          (fn [query context]
                                (m/find-first #(= (:type %) :drill-thru/pk)
                                              (lib/available-drill-thrus query -1 context)))]
      (testing "both PKs have values"
        (doseq [column-value [10 :null]]
          (let [context (context-with-values column-value 100 200)
                drill   (find-drill query context)]
            (is (=? {:lib/type   :metabase.lib.drill-thru/drill-thru
                     :type       :drill-thru/pk
                     :dimensions [{:column {:name "ID"}
                                   :value  100}
                                  {:column {:name "PRODUCT_ID"}
                                   :value  200}]}
                    drill))
            (testing "Should add one filter for each PK column (#36426)"
              (is (=? {:stages [{:filters [[:= {} [:field {} (meta/id :orders :id)] 100]
                                           [:= {} [:field {} (meta/id :orders :product-id)] 200]]}]}
                      (lib/drill-thru query -1 drill)))))))
      (testing "only one PK has a value: ignore the PK without a value"
        (let [context (context-with-values 10 100 nil)
              drill   (find-drill query context)]
          (is (=? {:lib/type   :metabase.lib.drill-thru/drill-thru
                   :type       :drill-thru/pk
                   :dimensions [{:column {:name "ID"}
                                 :value  100}]}
                  drill))
          (testing "\nShould add one filter for each PK column (#36426)"
            (is (=? {:stages [{:filters [[:= {} [:field {} (meta/id :orders :id)] 100]]}]}
                    (lib/drill-thru query -1 drill))))))
      (testing "neither PK has a value: don't return a drill at all"
        (let [context (context-with-values 10 nil nil)]
          (is (nil? (find-drill query context)))))
      (testing "ignore header clicks (column value = nil, NOT :null)"
        (let [context (context-with-values nil 100 200)]
          (is (nil? (find-drill query context))))))))
