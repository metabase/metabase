(ns metabase.driver.druid.sync-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

(deftest sync-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (testing "describe-database"
        (is (= {:tables #{{:schema nil, :name "checkins"}}}
               (driver/describe-database :druid (mt/db)))))

      (testing "describe-table"
        (is (= {:schema nil
                :name   "checkins"
                :fields #{{:name "count",               :base-type :type/Integer,          :database-type "LONG [metric]"}
                          {:name "id",                  :base-type :type/Text,             :database-type "STRING"}
                          {:name "timestamp",           :base-type :type/Instant,          :database-type "timestamp", :pk? true}
                          {:name "user_last_login",     :base-type :type/Text,             :database-type "STRING"}
                          {:name "user_name",           :base-type :type/Text,             :database-type "STRING"}
                          {:name "user_password",       :base-type :type/Text,             :database-type "STRING"}
                          {:name "venue_category_name", :base-type :type/Text,             :database-type "STRING"}
                          {:name "venue_latitude",      :base-type :type/Text,             :database-type "STRING"}
                          {:name "venue_longitude",     :base-type :type/Text,             :database-type "STRING"}
                          {:name "venue_name",          :base-type :type/Text,             :database-type "STRING"}
                          {:name "venue_price",         :base-type :type/Text,             :database-type "STRING"}}}
               (driver/describe-table :druid (mt/db) {:name "checkins"})))))))
