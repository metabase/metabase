(ns ^:mb/driver-tests metabase.driver.hive-like-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.query-processor :as qp]
   [metabase.test :as mt]))

(deftest ^:parallel database-type->base-type-test
  (testing "make sure the various types we use for running tests are actually mapped to the correct DB type"
    (are [db-type expected] (= expected
                               (sql-jdbc.sync/database-type->base-type :hive-like db-type))
      :string    :type/Text
      :int       :type/Integer
      :date      :type/Date
      :timestamp :type/DateTime
      :double    :type/Float)))

(deftest ^:parallel array-test
  (mt/test-drivers (mt/driver-select {:+parent :hive-like})
    (let [query (mt/native-query {:query "select array(1,2,1)"})]
      (is (= [["[1 2 3]"]]
             (mt/rows (qp/process-query query)))))))
