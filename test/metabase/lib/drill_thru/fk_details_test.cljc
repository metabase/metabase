(ns metabase.lib.drill-thru.fk-details-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [medley.core :as m]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.lib.test-metadata :as meta]
   [metabase.util :as u]
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

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
            (is (not (contains? drills :drill-thru/fk-details)))))))))

(deftest ^:parallel apply-fk-details-test
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [test-case           {:click-type  :cell
                               :query-type  :unaggregated
                               :column-name "PRODUCT_ID"}
          {:keys [query row]} (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context             (lib.drill-thru.tu/test-case-context query row test-case)]
      (is (get row "PRODUCT_ID"))
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drill (m/find-first #(= (:type %) :drill-thru/fk-details)
                                  (lib/available-drill-thrus query context))]
          (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru
                   :type      :drill-thru/fk-details,
                   :column    {:name "PRODUCT_ID"}
                   :object-id (get row "PRODUCT_ID")
                   :many-pks? false}
                  drill))
          (is (=? {:stages [{:source-table (meta/id :products)
                             :filters      [[:= {}
                                             [:field {} (meta/id :products :id)]
                                             (get row "PRODUCT_ID")]]}]}
                  (lib/drill-thru query -1 drill))))))))

(deftest ^:parallel apply-fk-details-test-2
  (testing "fk-details should create a correct query for fk target table (#34383)"
    (let [test-case           {:click-type  :cell
                               :query-type  :unaggregated
                               :column-name "USER_ID"}
          {:keys [query row]} (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context             (lib.drill-thru.tu/test-case-context query row test-case)]
      (is (get row "USER_ID"))
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drill (m/find-first #(= (:type %) :drill-thru/fk-details)
                                  (lib/available-drill-thrus query context))]
          (is (=? {:lib/type  :metabase.lib.drill-thru/drill-thru
                   :type      :drill-thru/fk-details,
                   :column    {:name "USER_ID"}
                   :object-id (get row "USER_ID")
                   :many-pks? false}
                  drill))
          (is (=? {:stages [{:source-table (meta/id :people)
                             :filters      [[:= {}
                                             [:field {} (meta/id :people :id)]
                                             (get row "USER_ID")]]}]}
                  (lib/drill-thru query -1 drill))))))))
