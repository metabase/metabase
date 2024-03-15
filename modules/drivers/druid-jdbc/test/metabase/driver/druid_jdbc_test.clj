(ns metabase.driver.druid-jdbc-test
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.test :as mt]
   [metabase.timeseries-query-processor-test.util :as tqpt]))

;; TODO: There are sync differences between jdbc and non-jdbc implementation. Verify it's ok!
(deftest ^:parallel sync-test
  (mt/test-driver
   :druid-jdbc
   (tqpt/with-flattened-dbdef
     (testing "describe-database"
       (is (= {:tables #{{:schema "druid", :name "checkins" :description nil}}}
              (driver/describe-database :druid-jdbc (mt/db)))))
     (testing "describe-table"
       (is (=? {:schema "druid"
                :name   "checkins"
                :fields #{{:name "__time",
                           :database-type "TIMESTAMP",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/DateTime,
                           :database-position 0,
                           :json-unfolding false}
                          {:name "count",
                           :database-type "BIGINT",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/BigInteger,
                           :database-position 10,
                           :json-unfolding false}
                          {:name "id",
                           :database-type "BIGINT",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/BigInteger,
                           :database-position 1,
                           :json-unfolding false}
                          {:name "unique_users",
                           :database-type "COMPLEX<hyperUnique>",
                           :database-required false,
                           :database-is-auto-increment false,
                          ;; TODO: Adjust the base type for complex types!
                           :base-type :type/*,
                           :database-position 11,
                           :json-unfolding false}
                          {:name "user_last_login",
                           :database-type "VARCHAR",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Text,
                           :database-position 2,
                           :json-unfolding false}
                          {:name "user_name",
                           :database-type "VARCHAR",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Text,
                           :database-position 3,
                           :json-unfolding false}
                          {:name "user_password",
                           :database-type "VARCHAR",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Text,
                           :database-position 4,
                           :json-unfolding false}
                          {:name "venue_category_name",
                           :database-type "VARCHAR",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Text,
                           :database-position 5,
                           :json-unfolding false}
                          {:name "venue_latitude",
                           :database-type "DOUBLE",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Float,
                           :database-position 6,
                           :json-unfolding false}
                          {:name "venue_longitude",
                           :database-type "DOUBLE",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Float,
                           :database-position 7,
                           :json-unfolding false}
                          {:name "venue_name",
                           :database-type "VARCHAR",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/Text,
                           :database-position 8,
                           :json-unfolding false}
                          {:name "venue_price",
                           :database-type "BIGINT",
                           :database-required false,
                           :database-is-auto-increment false,
                           :base-type :type/BigInteger,
                           :database-position 9,
                           :json-unfolding false}}}
               (driver/describe-table :druid-jdbc (mt/db) {:schema "druid" :name "checkins"})))))))

;; TODO: Find a way how to get database version using jdbc driver.
(deftest dbms-version-test
  (mt/test-driver
   :druid-jdbc
   (is (= 1 1))))
