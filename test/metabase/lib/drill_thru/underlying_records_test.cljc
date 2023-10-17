(ns metabase.lib.drill-thru.underlying-records-test
  (:require
   [clojure.test :refer [deftest testing is]]
   [metabase.lib.drill-thru.test-util :as lib.drill-thru.tu]
   [metabase.util :as u]
   [metabase.lib.drill-thru.underlying-records :as lib.drill-thru.underlying-records]
   [metabase.lib.core :as lib]))

(deftest ^:parallel returns-underlying-records-test-1
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "count"
    :expected    {:type :drill-thru/underlying-records, :row-count 3, :table-name "Orders"}}))

(deftest ^:parallel returns-underlying-records-test-2
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "sum"
    :expected    {:type :drill-thru/underlying-records, :row-count 3, :table-name "Orders"}}))

(deftest ^:parallel returns-underlying-records-test-3
  (lib.drill-thru.tu/test-returns-drill
   {:drill-type  :drill-thru/underlying-records
    :click-type  :cell
    :query-type  :aggregated
    :column-name "max"
    :expected    {:type :drill-thru/underlying-records, :row-count 3, :table-name "Orders"}}))

(deftest ^:parallel do-not-return-fk-filter-for-non-fk-column-test
  (testing "underlying-records should only get shown once for aggregated query (#34439)"
    (let [test-case           {:click-type  :cell
                               :query-type  :aggregated
                               :column-name "max"}
          {:keys [query row]} (lib.drill-thru.tu/query-and-row-for-test-case test-case)
          context             (lib.drill-thru.tu/test-case-context query row test-case)]
      (testing (str "\nQuery = \n"   (u/pprint-to-str query)
                    "\nContext =\n" (u/pprint-to-str context))
        (let [drills       (lib/available-drill-thrus query context)]
          (testing (str "\nAvailable drills =\n" (u/pprint-to-str drills))
            (is (= 1
                   (count (filter #(= (:type %) :drill-thru/underlying-records)
                                  drills))))))))))
