(ns metabase.lib.drill-thru.foreign-key-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.core :as lib]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.util :as u]))

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
