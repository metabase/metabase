(ns metabase.driver.sql-jdbc.sync.common-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [test :as mt]]
            [metabase.driver.sql-jdbc.sync.common :as common]
            [metabase.models.table :refer [Table]]))

(deftest simple-select-probe-query-test
  (testing "simple-select-probe-query shouldn't actually return any rows"
    (let [{:keys [name schema]} (Table (mt/id :venues))]
      (is (= []
             (mt/rows
               (qp/process-query
                (let [[sql] (common/simple-select-probe-query (or driver/*driver* :h2) schema name)]
                  (mt/native-query {:query sql})))))))))
