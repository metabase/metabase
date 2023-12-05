(ns metabase.lib.drill-thru.fk-filter-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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
    (let [test-case           {:click-type  :cell
                               :query-type  :aggregated
                               :column-name "max"}
          {:keys [query row]} (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context             (lib.drill-thru.tu/test-case-context query row test-case)]
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drills (into #{}
                           (map :type)
                           (lib/available-drill-thrus query context))]
          (testing (str "\nAvailable drills =\n" (u/pprint-to-str drills))
            (is (not (contains? drills :drill-thru/fk-filter)))))))))

(deftest ^:parallel do-not-return-fk-filter-for-null-fk-test
  (testing "#13957 if this is an FK column but the value clicked is NULL, don't show the FK filter drill"
    (let [test-case            {:click-type  :cell
                                :query-type  :unaggregated
                                :column-name "PRODUCT_ID"}
          {:keys [query row]}  (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context              (lib.drill-thru.tu/test-case-context query row test-case)
          drill-types          #(->> % (lib/available-drill-thrus query) (map :type) set)]
      (is (contains? (drill-types context)
                     :drill-thru/fk-filter))
      (is (not (contains? (drill-types (assoc context :value :null))
                          :drill-thru/fk-filter))))))

(deftest ^:parallel fk-filter-on-model-test
  (testing "FK filter drill should work correctly for native query models (#35689)"
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
      (testing "Drill should be returned"
        (is (=? {:lib/type    :metabase.lib.drill-thru/drill-thru
                 :type        :drill-thru/fk-filter
                 :filter      [:= {} [:field {} "USER_ID"] 1]
                 :column-name "User ID"
                 :table-name  "Native query"}
                fk-filter-drill)))
      (when fk-filter-drill
        (testing "Drill application"
          (testing "Should introduce another query stage"
            (is (=? {:lib/type :mbql/query
                     :stages   [{:lib/type :mbql.stage/native,
                                 :native   "SELECT id, user_id, product_id FROM ORDERS LIMIT 10;"}
                                {:lib/type :mbql.stage/mbql,
                                 :filters  [[:= {} [:field {} "USER_ID"] 1]]}]}
                    (lib/drill-thru query -1 fk-filter-drill))))
          (testing "Query already has another stage after the native stage -- add filter to existing stage"
            (let [query (-> (lib/append-stage query)
                            (lib/filter (lib/> 3 1)))]
              (is (=? {:lib/type :mbql/query
                       :stages   [{:lib/type :mbql.stage/native,
                                   :native   "SELECT id, user_id, product_id FROM ORDERS LIMIT 10;"}
                                  {:lib/type :mbql.stage/mbql,
                                   :filters  [[:> {} 3 1]
                                              [:= {} [:field {} "USER_ID"] 1]]}]}
                      (lib/drill-thru query 0 fk-filter-drill))))))))))

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
