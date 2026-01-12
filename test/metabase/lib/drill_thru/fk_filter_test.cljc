(ns metabase.lib.drill-thru.fk-filter-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing use-fixtures]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(use-fixtures :each lib.drill-thru.tu/with-native-card-id)

(deftest ^:parallel fk-filter-availability-test
  (testing "fk-filter is available for cell clicks on FKs with any value including NULL"
    (doseq [[test-case context {:keys [click column-type]}] (canned/canned-clicks)]
      (if (and (= click :cell)
               (= column-type :fk))
        (is (canned/returned test-case context :drill-thru/fk-filter))
        (is (not (canned/returned test-case context :drill-thru/fk-filter)))))))

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

(deftest ^:parallel returns-fk-filter-test-3
  (testing "`fk-filter` should get returned for fk column that was used as breakout (#34440)"
    (lib.drill-thru.tu/test-returns-drill
     {:drill-type  :drill-thru/fk-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "PRODUCT_ID"
      :expected    {:type :drill-thru/fk-filter}})))

(deftest ^:parallel do-not-return-fk-filter-for-non-fk-column-test
  (testing "fk-filter should not get returned for non-fk column (#34440)"
    (lib.drill-thru.tu/test-drill-not-returned
     {:drill-type  :drill-thru/fk-filter
      :click-type  :cell
      :query-type  :aggregated
      :column-name "max"})))

(deftest ^:parallel return-fk-filter-for-null-fk-test
  (testing "#35561 FK filter drill should be available for NULL FK values to filter by IS NULL"
    (let [test-case            {:drill-type  :drill-thru/fk-filter
                                :click-type  :cell
                                :query-type  :unaggregated
                                :column-name "PRODUCT_ID"
                                :expected    {:type :drill-thru/fk-filter}}
          row        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row])]
      (testing "returned with non-NULL value"
        (lib.drill-thru.tu/test-returns-drill test-case))
      (testing "returned with NULL value"
        (lib.drill-thru.tu/test-returns-drill
         (assoc test-case :custom-row (assoc row "PRODUCT_ID" nil)))))))

(deftest ^:parallel fk-filter-on-model-test
  (testing "FK filter drill should not appear on native query models (#35689, #36633)"
    (let [native-metadata   (fn [col]
                              (-> col
                                  (assoc :lib/source :source/native)
                                  (dissoc :id :table-id)))
          orders-id         (native-metadata (meta/field-metadata :orders :id))
          orders-user-id    (native-metadata (meta/field-metadata :orders :user-id))
          orders-product-id (native-metadata (meta/field-metadata :orders :product-id))
          query             (lib/native-query meta/metadata-provider
                                              "SELECT id, user_id, product_id FROM ORDERS LIMIT 10;"
                                              {:lib/type :metadata/results
                                               :columns  [orders-id orders-user-id orders-product-id]}
                                              nil)
          context           {:column     orders-user-id
                             :column-ref (lib/ref orders-user-id)
                             :value      1
                             :row        [{:column     orders-id
                                           :column-ref (lib/ref orders-id)
                                           :value      6}
                                          {:column     orders-user-id
                                           :column-ref (lib/ref orders-user-id)
                                           :value      1}
                                          {:column     orders-product-id
                                           :column-ref (lib/ref orders-product-id)
                                           :value      60}]}
          drills            (lib/available-drill-thrus query context)
          fk-filter-drill   (m/find-first #(= (:type %) :drill-thru/fk-filter)
                                          drills)]
      (testing "Drill should not be returned"
        (is (nil? fk-filter-drill))))))

(deftest ^:parallel fk-filter-display-info-test
  (let [base            (lib/query meta/metadata-provider (meta/table-metadata :checkins))
        join-clause     (lib/join-clause
                         (meta/table-metadata :venues)
                         [(lib/=
                           (meta/field-metadata :checkins :venue-id)
                           (meta/field-metadata :venues :id))])
        query           (-> base
                            (lib/join join-clause)
                            (lib/with-fields [(meta/field-metadata :checkins :id)
                                              (lib/with-join-alias (meta/field-metadata :venues :id) "Venues")
                                              (lib/with-join-alias (meta/field-metadata :venues :category-id) "Venues")]))
        [checkins-id
         venues-id
         category-id]   (lib/returned-columns query)
        context         {:column     category-id
                         :column-ref (lib/ref category-id)
                         :value      2
                         :row        [{:column     checkins-id
                                       :column-ref (lib/ref checkins-id)
                                       :value      1}
                                      {:column     venues-id
                                       :column-ref (lib/ref venues-id)
                                       :value      12}
                                      {:column     category-id
                                       :column-ref (lib/ref category-id)
                                       :value      2}]}
        fk-filter-drill (m/find-first #(= (:type %) :drill-thru/fk-filter)
                                      (lib/available-drill-thrus query context))]
    (is (=? {:lib/type    :metabase.lib.drill-thru/drill-thru,
             :type        :drill-thru/fk-filter
             :filter      [:= {} [:field {:join-alias "Venues"} (meta/id :venues :category-id)] 2]
             :column-name "Venues → Category ID"
             :table-name  "Checkins"}
            fk-filter-drill))
    (is (= {:type :drill-thru/fk-filter
            :column-name "Venues → Category ID"
            :table-name "Checkins"}
           (lib/display-info query fk-filter-drill)))))

(deftest ^:parallel fk-filter-application-test
  (testing "adds an = filter for the selected column and value"
    (testing "in the same stage for a plain query"
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "USER_ID"
        :drill-type     :drill-thru/fk-filter
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-filter
                         :column-name "User ID"
                         :table-name  string?}
        :expected-query {:stages [{:filters [[:= {}
                                              [:field {} (lib.drill-thru.tu/field-key=
                                                          "USER_ID" (meta/id :orders :user-id))]
                                              (get-in lib.drill-thru.tu/test-queries
                                                      ["ORDERS" :unaggregated :row "USER_ID"])]]}]}}))
    (testing "in a new stage for an aggregated query"
      (lib.drill-thru.tu/test-drill-application
       {:click-type      :cell
        :query-type      :aggregated
        :column-name     "PRODUCT_ID"
        :drill-type      :drill-thru/fk-filter
        :expected        {:lib/type  :metabase.lib.drill-thru/drill-thru
                          :type      :drill-thru/fk-filter
                          :column-name "Product ID"
                          :table-name  string?}
        :expected-query  {:stages [(-> (get lib.drill-thru.tu/test-queries "ORDERS") :aggregated :query :stages first)
                                   {:filters [[:= {} [:field {} (meta/id :orders :product-id)]
                                               (get-in lib.drill-thru.tu/test-queries
                                                       ["ORDERS" :aggregated :row "PRODUCT_ID"])]]}]}
        :expected-native {:stages [{:filters [[:= {} [:field {} "PRODUCT_ID"]
                                               (get-in lib.drill-thru.tu/test-queries
                                                       ["ORDERS" :aggregated :row "PRODUCT_ID"])]]}]}})))

  (testing "adds an is-null filter for NULL FK values"
    (let [row (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row])]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "PRODUCT_ID"
        :custom-row     (assoc row "PRODUCT_ID" nil)
        :drill-type     :drill-thru/fk-filter
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-filter
                         :column-name "Product ID"
                         :table-name  string?}
        :expected-query {:stages [{:filters [[:is-null {}
                                              [:field {} (lib.drill-thru.tu/field-key=
                                                          "PRODUCT_ID" (meta/id :orders :product-id))]]]}]}}))))
