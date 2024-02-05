(ns metabase.lib.drill-thru.pk-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(def ^:private multi-pk-provider
  ;; simulate a table with multiple PK columns: mark orders.product-id as a PK column
  (lib.tu/merged-mock-metadata-provider
    meta/metadata-provider
    {:fields [{:id            (meta/id :orders :product-id)
               :semantic-type :type/PK}]}))

(defn- find-drill [query context]
  (m/find-first #(= (:type %) :drill-thru/pk)
                (lib/available-drill-thrus query -1 context)))

(deftest ^:parallel pk-unavailable-for-non-cell-test
  (canned/canned-test
    :drill-thru/pk
    (fn [_test-case _context {:keys [click]}]
      ;; Tricky logic, so other tests check the cell clicks.
      ;; Non-cell clicks are not available.
      (if (= click :cell)
        ::canned/skip
        false))))

(deftest ^:parallel do-not-return-pk-for-nil-test
  (testing "do not return pk drills for nil PK values (#36126)"
    (let [query             (lib/query multi-pk-provider (meta/table-metadata :orders))
          context           {:column     (meta/field-metadata :orders :id)
                             :column-ref (lib/ref (meta/field-metadata :orders :id))
                             :value      :null
                             :row        [{:column     (meta/field-metadata :orders :id)
                                           :column-ref (lib/ref (meta/field-metadata :orders :id))
                                           :value      nil}]}]
      (is (not (find-drill query context)))

      (testing "but a nil clicked value with defined PKs is fine"
        (is (find-drill query {:column     (meta/field-metadata :orders :subtotal)
                               :column-ref (lib/ref (meta/field-metadata :orders :subtotal))
                               :value      :null
                               :row        [{:column     (meta/field-metadata :orders :id)
                                             :column-ref (lib/ref (meta/field-metadata :orders :id))
                                             :value      12}]}))))))

(deftest ^:parallel do-not-return-pk-with-aggregations-test
  (testing "PK drill is not returned when clicking an aggregation"
    (let [query                     (-> (lib/query multi-pk-provider (meta/table-metadata :orders))
                                        (lib/aggregate (lib/count))
                                        (lib/breakout (meta/field-metadata :orders :created-at)))
          {count-col  "count"
           created-at "CREATED_AT"} (m/index-by :name (lib/returned-columns query))
          count-dim                 {:column     count-col
                                     :column-ref (lib/ref count-col)
                                     :value      123}
          created-at-dim            {:column     created-at
                                     :column-ref (lib/ref count-col)
                                     :value      "2022-12-01T00:00:00+02:00"}]
      (is (not (find-drill query (merge count-dim
                                        {:row        [count-dim created-at-dim]
                                         :dimensions [created-at-dim]})))))))

(deftest ^:parallel do-not-return-pk-for-click-on-fk-test
  (testing "PK drill is not returned when clicking an FK"
    (is (not (find-drill (lib/query multi-pk-provider (meta/table-metadata :orders))
                         {:column     (meta/field-metadata :orders :user-id)
                          :column-ref (lib/ref (meta/field-metadata :orders :user-id))
                          :value      456})))))

(deftest ^:parallel return-pk-drill-for-query-with-multiple-pks-on-non-pk-columns-click-test
  (testing "should drill thru a non-PK and non-FK cell when there are multiple PK columns (#35618)"
    ;; simulate a table with multiple PK columns: mark orders.product-id as a PK column
    (let [query               (lib/query multi-pk-provider (meta/table-metadata :orders))
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
                                                             column-value)}]})]
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
