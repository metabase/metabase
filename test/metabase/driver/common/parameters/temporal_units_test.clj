(ns metabase.driver.common.parameters.temporal-units-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest can-compile-temporal-units-test
  (mt/test-drivers (mt/normal-drivers-with-feature :native-parameters :native-temporal-units)
    (testing "temporal unit parameters"
      (let [base-query (mt/arbitrary-select-query driver/*driver* :orders (format "{{mb.time_grouping('time-unit', %s)}}" "'created_at'"))
            query (assoc (mt/native-query
                           (assoc base-query
                                  :template-tags {"time-unit" {:name "id"
                                                               :display-name "id"
                                                               :type         :temporal-unit}}))
                         :parameters [{:type   :temporal-unit
                                       :name   "time-unit"
                                       :target [:dimension [:template-tag "time-unit"]]
                                       :value  "year"}])]
        (mt/with-native-query-testing-context query
          (is (= [[1 "2019-01-01T00:00:00Z"]
                  [2 "2018-01-01T00:00:00Z"]
                  [3 "2019-01-01T00:00:00Z"]]
                 (mt/rows (qp/process-query query)))))))))
