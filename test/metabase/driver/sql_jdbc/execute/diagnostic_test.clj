(ns metabase.driver.sql-jdbc.execute.diagnostic-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.execute.diagnostic
    :as sql-jdbc.execute.diagnostic]
   [metabase.driver.sql-jdbc.test-util :as sql-jdbc.tu]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest diagnostic-info-capture-test
  (mt/test-drivers (sql-jdbc.tu/sql-jdbc-drivers)
    (testing "DW connection pool diagnostic info should be captured correctly"
      (sql-jdbc.execute.diagnostic/capturing-diagnostic-info [diag-info-fn]
        ;; sanity check
        (is (= 1
               (-> (mt/formatted-rows [int]
                     (mt/run-mbql-query checkins
                                        {:fields [$id]
                                         :filter [:= $id 1]}))
                   ffirst)))
        ;; now, check the actual diagnostic info map
        (let [diag-info (diag-info-fn)]
          (is (map? diag-info))
          (let [{:keys [::sql-jdbc.execute.diagnostic/driver
                        ::sql-jdbc.execute.diagnostic/database-id
                        ::sql-jdbc.execute.diagnostic/active-connections
                        ::sql-jdbc.execute.diagnostic/total-connections]} diag-info]
            ;; the diag info driver should match the current one
            (is (= driver/*driver* driver))
            ;; the diag info database-id should also match the current one
            (is (= (u/the-id (mt/db)) database-id))
            ;; the active connections may be between 0 and total-connections (inclusive)
            (is (<= 0 active-connections total-connections))))))))
