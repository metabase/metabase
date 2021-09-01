(ns metabase.driver.druid.sync-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.test :as mt]
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
                :fields [{:name "timestamp",           :base-type :type/Instant,          :database-type "timestamp",            :database-position 0, :pk? false}
                         {:name "venue_name",          :base-type :type/Text,             :database-type "STRING",               :database-position 1}
                         {:name "user_password",       :base-type :type/Text,             :database-type "STRING",               :database-position 2}
                         {:name "venue_longitude",     :base-type :type/Float,            :database-type "DOUBLE",               :database-position 3}
                         {:name "venue_latitude",      :base-type :type/Float,            :database-type "DOUBLE",               :database-position 4}
                         {:name "venue_price",         :base-type :type/Integer,          :database-type "LONG",                 :database-position 5}
                         {:name "venue_category_name", :base-type :type/Text,             :database-type "STRING",               :database-position 6}
                         {:name "id",                  :base-type :type/Integer,          :database-type "LONG",                 :database-position 7}
                         {:name "count",               :base-type :type/Integer,          :database-type "LONG [metric]",        :database-position 8}
                         {:name "unique_users",        :base-type :type/DruidHyperUnique, :database-type "hyperUnique [metric]", :database-position 9}
                         {:name "user_name",           :base-type :type/Text,             :database-type "STRING",               :database-position 10}
                         {:name "user_last_login",     :base-type :type/Text,             :database-type "STRING",               :database-position 11}]}
               (-> (driver/describe-table :druid (mt/db) {:name "checkins"})
                   (update :fields (partial sort-by :database-position)))))))))
