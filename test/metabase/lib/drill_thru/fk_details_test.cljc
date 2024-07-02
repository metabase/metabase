(ns metabase.lib.drill-thru.fk-details-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.drill-thru.test-util.canned :as canned]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.metadata-providers.merged-mock :as merged-mock]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel fk-details-availability-test
  (testing "FK details is available for cell clicks on non-NULL FKs"
    (canned/canned-test
      :drill-thru/fk-details
      (fn [test-case context {:keys [click column-type]}]
        (and (= click :cell)
             (= column-type :fk)
             (not (:native? test-case))
             (not= (:value context) :null))))))

(deftest ^:parallel returns-fk-details-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-details
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "PRODUCT_ID"
    :expected    {:type      :drill-thru/fk-details
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "PRODUCT_ID"])
                  :many-pks? false}}))

(deftest ^:parallel returns-fk-details-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/fk-details
    :click-type  :cell
    :query-type  :unaggregated
    :column-name "USER_ID"
    :expected    {:type      :drill-thru/fk-details
                  :object-id (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])
                  :many-pks? false}}))

(deftest ^:parallel do-not-return-fk-details-for-non-fk-column-test
  (testing "fk-details should not get returned for non-fk column (#34441)"
    (lib.drill-thru.tu/test-drill-not-returned
     {:click-type  :cell
      :query-type  :aggregated
      :column-name "max"
      :drill-type  :drill-thru/fk-details})))

(deftest ^:parallel apply-fk-details-test
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [column-value (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "PRODUCT_ID"])]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "PRODUCT_ID"
        :drill-type     :drill-thru/fk-details
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-details
                         :column    {:name "PRODUCT_ID"}
                         :object-id column-value
                         :many-pks? false}
        :expected-query {:stages [{:source-table (meta/id :products)
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :products :id)]
                                                   column-value]]}]}}))))

(deftest ^:parallel apply-fk-details-test-2
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [column-value (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])]
      (lib.drill-thru.tu/test-drill-application
       {:click-type     :cell
        :query-type     :unaggregated
        :column-name    "USER_ID"
        :drill-type     :drill-thru/fk-details
        :expected       {:lib/type  :metabase.lib.drill-thru/drill-thru
                         :type      :drill-thru/fk-details
                         :column    {:name "USER_ID"}
                         :object-id column-value
                         :many-pks? false}
        :expected-query {:stages [{:source-table (meta/id :people)
                                   :filters      [[:= {}
                                                   [:field {} (meta/id :people :id)]
                                                   column-value]]}]}}))))

(deftest ^:parallel fk-details-on-model-test
  (testing "FK details drill should work correctly for native query models (#35689)"
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
          fk-details-drill  (m/find-first #(= (:type %) :drill-thru/fk-details)
                                          drills)]
      (testing "Drill should be returned"
        (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru
                 :type      :drill-thru/fk-details
                 :column    {:name "USER_ID"}
                 :object-id 1
                 :many-pks? false}
                fk-details-drill)))
      (when fk-details-drill
        (testing "Drill application"
          (testing "Should introduce another query stage"
            (is (=? {:stages [{:lib/type :mbql.stage/mbql,
                               :source-table (meta/id :people)
                               :filters [[:= {}
                                          [:field {} (meta/id :people :id)]
                                          1]]}]}
                    (lib/drill-thru query -1 fk-details-drill)))))))))

(deftest ^:parallel do-not-return-fk-details-for-nil-test
  (testing "do not return fk-details drills for nil cell values (#36133)"
    (let [query   (lib/query meta/metadata-provider (meta/table-metadata :orders))
          context {:column     (meta/field-metadata :orders :product-id)
                   :column-ref (lib/ref (meta/field-metadata :orders :product-id))
                   :value      :null
                   :row        [{:column     (meta/field-metadata :orders :product-id)
                                 :column-ref (lib/ref (meta/field-metadata :orders :product-id))
                                 :value      nil}]}]
      (is (not (m/find-first #(= (:type %) :drill-thru/fk-details)
                             (lib/available-drill-thrus query -1 context)))))))

(deftest ^:parallel preserve-filters-for-other-fks-forming-multi-column-pk-test
  (testing "with multiple FKs forming a multi-column PK on another table"
    (let [provider (merged-mock/merged-mock-metadata-provider
                     meta/metadata-provider
                     {:fields [;; Make Checkins.VENUE_ID + Checkins.USER_ID into a two-part primary key.
                               ;; Turn Checkins.ID into a basic numeric field.
                               {:id                 (meta/id :checkins :id)
                                :semantic-type      :type/Quantity}
                               {:id                 (meta/id :checkins :venue-id)
                                :semantic-type      :type/PK
                                :fk-target-field-id nil}
                               {:id                 (meta/id :checkins :user-id)
                                :semantic-type      :type/PK
                                :fk-target-field-id nil}

                               ;; Then turn Orders.USER_ID and Orders.PRODUCT_ID into FKs pointing at Checkins.
                               {:id                 (meta/id :orders :user-id)
                                :semantic-type      :type/FK
                                :fk-target-field-id (meta/id :checkins :user-id)}
                               {:id                 (meta/id :orders :product-id)
                                :semantic-type      :type/FK
                                :fk-target-field-id (meta/id :checkins :venue-id)}]})
          ;; Then we can treat them as a two-part FK aimed at a two-part PK.
          query          (-> (lib/query provider (meta/table-metadata :orders))
                             ;; This filter should get removed when filtering by the FK.
                             (lib/filter (lib/= (meta/field-metadata :orders :quantity) 1)))
          venue-id       (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "PRODUCT_ID"])
          user-id        (get-in lib.drill-thru.tu/test-queries ["ORDERS" :unaggregated :row "USER_ID"])
          #_#_filtered-venue (-> basic
                             (lib/filter (lib/= (lib.metadata/field basic (meta/id :orders :product-id))
                                                (get-in lib.drill-thru.tu/test-queries
                                                        ["ORDERS" :unaggregated :row "PRODUCT_ID"]))))
          ]
      (testing "work as normal with no related filter"
        (lib.drill-thru.tu/test-drill-application
          {:column-name    "PRODUCT_ID"
           :click-type     :cell
           :query-type     :unaggregated
           :custom-query   query
           :drill-type     :drill-thru/fk-details
           :expected       {:type            :drill-thru/fk-details
                            :column          (m/find-first #(= (:name %) "PRODUCT_ID") (lib/returned-columns query))
                            :object-id       venue-id
                            ;; TODO: This field actually refers to the source table, not the target one. Is that right?
                            ;; Tech Debt Issue: #39409
                            :many-pks?       false}
           :expected-query {:stages [{:filters [[:= {} [:field {} (meta/id :checkins :venue-id)] venue-id]]}]}}))

      (testing "preserve any existing filter for another PK on the same table"
        (testing "existing USER_ID, new \"VENUE_ID\" (really PRODUCT_ID)"
          (let [filtered-user (lib/filter query (lib/= (lib.metadata/field query (meta/id :orders :user-id)) user-id))]
            (lib.drill-thru.tu/test-drill-application
              {:column-name    "PRODUCT_ID"
               :click-type     :cell
               :query-type     :unaggregated
               :custom-query   filtered-user
               :drill-type     :drill-thru/fk-details
               :expected       {:type            :drill-thru/fk-details
                                :column          (m/find-first #(= (:name %) "PRODUCT_ID")
                                                               (lib/returned-columns filtered-user))
                                :object-id       venue-id
                                :many-pks?       false}
               :expected-query
               {:stages [{:filters [[:= {} [:field {} (meta/id :checkins :user-id)]  user-id]
                                    [:= {} [:field {} (meta/id :checkins :venue-id)] venue-id]]}]}})))
        (testing "existing \"VENUE_ID\" (really PRODUCT_ID), new USER_ID"
          (let [filtered-venue (lib/filter query (lib/= (lib.metadata/field query (meta/id :orders :product-id))
                                                        venue-id))]
            (lib.drill-thru.tu/test-drill-application
              {:column-name    "USER_ID"
               :click-type     :cell
               :query-type     :unaggregated
               :custom-query   filtered-venue
               :drill-type     :drill-thru/fk-details
               :expected       {:type            :drill-thru/fk-details
                                :column          (m/find-first #(= (:name %) "USER_ID")
                                                               (lib/returned-columns filtered-venue))
                                :object-id       user-id
                                :many-pks?       false}
               :expected-query
               {:stages [{:filters [[:= {} [:field {} (meta/id :checkins :venue-id)] venue-id]
                                    [:= {} [:field {} (meta/id :checkins :user-id)]  user-id]]}]}})))))))
